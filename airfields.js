// Runway decks use the same footprint for the visual mesh and wheel contact.
const Airfields = (() => {
  const strips = [
    {id:'eastfield',name:'东湖长堤机场',x:1900,z:20,y:30,length:2300,width:80,color:'#9bdece'},
    {id:'westfield',name:'西湾灯船机场',x:-1450,z:2270,y:14,length:2000,width:68,color:'#ffd996'},
    {id:'mesa',name:'台地云港',x:300,z:2650,y:181,length:1550,width:62,color:'#d1b9e4'}
  ];
  function at(x,z){
    for(const f of strips)if(Math.abs(x-f.x)<=f.width/2 && Math.abs(z-f.z)<=f.length/2)return f;
    return null;
  }
  const clearance=3.25;
  function park(body,field,slot=0){
    body.pos=[field.x+(slot%2?9:-9),field.y+clearance,field.z-field.length/2+60+Math.floor(slot/2)*28];
    body.quat=[0,-1,0,0];body.vel.fill(0);body.rates.fill(0);
    body.throttle=body.engine=0;body.gear=1;body.gearDown=true;body.grounded=true;body.crashed=false;
  }
  const labels={fuselage:'机身',leftWing:'左翼',rightWing:'右翼',tail:'尾翼',engine:'发动机',leftGear:'左主轮',rightGear:'右主轮',noseGear:'前轮'};
  const freshCondition=()=>Object.fromEntries(Object.keys(labels).map(key=>[key,100]));
  function wear(b,key,amount){
    if(amount<.5)return;
    b.condition[key]=Math.max(0,b.condition[key]-Math.round(amount));b.damaged=true;
  }
  function scrape(b,part,closing){
    if(b.contactDelay>0)return;
    const harm=Math.min(125,5+Math.max(0,closing)*.8);
    wear(b,part,harm);if(part!=='fuselage')wear(b,'fuselage',harm*.17);
    b.contactDelay=.4;b.crashed=b.condition.fuselage<=0;
  }
  function sector(b,point){
    const dx=point[0]-b.pos[0],dy=point[1]-b.pos[1],dz=point[2]-b.pos[2];
    const dot=v=>dx*v[0]+dy*v[1]+dz*v[2],side=dot(b.basis.r),along=dot(b.basis.f);
    if(Math.abs(side)>2 && Math.abs(side)>.55*Math.abs(along))return side<0?'leftWing':'rightWing';
    if(along<-3)return Math.abs(side)>1?'engine':'tail';
    return 'fuselage';
  }
  function brush(a,b,both=true){
    const dx=b.pos[0]-a.pos[0],dy=b.pos[1]-a.pos[1],dz=b.pos[2]-a.pos[2],dist=Math.hypot(dx,dy,dz);
    if(dist>29)return;
    const n=dist>.01?[dx/dist,dy/dist,dz/dist]:[1,0,0];
    const radius=body=>{
      const dot=v=>n[0]*v[0]+n[1]*v[1]+n[2]*v[2];
      return Math.hypot((body.span||7)*dot(body.basis.r),2*dot(body.basis.u),10*dot(body.basis.f));
    };
    const depth=radius(a)+radius(b)-dist;if(depth<=0)return;
    const closing=Math.max(0,(a.vel[0]-b.vel[0])*n[0]+(a.vel[1]-b.vel[1])*n[1]+(a.vel[2]-b.vel[2])*n[2]);
    scrape(a,sector(a,b.pos),closing);
    if(both)scrape(b,sector(b,a.pos),closing);
    for(let i=0;i<3;i++){
      a.pos[i]-=n[i]*(depth+.02)*(both?.5:1);a.vel[i]-=n[i]*closing*.55;
      if(both){b.pos[i]+=n[i]*(depth+.02)*.5;b.vel[i]+=n[i]*closing*.55;}
    }
  }
  function landingLoads(b,sink,speed,bank,pitch){
    const hard=Math.max(0,sink-3.8),belly=1-b.gear,unlocked=1-Math.min(1,b.gear/.97);
    const lowWing=bank>0?'leftWing':'rightWing';
    const skew=Math.max(-.88,Math.min(.88,bank*3)),sideLoad=Math.abs(Math.sin(b.slip))*speed;
    const wheel=hard*hard*.92+Math.max(0,sideLoad-8)*.7+unlocked*(18+hard*2);
    wear(b,'leftGear',b.gear*wheel*(1+skew));wear(b,'rightGear',b.gear*wheel*(1-skew));
    wear(b,'noseGear',b.gear*(wheel*.53+Math.max(0,-pitch-.05)*speed*2));
    const scrape=Math.max(0,Math.abs(bank)-.18)*speed;
    wear(b,lowWing,scrape*1.6);wear(b,'tail',Math.max(0,pitch-.19)*speed*2.1);
    const hull=belly*(8+speed*.22+hard*2)+Math.max(0,hard-4)**2*.78+scrape*.42+
      Math.max(0,-pitch-.22)*speed*1.8+Math.max(0,-b.basis.u[1])*speed*1.4;
    wear(b,'fuselage',hull);wear(b,'engine',belly*(speed*.12+hard)+Math.max(0,hull-25)*.5);
    b.crashed=b.condition.fuselage===0;
  }
  function contact(body,command,dt,accelY,terrain){

    const field=at(body.pos[0],body.pos[2]), was=body.grounded;
    body.grounded=false;body.softApproach=false;
    if(!was)body.service=0;
    const [x,y,z]=body.pos,{r,u,f}=body.basis,c=body.condition;
    let surface=field?.y,grade=0;
    if(!field){
      if(!terrain || y>420)return;
      surface=terrain(x,z);
      if(surface<=.4 || y-surface>12 || y<surface-2)return;
      const sx=(terrain(x+5,z)-terrain(x-5,z))*.1,sz=(terrain(x,z+5)-terrain(x,z-5))*.1;
      if(sx*sx+sz*sz>.22**2)return;
      body.softApproach=y>=surface-1;
      grade=sx*body.vel[0]+sz*body.vel[2];
    }
    const speed=Math.hypot(body.vel[0],body.vel[2]),gear=body.gear;
    const bank=Math.asin(Math.max(-1,Math.min(1,r[1])));let pitch=Math.asin(Math.max(-1,Math.min(1,f[1])));
    // Wheel hubs and belly use the same body axes as the animated model.
    const wheelDrop=(health,side,station)=>1.3*((1+1.5*gear*(health>12?1:.2))*u[1]-side*r[1]-station*f[1]);
    const support=Math.max(1.15,wheelDrop(c.leftGear,-1.75,-1),wheelDrop(c.rightGear,1.75,-1),wheelDrop(c.noseGear,0,3.25));
    if(y<surface-6 || (!was && (y>surface+support+.015 || (body.vel[1]>grade && y>=surface+support))))return;
    if(!was){
      if(y<surface-1){body.crashed=true;return;}
      const sink=Math.max(0,grade-body.vel[1]);body.sinkAtTouch=sink;body.touchdowns++;
      landingLoads(body,sink,speed,bank,pitch);
      if(body.crashed)return;
    }
    body.grounded=true;body.pos[1]=surface+support;body.vel[1]=grade;
    const belly=gear<.65 || (c.leftGear<=12 && c.rightGear<=12);
    if(body.damaged && field && speed<1.2 && body.throttle<.08){
      body.service+=dt;
      if(body.service>=6){body.condition=freshCondition();body.damaged=false;body.service=0;body.gear=1;body.gearDown=true;}
    }else body.service=0;
    const rotation=Math.max(0,Math.min(1,(speed/body.rotateSpeed-.60)/.40));
    const demand=(belly?.025:.20)*Math.max(0,command.pitch)*rotation;
    pitch+=(demand-pitch)*Math.min(1,dt*3);
    const heading=Math.atan2(f[0],-f[2])+(command.yaw||0)*Math.min(1,speed/7)*(.6/(1+speed/25))*(.2+.8*c.noseGear/100)*dt;
    const sy=-Math.sin(heading/2),cy=Math.cos(heading/2),sp=Math.sin(pitch/2),cp=Math.cos(pitch/2);
    const roll=bank*Math.exp(-7*dt),sr=Math.sin(roll/2),cr=Math.cos(roll/2);
    body.quat[0]=cy*sp*cr+sy*cp*sr;body.quat[1]=sy*cp*cr-cy*sp*sr;
    body.quat[2]=cy*cp*sr-sy*sp*cr;body.quat[3]=cy*cp*cr+sy*sp*sr;body.rates.fill(0);
    const fx=Math.sin(heading),fz=-Math.cos(heading),long=body.vel[0]*fx+body.vel[2]*fz;
    const rolling=Math.max(0,long-((belly?4.8:field?.17:1.1)+(command.brake?6.5*(c.leftGear+c.rightGear)/200:0))*dt),grip=Math.max(0,1-7*dt);
    body.vel[0]=fx*rolling+(body.vel[0]-fx*long)*grip;body.vel[2]=fz*rolling+(body.vel[2]-fz*long)*grip;

    if(!belly && pitch>.035 && accelY>10 && speed>body.rotateSpeed*.82){
      body.grounded=false;body.softApproach=false;
    if(!was)body.service=0;body.vel[1]=Math.max(1.2,speed*Math.sin(pitch)*.4);body.pos[1]+=.07;
    }
  }
  return {strips,at,contact,park,clearance,labels,freshCondition,wear,scrape,brush,sector};
})();
if(typeof module!=='undefined')module.exports=Airfields;
