const assert=require('node:assert/strict');
const Flight=require('./flight.js');
const neutral={pitch:0,roll:0,yaw:0,throttle:0}, mph=.44704;
const sample=(speed,alpha,gamma,engine,altitude)=>{
  const body=Flight.create('rv8a',[0,altitude,0],0);
  const pitch=alpha+gamma;
  body.engine=body.throttle=engine;
  body.quat=[Math.sin(pitch/2),0,0,Math.cos(pitch/2)];
  body.vel=[0,speed*Math.sin(gamma),-speed*Math.cos(gamma)];
  const before=body.vel.slice();
  Flight.step(body,neutral,Flight.tick);
  return body.vel.map((value,index)=>(value-before[index])/Flight.tick);
};
function root(low,high,measure){
  const sign=Math.sign(measure(low));assert.notEqual(sign,Math.sign(measure(high)));
  for(let pass=0;pass<42;pass++){
    const mid=(low+high)/2;
    if(Math.sign(measure(mid))===sign)low=mid;else high=mid;
  }
  return (low+high)/2;
}
function rollTrial(direction){
  const body=Flight.create('rv8a',[0,0,0],0);
  body.vel=[0,0,-136.53*mph];body.quat=[0,0,direction*.5,Math.sqrt(.75)];
  let time=0;
  while(time<4){
    Flight.step(body,{...neutral,roll:direction},Flight.tick);time+=Flight.tick;
    const axis=Flight.axes(body.quat);
    if(direction*Math.atan2(-axis.r[1],axis.u[1])>=Math.PI/3)return 120/time;
  }
  throw new Error('roll did not complete');
}
const stallSpeed=root(20,36,speed=>sample(speed,Flight.fleet.rv8a.stall,0,0,0)[1])/mph;
const indicated=stallSpeed+(64-58.06);
const speed=109*mph, altitude=1482*.3048;
function climbResidual(gamma){
  const normal=alpha=>{
    const acc=sample(speed,alpha,gamma,1,altitude);
    return acc[1]*Math.cos(gamma)+acc[2]*Math.sin(gamma);
  };
  const alpha=root(-.08,.28,normal),acc=sample(speed,alpha,gamma,1,altitude);
  return acc[1]*Math.sin(gamma)-acc[2]*Math.cos(gamma);
}
const climb=speed*Math.sin(root(0,.40,climbResidual))/.00508;
const right=rollTrial(1),left=rollTrial(-1);
console.table([
  {point:'clean 1g / estimated panel mph',model:indicated.toFixed(2),reference:'60–63 IAS (weight varies)'},
  {point:'60 to 60 right / deg/s',model:right.toFixed(2),reference:109},
  {point:'60 to 60 left / deg/s',model:left.toFixed(2),reference:102},
  {point:'109 mph TAS climb / ft/min',model:climb.toFixed(1),reference:2179.6}
]);
console.log('Stall equivalent airspeed:',stallSpeed.toFixed(2),'mph. Panel conversion approximate; climb is a trim solution.');
assert(indicated>=60 && indicated<=64);assert(Math.abs(right/109-1)<.10 && Math.abs(left/102-1)<.10);assert(Math.abs(climb/2179.6-1)<.10);
const kite=Flight.create('kite',[0,2000,0],0);
const advance=(pitch,vector)=>Flight.step(kite,{...neutral,pitch,throttle:1,vector},Flight.tick);
for(let frame=0;frame<600;frame++)advance(0,false);
let peak=0,recovered=false,minSpeed=Infinity;
const entry=Math.hypot(...kite.vel);
for(let frame=0;frame<720;frame++){
  advance(frame<105?1:frame<165?-1:0,frame<165);
  peak=Math.max(peak,kite.alpha*180/Math.PI);minSpeed=Math.min(minSpeed,Math.hypot(...kite.vel));
  if(frame>165 && Math.abs(kite.alpha)<.16)recovered=true;
}
assert(peak>90 && recovered && minSpeed<entry*.75 && kite.pos[1]>0);
console.log('Fictional vector transient:',peak.toFixed(1),'degrees; returned below 10 degrees; speed',entry.toFixed(1),'to',minSpeed.toFixed(1),'m/s.');
