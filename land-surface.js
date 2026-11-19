// Camera-centred, nested terrain rings. The nearest ring samples twice per
// height texel. Fine outer edges meet the straight edges of the next ring.
class LandSurface {
  constructor(gl,program){
    this.gl=gl;this.program=program;
    const vertices=[],indices=[],half=24;
    for(let level=0;level<6;level++){
      const step=2**(level-1),width=half*2+1,start=vertices.length/4;
      for(let z=-half;z<=half;z++)for(let x=-half;x<=half;x++){
        const edge=level<5;
        const stitchX=edge&&Math.abs(z)===half&&Math.abs(x)%2===1?step:0;
        const stitchZ=edge&&Math.abs(x)===half&&Math.abs(z)%2===1?step:0;
        vertices.push(x*step,z*step,stitchX,stitchZ);
        if(x===half||z===half)continue;
        if(level && x>=-half/2 && x<half/2 && z>=-half/2 && z<half/2)continue;
        const a=start+(z+half)*width+x+half,b=a+width;
        indices.push(a,b,a+1,a+1,b,b+1);
      }
    }
    this.offsets=new Float32Array(vertices);this.pos=new Float32Array(vertices.length/4*3);
    this.vao=gl.createVertexArray();gl.bindVertexArray(this.vao);
    this.buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER,this.pos.byteLength,gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);gl.vertexAttribPointer(0,3,gl.FLOAT,false,0,0);
    const elements=gl.createBuffer();gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER,elements);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER,new Uint16Array(indices),gl.STATIC_DRAW);
    gl.bindVertexArray(null);this.count=indices.length;
  }
  draw(cam,vp,heights){
    const gl=this.gl,{CELL,N,E1,E2}=WORLD;
    // Heights live at texel centres. Snap in the terrain's own coordinate system.
    const cx=Math.round(((cam.pos[0]*E1[0]+cam.pos[2]*E1[1])/CELL-.5)/4)*4;
    const cz=Math.round(((cam.pos[0]*E2[0]+cam.pos[2]*E2[1])/CELL-.5)/4)*4;
    if(cx!==this.x || cz!==this.z){
      this.x=cx;this.z=cz;
      const wrap=N-1,inv=1/(E1[0]*E1[0]+E1[1]*E1[1]);
      function sample(x,z){
        const a=Math.floor(x),b=Math.floor(z),dx=x-a,dz=z-b;
        const row=(b&wrap)*N,next=((b+1)&wrap)*N,left=a&wrap,right=(a+1)&wrap;
        const h=heights[row+left];
        if(!dx&&!dz)return h;
        return (h+(heights[row+right]-h)*dx)*(1-dz)+(heights[next+left]*(1-dx)+heights[next+right]*dx)*dz;
      }
      for(let i=0,j=0;i<this.offsets.length;i+=4,j+=3){
        const x=cx+this.offsets[i],z=cz+this.offsets[i+1],sx=this.offsets[i+2],sz=this.offsets[i+3];
        this.pos[j]=((x+.5)*E1[0]+(z+.5)*E2[0])*CELL*inv;
        this.pos[j+1]=sx||sz?(sample(x-sx,z-sz)+sample(x+sx,z+sz))*.5:sample(x,z);
        this.pos[j+2]=((x+.5)*E1[1]+(z+.5)*E2[1])*CELL*inv;
      }
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.pos);
    }
    gl.useProgram(this.program.p);gl.uniformMatrix4fv(this.program.u('uVP'),false,vp);
    gl.bindVertexArray(this.vao);gl.drawElements(gl.TRIANGLES,this.count,gl.UNSIGNED_SHORT,0);
  }
}
