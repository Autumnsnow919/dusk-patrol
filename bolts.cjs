// Three authored animation beats. The last keyframe attaches to the avatar
// until a sustained dodge animation or a flare breaks the arcade tether.
const Contact=require('./contacts.cjs');
const groundAt=require('./terrain.js').makeHeightSampler();
const squareDistance=(a,b)=>(a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;
function leg(shot,goal,fraction,seconds,arch){
  shot.start=shot.pos.slice();
  shot.end=goal.map((n,i)=>shot.pos[i]+(n-shot.pos[i])*fraction);
  shot.elapsed=0;shot.duration=seconds;shot.arch=arch;
}
function launch(id,from,to,type='missile'){
  const pos=from.body.pos.map((v,i)=>v+from.body.basis.f[i]*12);
  const shot={id,type,from:from.id,to:to.id,life:to.life,pos,stage:0,diverted:false,prev:pos.slice(),axes:from.body.basis};
  const distance=Math.sqrt(squareDistance(pos,to.body.pos));
  if(type==='ribbon')leg(shot,to.body.pos,.55,.65+distance/1600,85);
  else leg(shot,to.body.pos,.52,.38+distance/2600,18);
  return shot;
}
function divert(shot,point){
  if(shot.diverted)return;
  shot.diverted=true;shot.attached=false;leg(shot,point,1,.46,15);
}
function move(shot,target,dt){
  if(!target?.hp||target.life!==shot.life)return 'fade';
  if(shot.attached){
    const [pitch,,roll]=target.body.controls;
    shot.dodgeTime=Math.abs(roll)>.72 || Math.abs(pitch)>.78?shot.dodgeTime+dt:0;
    if(shot.dodgeTime>=.20)shot.attached=false;
    else for(let i=0;i<3;i++)shot.end[i]=target.body.pos[i];
  }
  shot.elapsed+=dt;
  const t=Math.min(1,shot.elapsed/shot.duration);
  for(let i=0;i<3;i++){
    shot.prev[i]=shot.pos[i];
    shot.pos[i]=shot.start[i]+(shot.end[i]-shot.start[i])*t;
  }
  shot.pos[1]+=4*shot.arch*t*(1-t);
  const delta=shot.pos.map((v,i)=>v-shot.prev[i]);
  if(Math.hypot(...delta)>1e-8)shot.axes=Contact.basisOf(Contact.unit(delta));
  if(t<1)return null;
  if(shot.diverted||shot.stage===2)return 'fade';
  shot.stage++;
  if(shot.stage===1 && shot.type==='ribbon')leg(shot,target.body.pos,.63,.78,38);
  else if(shot.stage===1)leg(shot,target.body.pos,.65,.34,5);
  else {leg(shot,target.body.pos,1,shot.type==='ribbon'?.82:.38,0);shot.attached=true;shot.dodgeTime=0;}
  return null;
}
function obstacle(shot){
  let first=Contact.scenery(shot);
  if(Math.min(shot.prev[1],shot.pos[1])<426){
    const delta=shot.pos.map((v,i)=>v-shot.prev[i]),steps=Math.max(1,Math.ceil(Math.hypot(...delta)/2));
    for(let i=0;i<=steps && i/steps<first;i++){
      const t=i/steps,x=shot.prev[0]+delta[0]*t,y=shot.prev[1]+delta[1]*t,z=shot.prev[2]+delta[2]*t;
      if(y<=Math.max(0,groundAt(x,z))){first=t;break;}
    }
  }
  return first;
}
function step(shot,target,dt){
  if(!target?.hp||target.life!==shot.life)return 'fade';
  const ended=move(shot,target,dt),solid=obstacle(shot);
  const hit=Contact.plane(shot,target.body);
  if(hit<solid)return 'hit';
  return solid<=1?'fade':ended;
}
module.exports={launch,divert,move,obstacle,step};
