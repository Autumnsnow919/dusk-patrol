const assert=require('node:assert/strict');
const Flight=require('./flight.js');
const OrbitRig=require('./scope.js');
const {Arena}=require('./arena.cjs');
const {createServer}=require('./server.cjs');
const neutral={pitch:0,roll:0,yaw:0,throttle:0};
const types=Object.keys(Flight.fleet).filter(type=>Flight.fleet[type].pvp);
function run(type,frames,input){
  const body=Flight.create(type,[0,1500,0],0);
  for(let frame=0;frame<frames;frame++)Flight.step(body,{...neutral,...input},Flight.tick);
  assert(body.pos.every(Number.isFinite));return body;
}
const atSpeed=body=>Math.hypot(...body.vel);
assert.equal(types.length,32);
const Pose=require('./peer-pose.js');
const {buildPlane}=require('./airframes.js');
for(const [id,spec] of Object.entries(Flight.fleet)){
  const data=buildPlane(id).data;
  const sides=new Set();
  for(let n=9;n<data.length;n+=10)if(data[n]===19)sides.add(Math.sign(data[n-9]));
  assert.equal(sides.size,spec.canard?2:0,id+' moving foreplanes');
  if(!spec.canard)continue;
  for(const side of sides){
    assert(Flight.canardAngle(spec,1,0,0,side)<-.4);
    assert(Flight.canardAngle(spec,-1,0,0,side)>.4);
  }
  const differential=Flight.canardAngle(spec,0,1,0,1)-Flight.canardAngle(spec,0,1,0,-1);
  assert.equal(Math.abs(differential),2*spec.canard.mix);assert(differential<=0);
}
function disturbed(relaxed){
  const b=Flight.create('ember',[0,1500,0],0);
  b.quat=[Math.sin(.09),0,0,Math.cos(.09)];b.deploy=+relaxed;
  for(let i=0;i<60;i++)Flight.step(b,{...neutral,vector:relaxed},Flight.tick);
  return b;
}
const aided=disturbed(false),relaxed=disturbed(true);
assert(aided.rates[0]<0 && relaxed.rates[0]>0 && aided.alpha<relaxed.alpha);
assert(aided.controls[0]<-.05 && relaxed.controls[0]===0);
assert(atSpeed(run('nocturne',120,{vector:true}))<atSpeed(run('nocturne',120,{}))-8);
assert(run('tandem',120,{vector:true}).pos[1]>run('tandem',120,{}).pos[1]+1);

for(const type of ['kite','lance','skate','aurora','opal']){
  const three=Flight.fleet[type].vector===3;
  for(const [axis,field,rate,sign] of [['pitch','vector',0,1],['yaw','vecYaw',1,-1],['roll','vecRoll',2,-1]]){
    for(const direction of [-1,1]){
      const input={[axis]:direction},assisted=run(type,26,{...input,vector:true}),normal=run(type,26,input);
      if(three || axis==='pitch'){
        assert(assisted[field]*direction>.6,type+' '+axis);
        assert((assisted.rates[rate]-normal.rates[rate])*direction*sign>.015,type+' '+axis+' torque');
      }else assert.equal(assisted[field],0);
    }
  }
  const b=run(type,100,{pitch:1,yaw:-1,roll:1,vector:true}),rig=Flight.rig(b);
  assert.equal(rig.length,9);
  if(three)assert(rig[7]<-.4 && rig[8]>.4 && rig[4]>.4);
  for(const side of [-1,1])assert(Math.hypot(rig[4]+side*rig[8],rig[7])<=1+1e-8);
  for(let i=0;i<120;i++)Flight.step(b,neutral,Flight.tick);
  for(const field of ['vector','vecRoll','vecYaw'])assert(Math.abs(b[field])<.01);
}
const mixed=new Arena(0),watcher=mixed.add('watch','loom'),performer=mixed.add('fly','opal','星斑试飞');
for(let i=0;i<80;i++){
  mixed.input(performer,{controls:{...neutral,vector:true,pitch:-1,yaw:1,roll:-1},weapon:'gun'});
  mixed.tick(Flight.tick);
}
const snap=known=>mixed.snapshot(watcher,0,0,known).peers[0];
const joined=Pose.unpack(snap([])),updated=Pose.unpack(snap([performer.id]),joined);
assert.deepEqual(joined,updated);assert.deepEqual(updated,snap(null));
assert(updated.rig[7]>.4 && updated.rig[8]<-.4 && updated.rig[4]<-.4);
mixed.reset(performer);
const respawned=Pose.unpack(snap([performer.id]),updated);
assert.equal(respawned.life,joined.life+1);assert.equal(respawned.name,'星斑试飞');
assert.deepEqual(Pose.unpack(snap([])),respawned);assert.equal(respawned.rig[8],0);
assert(Math.abs(run('skate',120,{yaw:1,vector:true}).rates[1])>Math.abs(run('skate',120,{yaw:1}).rates[1]));
assert(run('wisp',120,{vector:true}).pos[1]>run('wisp',120,{}).pos[1]+1);
for(const type of ['rook','cirrus']){
  const surveyor=Flight.create(type,[0,1200,0],0);
  surveyor.quat=[0,0,Math.sin(.32),Math.cos(.32)];
  for(let i=0;i<200;i++)Flight.step(surveyor,{...neutral,vector:true},Flight.tick);
  assert(Math.abs(Flight.axes(surveyor.quat).r[1])<.4,type+' roll leveling');
}
for(const yaw of [-1,1]){
  const on=run('ibis',80,{yaw,vector:true}),off=run('ibis',80,{yaw});
  assert(Math.sign(on.rates[1])*(on.rates[2]-off.rates[2])>.1,'roll follows the yaw direction');
}
assert(Math.abs(run('heron',120,{vector:true,roll:1}).rates[2])<Math.abs(run('heron',120,{roll:1}).rates[2]));
assert(Math.abs(run('gull',120,{vector:true,yaw:1}).rates[1])>Math.abs(run('gull',120,{yaw:1}).rates[1]));
assert(run('tern',120,{vector:true}).pos[1]>run('tern',120,{}).pos[1]+1);
assert(Math.abs(run('swift',120,{vector:true,roll:1}).rates[2])>Math.abs(run('swift',120,{roll:1}).rates[2]));
assert(run('manta',240,{vector:true,throttle:1}).pos[1]>run('manta',240,{throttle:1}).pos[1]+1);
assert(atSpeed(run('osprey',240,{vector:true}))<atSpeed(run('osprey',240,{}))-8);
const boosted=run('pulse',240,{vector:true});assert(atSpeed(boosted)>atSpeed(run('pulse',240,{}))+5);
const empty=run('pulse',450,{vector:true});assert(empty.empty);assert.equal(empty.charge,0);
for(let frame=0;frame<360;frame++)Flight.step(empty,neutral,Flight.tick);
assert(!empty.empty && empty.charge>.25);
assert.deepEqual(run('rv8a',120,{vector:true}).vel,run('rv8a',120,{}).vel);
for(const rule of ['beacon','crown']){
  const match=new Arena(0,rule),first=match.add('first','kite');
  const start=first.body.pos.slice();
  match.input(first,{controls:{...neutral,roll:1},weapon:'gun'});
  for(let i=0;i<120;i++)match.tick(Flight.tick);
  assert.notDeepEqual(first.body.pos,start);
  assert.notEqual(first.body.quat[2],0);
  assert.equal(match.matchTime,0);
  const beforeJoin=match.snapshot(first,0).self;
  match.add('second','swift');
  const afterJoin=match.snapshot(first,0).self;
  for(const key of ['life','pos','quat','vel','kit'])assert.deepEqual(afterJoin[key],beforeJoin[key]);
  match.tick(Flight.tick);assert(match.matchTime>0);
  match.remove('second');
  const atLeave=first.body.pos.slice(),clock=match.matchTime;
  match.tick(Flight.tick);assert.notDeepEqual(first.body.pos,atLeave);assert.equal(match.matchTime,clock);
  first.body.pos[1]=-1;
  match.tick(Flight.tick);assert.equal(first.hp,0);assert.equal(first.deaths,0);
  for(let i=0;i<270;i++)match.tick(Flight.tick);
  assert.equal(first.hp,100);assert.equal(first.life,beforeJoin.life+1);
}
const arena=new Arena(0);
const players=types.slice(0,7).map(type=>arena.add(type,type));
const extra=arena.add('second kite','kite');assert.equal(extra.type,'kite');
const kite=arena.players.get('kite');
const initial=arena.snapshot(kite,0);
assert.equal(initial.peers.length,7);
assert.deepEqual(initial.peers.map(peer=>peer.type).sort(),players.filter(p=>p!==kite).map(p=>p.type).concat('kite').sort());
for(let frame=0;frame<110;frame++){
  arena.input(kite,{controls:{...neutral,pitch:1,throttle:1,vector:true},weapon:'gun'});
  arena.tick(Flight.tick);
}
assert(arena.snapshot(kite,0).self.vector>.97);
assert(!arena.input(kite,{controls:{...neutral,vector:7},weapon:'gun'}));
for(const player of players){arena.reset(player);assert.equal(player.body.type,player.type);assert.equal(player.hp,100);}
const rig=new OrbitRig(),ground=()=>0,eye=[20,900,40],start=rig.sample(eye,ground);
rig.input(1,1,1,1);const rotated=rig.sample(eye,ground);assert.notDeepEqual(rotated.pos,start.pos);
assert.equal(rotated.B.r[1],0);
rig.toggleAnchor(rotated.pos,eye);const flyby=rig.sample([100,940,-100],ground);
assert.deepEqual(flyby.pos,rotated.pos);assert.notDeepEqual(flyby.B.f,rotated.B.f);
rig.shift(60,-20);assert.equal(rig.anchor[0],rotated.pos[0]+60);
rig.toggleAnchor(rig.anchor,eye);assert.equal(rig.anchor,null);
assert(rig.sample(eye,()=>2000).pos[1]>=2004);

async function networkCheck(){
  const server=createServer();
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const base='http://127.0.0.1:'+server.address().port;
  async function call(path,data,token){
    const res=await fetch(base+'/'+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
    return {status:res.status,...await res.json()};
  }
  try{
    const join=(type,mode='pvp',room='FLEET')=>call('join',{room,type,mode});
    assert.equal((await join('rv8a')).status,400);
    const solo=await join('swift','pvp',''),another=await join('kite','pvp','');
    assert.match(solo.room,/^[A-F0-9]{6}$/);assert.notEqual(another.room,solo.room);
    const friend=await join('tern','pvp',solo.room);
    const sync={controls:neutral,weapon:'gun'};
    assert.equal((await call('sync',sync,solo.token)).peers[0].id,friend.id);
    assert.equal((await call('sync',sync,another.token)).peers.length,0);
    const identified=Pose.unpack((await call('sync',{...sync,known:[]},solo.token)).peers[0]);
    assert.equal(identified.id,friend.id);assert.equal(identified.type,'tern');
    const delta=(await call('sync',{...sync,known:[friend.id]},solo.token)).peers[0];
    assert.equal(delta.length,14);assert.equal(Pose.unpack(delta,identified).name,friend.name);
    const leader=await join('opal','tour','VECTOR'),observer=await join('loom','tour','VECTOR');
    const tourPose={pos:[0,1200,0],quat:[0,0,0,1],rig:[.2,0,0,0,.3,.8,1,-.4,.6]};
    await call('sync',tourPose,leader.token);
    const tourPeer=(await call('sync',tourPose,observer.token)).peers[0];
    assert.deepEqual(tourPeer.rig,tourPose.rig);assert.equal(tourPeer.type,'opal');
    for(const [i,type] of types.slice(7).entries())assert.equal((await join(type,'pvp','EXTRA'+Math.floor(i/8))).status,200);
    const tickets=await Promise.all([...types.slice(0,7),'kite'].map(type=>join(type)));
    assert(tickets.every(ticket=>ticket.status===200&&ticket.protocol===13));
    assert.equal((await join('swift')).status,409);
    const results=await Promise.all(tickets.map(ticket=>call('sync',{controls:{...neutral,vector:true,pitch:1},weapon:'gun',type:'untrusted'},ticket.token)));
    results.forEach((state,index)=>{assert.equal(state.self.type,tickets[index].type);assert.equal(state.peers.length,7);});
    assert.equal((await join('rv8a','tour')).reason,'mode');
    assert.equal((await join('rv8a','tour','LAKE')).status,200);
  }finally{await new Promise(ok=>server.close(ok));}
}
networkCheck().then(()=>console.log('PASS: '+types.length+' selectable PvP aircraft, traits, authoritative respawns, 8-player LAN room, orbit/flyby and terrain clearance')).catch(err=>{console.error(err);process.exitCode=1;});
