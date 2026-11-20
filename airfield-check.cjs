const assert=require('node:assert/strict');
const Flight=require('./flight.js'),Fields=require('./airfields.js'),Lake=require('./lake.js');
const {Arena}=require('./arena.cjs');
const neutral={pitch:0,yaw:0,roll:0,throttle:0};
const tick=(b,c={})=>Flight.step(b,{...neutral,...c},Flight.tick);
const speed=b=>Math.hypot(...b.vel);
const ground=require('./terrain.js').makeHeightSampler();
let circuits=0;
for(const field of Fields.strips)for(const type of Object.keys(Flight.fleet)){
  const b=Flight.approach(type,field);
  function until(check,commands,seconds){
    for(let i=0;i<seconds*120 && !check();i++){
      tick(b,commands);
      assert(!b.crashed && !Lake.touches(b.pos) && b.pos[1]>ground(b.pos[0],b.pos[2])+2,type+' collision at '+field.name);
    }
    assert(check(),type+' at '+field.name+' failed to reach next phase');
  }
  until(()=>b.grounded,{gear:true},30);
  assert(b.sinkAtTouch>0 && b.sinkAtTouch<5.5);assert.equal(b.touchdowns,1);
  until(()=>speed(b)<.1,{gear:false,brake:true,throttle:-1},45);
  assert.equal(b.gear,1);
  until(()=>!b.grounded,{gear:true,throttle:1,pitch:1},65);
  for(let i=0;i<240;i++)tick(b,{gear:false,throttle:1,pitch:.2});
  assert(!b.crashed&&!b.grounded);assert.equal(b.gear,type==='rv8a'?1:0);
  assert(b.pos[1]>field.y+5);circuits++;
}
const field=Fields.strips[0];
for(const [gear,sink,survive] of [[0,-1,true],[.7,-2,true],[1,-7,true],[1,-10,true],[1,-26,false]]){
  const b=Flight.approach('kite',field);b.pos=[field.x,field.y+Fields.clearance+.05,field.z];
  b.vel[1]=sink;b.gear=gear;b.gearDown=gear>=.95;
  for(let i=0;i<360&&!b.grounded&&!b.crashed;i++)tick(b,{gear:b.gearDown});
  assert.equal(b.crashed,!survive);assert.equal(b.grounded,survive);
  if(survive){
    assert(b.damaged);const parts={...b.condition};
    for(let i=0;i<30;i++)tick(b,{brake:true,throttle:-1});
    assert.deepEqual(b.condition,parts,'one contact should not charge damage every tick');
    b.vel.fill(0);b.throttle=b.engine=0;
    for(let i=0;i<750;i++)tick(b,{brake:true});
    assert.deepEqual(b.condition,Fields.freshCondition());assert(!b.damaged);
  }
}
const shell=Flight.create('kite',[0,900,0],0),peerBody=Flight.create('tern',[15,900,0],0);
Fields.brush(shell,peerBody);assert(shell.condition.rightWing<100 && peerBody.condition.leftWing<100);
const bridgeBody=Flight.create('kite',[530,121+6.5+.7,-90],Math.PI);
bridgeBody.vel=[75,-1,0];assert(!Lake.collide(bridgeBody));assert(bridgeBody.damaged);
const grass=Flight.create('kite',[5000,3.2,5000],Math.PI);grass.gear=1;grass.gearDown=true;grass.vel=[0,-2,46];
Flight.step(grass,{...neutral,gear:true},Flight.tick,()=>1);assert(grass.grounded&&!grass.crashed);
const jet=Flight.create('needle',[1900,700,-1000],Math.PI);
for(let i=0;i<1800;i++)tick(jet,{throttle:1,vector:true});
assert(jet.mach>1.05);
const obs=[30,700,100],v=[0,0,400];
assert(Flight.boomMargin([0,700,0],v,obs)<0);
assert(Flight.boomMargin([0,700,190],v,obs)>0);
assert.equal(Flight.boomMargin([0,700,190],[0,0,300],obs),null);
// The exterior clip needs two distinct pressure fronts at either browser rate.
const Sound=require('node:vm').runInNewContext(require('node:fs').readFileSync(require.resolve('./sound.js'),'utf8')+';FlightAudio');
for(const sampleRate of [44100,48000]){
  const sound=new Sound(30);
  sound.ctx={sampleRate,createBuffer(_channels,length){
    const mono=new Float32Array(length);return {getChannelData:()=>mono};
  }};
  const buffer=sound.sample('boom'),samples=buffer.getChannelData(0);
  const level=(start,end)=>{
    const slice=samples.subarray(Math.round(start*sampleRate),Math.round(end*sampleRate));
    return Math.sqrt(slice.reduce((sum,x)=>sum+x*x,0)/slice.length);
  };
  const gap=level(.045,.085);
  assert(level(.002,.006)>2*gap && level(.110,.114)>2*gap);
  assert(level(.43,.60)<.02);
  assert.equal(sound.sample('boom'),buffer);
}
assert(Flight.thermal(-1450,540,610)>5);assert.equal(Flight.thermal(0,540,0),0);
const arena=new Arena(0),p=arena.add('p','kite'),q=arena.add('q','sail');
p.shield=q.shield=0;p.body=Flight.approach('kite',field);
for(let i=0;i<2600&&!p.body.grounded;i++)arena.tick(Flight.tick);
assert(p.hp===100&&p.body.grounded&&arena.snapshot(p,0).self.rig[3]===1);
p.body=Flight.create('kite',[900,900,1500],0);q.body=Flight.create('sail',[900,900,1400],0);
p.kit=32;q.kit=16;
assert(arena.input(q,{controls:neutral,weapon:'prism',fire:true}));
assert(arena.input(p,{controls:neutral,weapon:'glyph',fire:true,target:q.id}));
for(let i=0;i<160;i++)arena.tick(Flight.tick);
assert.equal(q.hp,100);assert(arena.events.some(e=>e.kind==='refract'));
arena.damage(p,q,5);assert.equal(q.hp,95);
console.log('PASS '+circuits+' complete landing / stop / takeoff circuits, gear locks and impacts, authoritative runway, atmosphere, prism and glyph');
