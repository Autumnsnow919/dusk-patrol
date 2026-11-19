// Continuous collision tests for translated game meshes. All coordinates match the renderer.
const {buildPlane}=require('./airframes.js');
const Lake=require('./lake.js');
const Flight=require('./flight.js');
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=v=>{const len=Math.hypot(...v);return v.map(x=>x/(len||1));};
const basisOf=f=>{const r=unit(cross(f,Math.abs(f[1])>.99?[1,0,0]:[0,1,0]));return {r,u:cross(r,f),f};};
const local=(p,b)=>[dot(p,b.r),dot(p,b.u),dot(p,b.f)];
const world=(p,b)=>p.map((_,i)=>b.r[i]*p[0]+b.u[i]*p[1]+b.f[i]*p[2]);
const identity={r:[1,0,0],u:[0,1,0],f:[0,0,1]};
const cells=[],models=new Map();
const size=1.5;
buildPlane('bolt',cells);
function distinct(list,v){
  const len=Math.hypot(...v);if(len<1e-8)return;
  v=v.map(n=>n/len);
  if(!list.some(a=>Math.abs(dot(a,v))>.999999))list.push(v);
}
const hulls=cells.map(rings=>{
  const verts=rings.flat().map(p=>p.map(v=>v*size)),k=rings[0].length;
  const sides=[Array.from({length:k},(_,i)=>i),Array.from({length:k},(_,i)=>k+i)];
  for(let i=0;i<k;i++){const j=(i+1)%k;sides.push([i,j,j+k,i+k]);}
  const axes=[],edges=[],planes=[];
  const center=[0,1,2].map(i=>verts.reduce((sum,p)=>sum+p[i],0)/verts.length);
  for(const face of sides){
    const a=verts[face[0]],b=verts[face[1]],c=verts[face[2]];
    let n=unit(cross(sub(b,a),sub(c,a)));
    if(dot(n,sub(center,a))>0)n=n.map(v=>-v);
    planes.push([n,dot(n,a)]);distinct(axes,n);
    for(let i=0;i<face.length;i++)distinct(edges,sub(verts[face[(i+1)%face.length]],verts[face[i]]));
  }
  return {verts,axes,edges,planes};
});
const radius=Math.max(...hulls.flatMap(h=>h.verts.map(v=>Math.hypot(...v))));
function bounds(tris){
  return [0,1,2].flatMap(i=>[Math.min(...tris.map(t=>t.box[2*i])),Math.max(...tris.map(t=>t.box[2*i+1]))]);
}
function tree(tris){
  const box=bounds(tris);
  if(tris.length<=10)return {box,tris};
  let axis=0;
  for(const i of [2,4])if(box[i+1]-box[i]>box[axis+1]-box[axis])axis=i;
  tris.sort((a,b)=>a.box[axis]+a.box[axis+1]-b.box[axis]-b.box[axis+1]);
  const mid=tris.length>>1;return {box,left:tree(tris.slice(0,mid)),right:tree(tris.slice(mid))};
}
function model(type){
  if(models.has(type))return models.get(type);
  const scenery=type==='scenery',data=scenery?Lake.vertices():buildPlane(type).data,scale=scenery?1:1.3,tris=[];
  for(let i=0;i<data.length;i+=30){
    const mat=data[i+9];if([12,13,14].includes(mat))continue;
    const p=[0,10,20].map(off=>[0,1,2].map(j=>data[i+off+j]*scale));
    const box=[0,1,2].flatMap(j=>[Math.min(p[0][j],p[1][j],p[2][j]),Math.max(p[0][j],p[1][j],p[2][j])]);
    if(mat>=6)for(let d=0;d<6;d++)box[d]+=(d%2?1:-1)*6.5;
    tris.push({p,box,mat});
  }
  const root=tree(tris);models.set(type,root);return root;
}
function overlaps(a,b){return a[0]<=b[1]&&a[1]>=b[0]&&a[2]<=b[3]&&a[3]>=b[2]&&a[4]<=b[5]&&a[5]>=b[4];}
function sweepTriangle(h,p,motion,until){
  let enter=0,exit=until;
  function axis(n){
    let lo=Infinity,hi=-Infinity;
    for(const v of h.verts){const d=dot(v,n);lo=Math.min(lo,d);hi=Math.max(hi,d);}
    const a=dot(p[0],n),b=dot(p[1],n),c=dot(p[2],n);
    const near=Math.min(a,b,c)-hi,far=Math.max(a,b,c)-lo,speed=dot(motion,n);
    if(Math.abs(speed)<1e-9)return near<=1e-8&&far>=-1e-8;
    const t=near/speed,u=far/speed;
    enter=Math.max(enter,Math.min(t,u));exit=Math.min(exit,Math.max(t,u));
    return enter<=exit;
  }
  for(const n of h.axes)if(!axis(n))return Infinity;
  const e=[sub(p[1],p[0]),sub(p[2],p[1]),sub(p[0],p[2])];
  if(!axis(cross(e[0],e[1])))return Infinity;
  for(const edge of e)for(const other of h.edges)if(!axis(cross(edge,other)))return Infinity;
  return enter;
}
// Broad phase in target-local space. Test only candidate triangles against
// the rendered nose, fuselage and fin solids in projectile-local space.
function posed(vertex,mat,b){
  if(mat<6)return vertex;
  const p=vertex.map(n=>n/1.3),[pitch,yaw,roll]=b.controls,prop=b.type==='sail'||b.type==='rv8a';
  function rotate(i,j,x,y,angle){
    const c=Math.cos(angle),s=Math.sin(angle),a=p[i]-x,h=p[j]-y;
    p[i]=x+a*c-h*s;p[j]=y+a*s+h*c;
  }
  if(mat===6||mat===8){
    const hinge=mat===6?(prop?-5.3:-7.4):Flight.fleet[b.type].tip[2]-(prop?1.35:1);
    rotate(1,2,0,hinge,mat===6?.42*pitch:-.42*roll*Math.sign(p[0])+(Flight.fleet[b.type].elevon?.42*pitch:0));
  }else if(mat===7){
    const axis=Math.abs(p[0])>1?Math.sign(p[0])*(1.35+.35*(p[1]-.55)):0;
    rotate(0,2,axis,prop?-6.25:-7.55,-.48*yaw);
  }else if(mat===9||mat===18){
    const nose=p[2]>1.7,part=nose?'noseGear':p[0]<0?'leftGear':'rightGear';
    if(mat===18){rotate(1,2,nose?-2.15:-2.04,nose?3.25:-1,b.wheelPhase||0);
      if(nose)rotate(0,2,0,3.25,-.48*yaw*b.gear);}
    const e=b.gear*(b.condition[part]<=12?.2:1),oldY=vertex[1]/1.3;
    p[1]=-.42+(p[1]+.42)*e;p[2]+=(1-e)*(-.42-oldY)*.8;p[0]*=.32+.68*e;
  }else if(mat===10)rotate(0,1,0,0,b.propPhase||0);
  else if(mat===11){
    rotate(1,2,-.12,-8.4,.50*(b.vector+Math.sign(p[0])*b.vecRoll));
    if(b.vecYaw)rotate(0,2,Math.sign(p[0])*1.32,-8.4,.42*b.vecYaw);
  }else if(mat===15||mat===16)rotate(1,2,.45,mat===15?-2.8:-3.5,(mat===15?-.58:.92)*b.deploy);
  else if(mat===17){p[1]+=.48*b.deploy;rotate(0,2,Math.sign(p[0])*3.3,0,b.propPhase||0);}
  else if(mat===19){
    const spec=Flight.fleet[b.type],c=spec.canard;
    rotate(1,2,c.y,c.z,Flight.canardAngle(spec,pitch,roll,b.deploy,Math.sign(p[0])));
  }else if(mat===20||mat===21)rotate(1,2,.2,-4.8,(mat===20?1:-1)*(.53-.33*Math.sign(p[0])*yaw)*b.deploy);
  return p.map(n=>n*1.3);
}
function contact(shot,type,start,end,basis,body){
  const a=local(sub(shot.prev,start),basis),b=local(sub(shot.pos,end),basis);
  const box=[0,1,2].flatMap(i=>[Math.min(a[i],b[i])-radius,Math.max(a[i],b[i])+radius]);
  if(type!=='scenery'&&box.some((v,i)=>i%2?v < -24:v>24))return Infinity;
  const root=model(type);if(!overlaps(box,root.box))return Infinity;
  const movement=local(world(sub(b,a),basis),shot.axes);
  let first=Infinity;
  function visit(node){
    if(!overlaps(box,node.box))return;
    if(!node.tris){visit(node.left);visit(node.right);return;}
    for(const t of node.tris){
      if(!overlaps(box,t.box))continue;
      const tri=t.p.map(p=>local(world(sub(posed(p,t.mat,body),a),basis),shot.axes));
      for(const h of hulls)first=Math.min(first,sweepTriangle(h,tri,movement,Math.min(1,first)));
    }
  }
  visit(root);return first;
}
function sweptApart(a,b,c,d,limit){
  for(let i=0;i<3;i++){
    const start=a[i]-c[i],end=b[i]-d[i];
    if(Math.min(start,end)>limit||Math.max(start,end)<-limit)return true;
  }
  return false;
}
function plane(shot,body,previous=body.pos){
  if(sweptApart(shot.prev,shot.pos,previous,body.pos,32+radius))return Infinity;
  return contact(shot,body.type,previous,body.pos,body.basis,body);
}
function scenery(shot){
  if(Math.min(shot.prev[1],shot.pos[1])>Lake.sceneryTop+radius)return Infinity;
  const origin=[0,0,0];return contact(shot,'scenery',origin,origin,identity);
}
function tracer(shot,from,to){
  if(sweptApart(from,to,shot.prev,shot.pos,radius))return Infinity;
  const start=sub(from,shot.prev),end=sub(to,shot.pos);
  const a=local(start,shot.axes),v=local(sub(end,start),shot.axes);
  let first=Infinity;
  for(const h of hulls){
    let lo=0,hi=1;
    for(const [n,limit] of h.planes){
      const d=limit-dot(n,a),speed=dot(n,v);
      if(Math.abs(speed)<1e-10){if(d<0){lo=Infinity;break;}continue;}
      if(speed<0)lo=Math.max(lo,d/speed);else hi=Math.min(hi,d/speed);
      if(lo>hi)break;
    }
    if(lo<=hi)first=Math.min(first,lo);
  }
  return first;
}
module.exports={prepare:model,basisOf,unit,plane,scenery,tracer,radius};
