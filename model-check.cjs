// Audit the actual loft cells at articulated poses. Face normals and edge cross
// products separate convex sections whose bounding boxes overlap across a gap.
const assert=require('node:assert/strict');
const Flight=require('./flight.js');
const {buildPlane,AirframeJoints}=require('./airframes.js');
const {posed}=require('./contacts.cjs');
const tolerance=.001; // mesh units, only for numerical contact at shared hinges
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const sub=(a,b)=>a.map((v,i)=>v-b[i]);
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
function axis(list,d){
  const len=Math.hypot(...d);
  if(len<1e-8)return;
  const n=d.map(v=>v/len);
  if(!list.some(a=>Math.abs(dot(a,n))>1-1e-9))list.push(n);
}
function solid(cell,body){
  const v=cell.flat().map(p=>posed(p.map(n=>n*1.3),cell.mat,body).map(n=>n/1.3));
  const k=cell[0].length,edges=[],normals=[];
  for(let i=0;i<k;i++){
    const j=(i+1)%k,base=sub(v[j],v[i]),cap=sub(v[j+k],v[i+k]),rail=sub(v[i+k],v[i]);
    axis(edges,base);axis(edges,cap);axis(edges,rail);
    axis(normals,cross(base,sub(v[j+k],v[i])));axis(normals,cross(rail,cap));
    axis(normals,cross(base,sub(v[(j+1)%k],v[j])));
    axis(normals,cross(cap,sub(v[(j+1)%k+k],v[j+k])));
  }
  const bounds=[0,1,2].map(i=>[Math.min(...v.map(p=>p[i])),Math.max(...v.map(p=>p[i]))]);
  return {v,edges,normals,bounds};
}
function connected(a,b){
  for(let i=0;i<3;i++)if(a.bounds[i][1]<b.bounds[i][0]-tolerance||b.bounds[i][1]<a.bounds[i][0]-tolerance)return false;
  function separates(n){
    let al=Infinity,ah=-Infinity,bl=Infinity,bh=-Infinity;
    for(const p of a.v){const d=dot(p,n);al=Math.min(al,d);ah=Math.max(ah,d);}
    for(const p of b.v){const d=dot(p,n);bl=Math.min(bl,d);bh=Math.max(bh,d);}
    const e=tolerance*Math.hypot(...n);
    return ah<bl-e || bh<al-e;
  }
  if(a.normals.some(separates)||b.normals.some(separates))return false;
  for(const x of a.edges)for(const y of b.edges)if(separates(cross(x,y)))return false;
  return true;
}
function detached(cells,shapes){
  const root=cells.findIndex(c=>c.component==='fuselage');
  assert(root>=0);
  const reached=new Set([root]),queue=[root];
  for(let q=0;q<queue.length;q++){
    for(let j=0;j<cells.length;j++)if(!reached.has(j)&&connected(shapes[queue[q]],shapes[j])){
      reached.add(j);queue.push(j);
    }
  }
  return cells.flatMap((c,i)=>reached.has(i)?[]:[c.component+' #'+i+' (part '+c.mat+')']);
}
// Connectivity alone could accept a rear wing suspended solely from its tip.
// Check the intended support at each end separately, and check the actual hinge line.
function checkMounts(type,cells,shapes){
  function sideCells(component,side,material){
    return cells.flatMap((c,i)=>{
      const points=c.flat(),cx=points.reduce((sum,p)=>sum+p[0],0)/points.length;
      return c.component===component && (material===undefined||material===c.mat) && (!side||side*cx>0)?[i]:[];
    });
  }
  function mounts(part,supports,message){
    assert(part.some(i=>supports.some(j=>connected(shapes[i],shapes[j]))),type+' '+message);
  }
  for(const side of [-1,1]){
    const wing=sideCells('main wing',side,0),bodyCells=sideCells('fuselage',0,0);
    mounts(wing,bodyCells,'main wing root');
    if(Flight.fleet[type].canard){
      const bearing=sideCells('foreplane bearing',side);
      mounts(bearing,bodyCells,'foreplane bearing to fuselage');
      mounts(sideCells('foreplane',side),bearing,'moving foreplane to bearing');
    }
    if(type==='loom'||type==='gull'){
      const rear=sideCells('joined rear wing',side),saddle=sideCells('dorsal wing saddle',side);
      mounts([rear[0]],saddle,'rear wing root to saddle');
      mounts([rear.at(-1)],wing,'rear wing tip to main wing');mounts(saddle,bodyCells,'saddle to fuselage');
    }
    if(type==='manta'){
      const mount=sideCells('fan mount',side),pylon=sideCells('fan pylon',side);
      mounts(pylon,wing,'fan pylon to wing');mounts(pylon,mount,'fan housing to pylon');
      for(const rotor of sideCells('rotor',side)){
        mounts([rotor],mount,'blade to hub');
        assert(!wing.some(i=>connected(shapes[i],shapes[rotor])),type+' rotor intersects wing');
      }
    }
    if(type==='rook'){
      const boom=sideCells('tail boom',side),fin=sideCells('fin and rudder',side,0);
      mounts(boom,wing,'boom to wing');mounts(fin,boom,'fin to boom');
      mounts(sideCells('boom tailplane',side,0),fin,'tailplane to fixed fin');
    }
  }
}
function checkHinges(type,cells,mesh,body){
  for(const cell of cells){
    if(!Object.hasOwn(AirframeJoints.slots,cell.mat))continue;
    const sumX=cell.flat().reduce((sum,p)=>sum+p[0],0);
    const i=3*AirframeJoints.index(cell.mat,sumX);
    const pivot=mesh.pivots.slice(i,i+3),axis=mesh.axes.slice(i,i+3);
    assert(Math.abs(Math.hypot(...axis)-1)<1e-5,type+' unassigned hinge');
    for(const offset of [.05,.30]){
      const point=Array.from(pivot,(v,k)=>(v+offset*axis[k])*1.3);
      assert(Math.hypot(...sub(posed(point,cell.mat,body),point))<.00001,type+' hinge moved at part '+cell.mat);
    }
  }
}
const poses=[
  [[0,0,0],1,0],[[0,0,0],0,0],[[1,1,1],.5,1],[[-1,-1,-1],1,1],
  [[1,-1,-1],0,1],[[-1,1,1],.35,.5],[[0,1,-1],.75,1],[[0,-1,1],.25,1]
];
let count=0;
for(const type of Object.keys(Flight.fleet)){
  const all=[],parts=[],mesh=buildPlane(type,all,parts),cells=all.filter(c=>![12,13,14].includes(c.mat));
  assert(mesh.data.every(Number.isFinite));
  assert.equal(parts.length*30,mesh.data.length);
  for(let i=1;i<=8;i++)assert.equal(parts.includes(i),!(type==='nocturne'&&i===4),type+' damage zone '+i);
  if(['su27','j10','j20','j16','f4','f16','f22'].includes(type)){
    assert.equal(cells.filter(c=>c.component==='nozzle' && c.mat===11).length,['j10','f16'].includes(type)?1:2);
    assert.equal(cells.some(c=>c.component==='foreplane'),['j10','j20'].includes(type));
    assert.equal(cells.some(c=>c.component==='tail fairing'),['su27','j16'].includes(type));
    assert.equal(cells.some(c=>c.component==='canopy' && c.mat===0),['j16','f4'].includes(type));
  }
  const cloud=all.filter(c=>c.mat===14);
  if(type==='rv8a'||type==='sail')assert.equal(cloud.length,0);
  else{
    assert.equal(cloud.length,2);
    const rim=cloud[1][1],tip=rim.reduce((best,p)=>p[0]>best[0]?p:best);
    assert(Math.abs(tip[0]-1.04*Flight.fleet[type].tip[0])<.001,type+' cloud span');
    assert(Math.abs(tip[2]-Flight.fleet[type].tip[2])<1,type+' cloud follows wing sweep');
    assert(mesh.data.length>mesh.solidEnd*10 && mesh.data[mesh.solidEnd*10+9]===14);
  }
  for(const [controls,gear,deploy] of poses){
    const body=Flight.create(type);
    Object.assign(body,{controls,gear:type==='rv8a'?1:gear,deploy,propPhase:deploy*1.92,wheelPhase:deploy*1.35});
    if(Flight.fleet[type].vector){
      body.vector=controls[0]*.57;body.vecYaw=Flight.fleet[type].vector===3?controls[1]*.57:0;
      body.vecRoll=Flight.fleet[type].vector===3?controls[2]*.43:0;
    }
    const shapes=cells.map(c=>solid(c,body));
    checkMounts(type,cells,shapes);checkHinges(type,cells,mesh,body);
    const floating=detached(cells,shapes);
    assert.deepEqual(floating,[],type+' '+JSON.stringify([controls,gear,deploy])+' detached: '+floating.join(', '));count++;
  }
}
console.log('PASS '+Object.keys(Flight.fleet).length+' airframes, '+count+' connected structural poses');
