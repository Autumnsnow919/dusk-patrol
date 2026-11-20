const assert=require('node:assert/strict');
const Flight=require('./flight.js'),Lake=require('./lake.js'),terrain=require('./terrain.js');
const {Arena}=require('./arena.cjs');
const command={pitch:0,roll:0,yaw:0,throttle:1};
const rows=[];
for(const [id,spec] of Object.entries(Flight.fleet)){
  if(!spec.highPower)continue;
  const body=Flight.create(id,[0,1000,-4000],0);
  let crossover=null,steadyMin=Infinity,altitudeError=0;
  for(let i=0;i<90*120;i++){
    Flight.step(body,command,Flight.tick);
    if(body.mach>=1 && crossover===null)crossover=(i+1)/120;
    if(i>=70*120)steadyMin=Math.min(steadyMin,body.mach);
    altitudeError=Math.max(altitudeError,Math.abs(body.pos[1]-1000));
  }
  assert(crossover!==null && crossover<45 && steadyMin>1.01 && altitudeError<12,id+' level flight');
  rows.push({airframe:id,secondsToMach1:+crossover.toFixed(1),machAt90s:+body.mach.toFixed(2)});
}
assert.equal(rows.length,19);console.table(rows);
assert.equal(terrain.WORLD.L,81920);
const sample=terrain.makeHeightSampler();
for(const site of Lake.sites.slice(9)){
  const [x,h,z]=site.pos;assert(h-sample(x,z)>55);assert(!Lake.touches(site.pos));
  assert(Math.hypot(x-900,z-1500)<Lake.arenaRadius-300);
  // The two terrain axes are rounded direction vectors. Invert the projection exactly.
  const axis=terrain.WORLD.E1,shift=axis.map(v=>v*terrain.WORLD.L/(axis[0]**2+axis[1]**2));
  assert(Math.abs(sample(x+shift[0],z+shift[1])-sample(x,z))<1e-6);
}
assert.equal(Lake.frontier.length,6);assert.equal(Lake.sites.length,18);assert.equal(Lake.arenaRadius,32000);
for(const site of Lake.frontier){
  const [x,y,z]=site.pos;
  for(let dz=-1200;dz<=100;dz+=5){
    assert(y>Math.max(0,sample(x,z+dz))+10,site.name+' departure terrain');
    assert(!Lake.touches([x,y,z+dz],3),site.name+' departure obstructed');
  }
}
for(const course of Lake.courses){
  for(const g of course.gates){
    assert(Lake.crosses(g,[g.x,g.y,g.z-2],[g.x,g.y,g.z+2]));
    assert(!Lake.crosses(g,[g.x,g.y,g.z+2],[g.x,g.y,g.z-2]));
    assert(!Lake.touches([g.x,g.y,g.z],18));
  }
}
assert(Lake.touches([3520+168,510,2200]));
assert(Lake.touches([17800,654,-16400]));
assert(Lake.relayOrder.includes(16));
const arena=new Arena(0),p=arena.add('solo','spire');
p.body=Flight.create('spire',[13900,1000,1500],0);arena.tick(Flight.tick);assert.equal(p.hp,100);
p.body.pos[0]=900+Lake.arenaRadius+10;arena.tick(Flight.tick);assert.equal(p.hp,0);
console.log('PASS sustained level supersonic flight, outer landmarks, terrain wrap and arena boundary');
