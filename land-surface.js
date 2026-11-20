// Camera-centred, nested terrain rings. The nearest ring samples twice per
// height texel. Fine outer edges meet the straight edges of the next ring.
class LandSurface {
  constructor(gl,program){
    this.gl=gl;this.program=program;
    const vertices=[],indices=[],half=24;
    this.tiles=[];this.clip=new Float64Array(16);
    for(let level=0;level<6;level++){
      const step=2**(level-1),width=half*2+1,grid=new Uint16Array(width*width);
      for(let z=-half;z<=half;z++)for(let x=-half;x<=half;x++){
        // Interior vertices of an outer ring are never indexed. Keep its seam on both sides.
        if(level && Math.abs(x)<half/2 && Math.abs(z)<half/2)continue;
        grid[(z+half)*width+x+half]=vertices.length/4;
        const edge=level<5;
        const stitchX=edge&&Math.abs(z)===half&&Math.abs(x)%2===1?step:0;
        const stitchZ=edge&&Math.abs(x)===half&&Math.abs(z)%2===1?step:0;
        vertices.push(x*step,z*step,stitchX,stitchZ);
      }
      const tile=half/2;
      for(let z0=-half;z0<half;z0+=tile)for(let x0=-half;x0<half;x0+=tile){
        if(level && x0>=-tile && x0<tile && z0>=-tile && z0<tile)continue;
        this.tiles.push({x:(x0+tile/2)*step,z:(z0+tile/2)*step,half:tile*step/2,first:indices.length});
        for(let z=z0;z<z0+tile;z++)for(let x=x0;x<x0+tile;x++){
          const a=(z+half)*width+x+half,b=a+width;
          indices.push(grid[a],grid[b],grid[a+1],grid[a+1],grid[b],grid[b+1]);
        }
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
      this.midX=((cx+.5)*E1[0]+(cz+.5)*E2[0])*CELL*inv;
      this.midZ=((cx+.5)*E1[1]+(cz+.5)*E2[1])*CELL*inv;
      this.unit=CELL*inv;
      let low=Infinity,high=-Infinity;
      for(let i=0,j=0;i<this.offsets.length;i+=4,j+=3){
        const x=cx+this.offsets[i],z=cz+this.offsets[i+1],sx=this.offsets[i+2],sz=this.offsets[i+3];
        this.pos[j]=((x+.5)*E1[0]+(z+.5)*E2[0])*CELL*inv;
        this.pos[j+1]=sx||sz?(sample(x-sx,z-sz)+sample(x+sx,z+sz))*.5:sample(x,z);
        low=Math.min(low,this.pos[j+1]);high=Math.max(high,this.pos[j+1]);
        this.pos[j+2]=((x+.5)*E1[1]+(z+.5)*E2[1])*CELL*inv;
      }
      this.midY=(low+high)*.5;this.halfY=(high-low)*.5;
      gl.bindBuffer(gl.ARRAY_BUFFER,this.buffer);gl.bufferSubData(gl.ARRAY_BUFFER,0,this.pos);
    }
    gl.useProgram(this.program.p);gl.uniformMatrix4fv(this.program.u('uVP'),false,vp);
    // Transform the four side planes into grid space. Reject only a tile entirely
    // outside a plane, including its full height range and stitched edge vertices.
    const clip=this.clip;
    for(let p=0;p<4;p++){
      const row=p>>1,sign=p%2?-1:1;
      const a=vp[3]+sign*vp[row],b=vp[7]+sign*vp[row+4],c=vp[11]+sign*vp[row+8];
      const u=(a*E1[0]+c*E1[1])*this.unit,v=(a*E2[0]+c*E2[1])*this.unit;
      clip[p*4]=a*this.midX+b*this.midY+c*this.midZ+vp[15]+sign*vp[row+12]+Math.abs(b)*this.halfY+1;
      clip[p*4+1]=u;clip[p*4+2]=v;clip[p*4+3]=Math.abs(u)+Math.abs(v);
    }
    gl.bindVertexArray(this.vao);
    let start=-1;
    for(const tile of this.tiles){
      let visible=true;
      for(let p=0;p<16;p+=4){
        if(clip[p]+clip[p+1]*tile.x+clip[p+2]*tile.z+clip[p+3]*tile.half<0){visible=false;break;}
      }
      if(visible && start<0)start=tile.first;
      if(!visible && start>=0){gl.drawElements(gl.TRIANGLES,tile.first-start,gl.UNSIGNED_SHORT,start*2);start=-1;}
    }
    if(start>=0)gl.drawElements(gl.TRIANGLES,this.count-start,gl.UNSIGNED_SHORT,start*2);
  }
}
