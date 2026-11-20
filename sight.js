// Rules shared by the arcade reticle and the match referee.
const Sight=(()=>{
  const ring=.30, reach=2000, fill=1.05;
  const profiles={
    missile:{ring,reach,fill,inner:0,wait:4.8,damage:100},
    ribbon:{ring:.15,reach:4400,fill:1.85,inner:550,wait:8,damage:100}
  };
  function inRing(body,point,slope=ring,limit=reach,inner=0){
    const f=body.basis.f,dx=point[0]-body.pos[0],dy=point[1]-body.pos[1],dz=point[2]-body.pos[2];
    const ahead=dx*f[0]+dy*f[1]+dz*f[2],sq=dx*dx+dy*dy+dz*dz;
    return ahead>0 && sq>=inner*inner && sq<=limit*limit && sq<=ahead*ahead*(1+slope*slope);
  }
  const gunRate=30,gunCapacity=96,streakSpeed=760,streakLife=.84;
  // Approximate lead for the fictional tracer. A pilot can always ignore the marker.
  function badge(pos,vel,body){
    const time=Math.min(streakLife,Math.hypot(...pos.map((v,i)=>v-body.pos[i]))/streakSpeed);
    return pos.map((v,i)=>v+(vel[i]-body.vel[i])*time+(i===1?9*time*time:0));
  }
  const trackSlots=3;
  const laser={ring:.16,reach:950,fill:2.2};
  const percent=(value,total)=>Math.min(100,Math.floor(100*value/total));
  return {profiles,laser,ring,reach,fill,inRing,badge,gunRate,gunCapacity,streakSpeed,streakLife,trackSlots,percent};
})();
if(typeof module!=='undefined')module.exports=Sight;
