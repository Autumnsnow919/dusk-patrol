const assert=require('node:assert/strict');
const {Arena}=require('./arena.cjs');
const Flight=require('./flight.js');
const Sight=require('./sight.js');
const Bolts=require('./bolts.cjs');
const {createServer}=require('./server.cjs');
const idle={pitch:0,roll:0,yaw:0,throttle:0};
for(const [weapon,side,range] of [['missile',.25,1950],['ribbon',.12,4300]]){
  const spec=Sight.profiles[weapon],b=Flight.create('tern',[0,900,0],0);
  const inside=(x,z)=>Sight.inRing(b,[x,900,z],spec.ring,spec.reach,spec.inner);
  assert(inside(side*900,-900));assert(inside(0,-range));
  assert(!inside((spec.ring+.01)*900,-900));assert(!inside(0,-spec.reach-1));assert(!inside(0,900));
}
const room=new Arena(0);
{
  const game=new Arena(0),p=game.add('p'),left=game.add('left'),right=game.add('right');
  for(const pilot of [p,left,right])pilot.shield=0;
  p.body=Flight.create('tern',[0,1500,0],0);p.autoFocus=true;p.weapon='missile';
  left.body.pos=[1,1500,-900];right.body.pos=[4,1500,-900];
  game.scan(p,Sight.profiles.missile,.1);assert.equal(p.focus,'left');
  right.body.pos[0]=0;game.scan(p,Sight.profiles.missile,.1);assert.equal(p.focus,'left');
  left.body.pos[0]=80;game.scan(p,Sight.profiles.missile,.1);assert.equal(p.focus,'right');
}
const a=room.add('a','tern','北辰'),b=room.add('b','tern','砂鸥');
a.shield=b.shield=0;
function place(point){
  a.body=Flight.create('tern',[900,900,1500],0);
  b.body=Flight.create('tern',point,0);
}
function tick(count,fire=false){
  for(let i=0;i<count;i++){
    room.input(a,{controls:idle,target:b.id,weapon:'missile',fire});
    room.tick(Flight.tick);
  }
}
place([900,900,1500-Sight.reach-110]);tick(160,true);
assert.equal(a.acquire,0);assert.equal(room.shots.length,0);
place([1100,900,1000]);tick(160,true);assert.equal(a.acquire,0);
place([900,900,1000]);tick(40,true);
assert(room.snapshot(b,0).self.warned);assert.equal(room.shots.length,0);
place([1150,900,1000]);tick(1,true);assert.equal(a.acquire,0);assert(!room.snapshot(b,0).self.warned);
place([900,900,1000]);tick(130);assert.equal(room.snapshot(a,0).self.acquire,100);
tick(1,true);assert.equal(room.shots.length,1);
assert(room.snapshot(b,0).self.incoming);assert(!room.snapshot(b,0).self.warned);
const start=room.shots[0].pos.slice();tick(12);assert.notDeepEqual(room.shots[0].pos,start);
room.input(b,{weapon:'gun',controls:idle,dodge:true});
const fired=room.shots[0];
assert(room.snapshot(b,0).self.incoming && !fired.diverted);
const fresh=room.snapshot(b,0),row=fresh.decoys[0];
assert(Array.isArray(row));assert.equal(room.snapshot(b,fresh.serial).decoys[0],row[0]);
while(room.shots.length && room.time-fresh.clock/1000<3)room.tick(Flight.tick);
assert.equal(b.hp,100);assert.equal(room.shots.length,0);
assert(fired.diverted && room.snapshot(b,0).self.diverted);
assert(!room.snapshot(b,0).self.incoming);
const glow=fired.decoy;assert(glow && glow.pos.some((v,i)=>Math.abs(v-glow.start[i])>2));
const packets=room.events.filter(e=>e.kind==='flare');
assert.equal(packets.length,3);assert.equal(b.flareCells,9);
assert(packets[0].at<packets[1].at && packets[1].at<packets[2].at);
assert.notDeepEqual(packets[0].a,packets[2].a);
const sortie=b.life;
// Hold the control after the first tap, including across a loadout change.
for(let i=0;i<5/Flight.tick;i++){
  room.input(b,{weapon:'gun',kit:1,controls:idle,dodge:true});
  room.tick(Flight.tick);
}
assert.equal(b.life,sortie);
const releases=room.events.filter(e=>e.kind==='flare');
assert.equal(releases.length,12);
assert(releases.at(-1).at-releases[3].at<2.1); // Nine rounds held continuously after the first burst.
for(let i=1;i<12;i++)assert(releases[i].at-releases[i-1].at>=.24-1e-8);
const empty=room.snapshot(b,0).self;
assert.equal(empty.flares,0);assert.equal(empty.puffs,0);assert.equal(empty.dodge,0);
const deadline=releases[0].at+60;
function before(deadline){while(room.time+Flight.tick<deadline)room.tick(Flight.tick);}
before(deadline);
assert.equal(b.flareCells,0);
room.tick(Flight.tick);assert.equal(b.flareCells,1);
// Spending the newly recovered single item must not reset the ongoing clock.
for(let i=0;i<240;i++)room.tick(Flight.tick);
room.input(b,{weapon:'gun',controls:idle,dodge:true});assert.equal(b.flareCells,0);assert.equal(b.puffs,0);
before(deadline+60);assert.equal(b.flareCells,0);
room.tick(Flight.tick);assert.equal(b.flareCells,1);assert.equal(b.life,sortie);
// The clock stops at capacity and the next draw starts a fresh minute.
{
  const game=new Arena(0),pilot=game.add('test','tern');
  game.input(pilot,{controls:idle,weapon:'gun',dodge:true});
  for(let i=0;i<70;i++)game.tick(Flight.tick);
  for(const [minute,expected] of [[1,10],[2,11],[3,12],[4,12]]){
    game.time=minute*60-Flight.tick;
    game.tick(Flight.tick);assert.equal(pilot.flareCells,expected);
  }
  assert.equal(game.snapshot(pilot,0).self.flareRefill,0);
  game.input(pilot,{controls:idle,weapon:'gun',dodge:true});
  assert.equal(game.snapshot(pilot,0).self.flareRefill,60);
}

// A level player spending their last burst still faces the next launch.
{
  const game=new Arena(0),sender=game.add('sender','tern'),receiver=game.add('receiver','tern');
  sender.shield=receiver.shield=0;
  receiver.flareCells=3;
  sender.body=Flight.create('tern',[900,1450,1500],0);
  receiver.body=Flight.create('tern',[900,1450,1100],0);
  let first=null,followup=false,impact=false;
  for(let i=0;i<10/Flight.tick && !impact;i++){
    game.input(sender,{controls:idle,weapon:'missile',target:receiver.id,fire:true});
    game.tick(Flight.tick);
    const arriving=game.shots.find(s=>!s.diverted);
    if(arriving){
      game.input(receiver,{controls:idle,weapon:'gun',dodge:true});
      if(!first)first=arriving;
      else if(first!==arriving){assert.equal(receiver.flareCells,0);followup=true;}
    }
    impact=game.events.some(e=>e.kind==='hit' && e.to===receiver.id);
  }
  assert(first?.diverted && followup && impact,'the follow-up should reach the player with an empty dispenser');
  assert.equal(receiver.flareCells,0);
}

function movementPass(input,briefRoll=false,weapon='missile'){
  const pilot={id:'a',body:Flight.create('tern',[500,900,2000],0)};
  const target={id:'b',hp:100,life:1,body:Flight.create('pulse',[500,900,1600],.30)};
  const bolt=Bolts.launch(1,pilot,target,weapon);
  for(let i=0;i<600;i++){
    Flight.step(target.body,input,Flight.tick);
    if(briefRoll)target.body.controls[2]=bolt.stage===2 && bolt.elapsed<.025?.8:0;
    const result=Bolts.step(bolt,target,Flight.tick);if(result)return result;
  }
}
assert.equal(movementPass(idle),'hit');
assert.equal(movementPass({...idle,pitch:1,roll:1,throttle:1,vector:true}),'fade');
for(const weapon of ['missile','ribbon'])assert.equal(movementPass(idle,true,weapon),'hit');

// A level crossing used to miss even with a full capture and no evasive input.
for(const weapon of ['missile','ribbon']){
  for(const heading of [0,Math.PI/2,Math.PI*.75]){
    const pilot={id:'one',body:Flight.create('tern',[0,1200,0],0)};
    const distance=weapon==='ribbon'?1800:500;
    const target={id:'two',hp:100,life:1,body:Flight.create('opal',[0,1200,-distance],heading)};
    const shot=Bolts.launch(1,pilot,target,weapon);
    let outcome;
    for(let i=0;i<1200&&!outcome;i++){
      Flight.step(target.body,idle,Flight.tick);
      outcome=Bolts.step(shot,target,Flight.tick);
    }
    assert.equal(outcome,'hit',weapon+' crossing at '+heading);
  }
}

function checkTracks(weapon){
  const game=new Arena(0),pilot=game.add('pilot','tern');
  pilot.body=Flight.create('tern',[0,1400,0],0);
  pilot.shield=0;pilot.kit=weapon==='missile'?3:65;
  const peers=['a','b','c','d','outside'].map((id,i)=>{
    const peer=game.add(id,'tern');peer.shield=0;
    peer.body=Flight.create('tern',[i===4?450:15*(i-1),1400,-900-50*i],0);
    return peer;
  });
  function advance(count,target,fire=false){
    for(let i=0;i<count;i++){game.input(pilot,{controls:idle,weapon,target,fire});game.tick(Flight.tick);}
  }
  const snapshot=()=>game.snapshot(pilot,0).tracking;
  advance(60,'outside',true);
  const initial=snapshot();
  assert.equal(initial.focus,'a');
  assert.deepEqual(initial.marks.map(([id])=>id),['a','b','c']);
  assert(initial.marks.every(([,pct])=>pct>0 && pct<100));
  assert.deepEqual(peers.map(p=>game.snapshot(p,0).self.warned),[true,true,true,false,false]);
  advance(200,'outside',true);
  assert.equal(game.shots.length,0,'an input naming another contact must not spend a shot');
  advance(1,'d');
  assert.deepEqual(snapshot().marks,[['a',100],['b',100],['d',0]]);
  game.input(pilot,{controls:idle,weapon,target:'b',fire:true,fireLife:peers[1].life-1});
  game.tick(Flight.tick);assert.equal(game.shots.length,0);
  game.input(pilot,{controls:idle,weapon,target:'b',fire:true});
  assert.equal(snapshot().focus,'b','the sync that handles T must echo its new primary');
  game.tick(Flight.tick);
  assert.deepEqual(game.shots.map(s=>s.to),['b']);
  assert.deepEqual(game.snapshot(pilot,0,0,[],true).tracking,snapshot());
  assert.equal(new Map(snapshot().marks).get('a'),100);
  assert(game.snapshot(peers[1],0).self.incoming);
  game.reset(peers[0]);advance(1,'a');
  assert(!new Map(snapshot().marks).has('a'));
  game.input(pilot,{controls:idle,weapon:'gun'});
  assert.equal(game.snapshot(pilot,0).tracking,undefined);
}
checkTracks('missile');
checkTracks('ribbon');
for(const weapon of ['missile','ribbon']){
  const offset=800*(Sight.profiles[weapon].ring+.035);
  const game=new Arena(0),pilot=game.add('pilot','tern');
  pilot.shield=0;pilot.kit=weapon==='ribbon'?65:3;
  pilot.body=Flight.create('tern',[0,1500,0],0);
  for(const [id,x,z] of [['outer',offset,-800],['left',-14,-900],['right',17,-1000],['center',0,-1100]]){
    const p=game.add(id,'tern');p.shield=0;p.body=Flight.create('tern',[x,1500,z],0);
  }
  for(let i=0;i<240;i++){game.input(pilot,{controls:idle,weapon,target:'right',autoFocus:true});game.tick(Flight.tick);}
  assert.equal(pilot.focus,'center','center wins regardless of join order');
  assert(!pilot.marks.has('outer'),'outside the displayed capture ring');
  game.input(pilot,{controls:idle,weapon,target:'left',autoFocus:false});
  assert.equal(pilot.focus,'left','T overrides automatic focus');
}

{
  const game=new Arena(0),pilot=game.add('pilot','tern'),peer=game.add('peer','tern');
  pilot.shield=peer.shield=0;pilot.kit=4;
  pilot.body=Flight.create('tern',[900,1300,1600],0);
  peer.body=Flight.create('tern',[900,1300,1000],0);
  const beam=fire=>{game.input(pilot,{controls:idle,weapon:'laser',target:peer.id,fire});game.tick(Flight.tick);};
  for(let i=0;i<65;i++)beam(true);
  assert(game.snapshot(peer,0).self.warned && game.snapshot(pilot,0).self.lock>0);
  beam(false);assert.equal(game.snapshot(pilot,0).self.lock,0);
  peer.body.pos[0]+=220;
  for(let i=0;i<280;i++)beam(true);
  assert.equal(peer.hp,100);assert.equal(game.snapshot(pilot,0).self.lock,0);
  peer.body.pos[0]-=220;
  for(let i=0;i<280;i++)beam(true);
  assert.equal(peer.hp,0);
}

// Identical straight passes. An offset still inside the old 32-unit bubble
// misses the entire airframe. A crossing cannon round removes both objects.
function crossing(offset,defend,bystander=false,weapon='missile'){
  const game=new Arena(0),caster=game.add('caster','tern'),pilot=game.add('pilot','tern');
  caster.shield=pilot.shield=0;caster.body=Flight.create('tern',[-700,1200,1600],0);
  pilot.body=Flight.create('tern',[400,1200,1500],0);
  if(bystander){const third=game.add('third','tern');third.shield=0;third.body=Flight.create('tern',[400,1200,1410],0);}
  const shot=Bolts.launch(1,caster,pilot,weapon);
  Object.assign(shot,{pos:[400+offset,1200,1340],start:[400+offset,1200,1340],end:[400+offset,1200,1600],elapsed:0,duration:.6,stage:2,arch:0});
  game.shots.push(shot);
  for(let i=0;i<95;i++){
    game.input(pilot,{controls:idle,weapon:'gun',target:null,fire:defend});
    game.tick(Flight.tick);
  }
  return {events:game.events,pilot,game};
}
const direct=crossing(0,false),miss=crossing(22,false),intercept=crossing(0,true),third=crossing(0,false,true);
// Pixel-model fixtures on the fictional Tern. Each vertical pass spans a
// whole tick, including target motion, resolution, scoring and the wire event.
function hitZone(x,z,weapon,shield=false,cooperative=false,bank=0){
  const game=new Arena(0,cooperative?'waves':'beacon'),caster=game.add('caster','tern');
  if(cooperative)game.tick(Flight.tick);
  const pilot=cooperative?game.mission.drones[0]:game.add('target','tern');
  pilot.body=Flight.create('tern',[5000,1200,5000],0);pilot.shield=0;
  pilot.body.quat=[0,0,Math.sin(bank/2),Math.cos(bank/2)];
  pilot.body.basis=Flight.axes(pilot.body.quat);
  pilot.body.gear=1;pilot.body.gearDown=true;
  if(shield)pilot.prismUntil=game.time+1;
  const {r,u,f}=pilot.body.basis;
  const point=y=>pilot.body.pos.map((v,i)=>v+x*r[i]+y*u[i]-z*f[i]);
  const start=point(-40),end=point(40);
  const shot=Bolts.launch(1,caster,pilot,weapon);
  Object.assign(shot,{stage:2,pos:start.slice(),start,end,elapsed:0,duration:Flight.tick,arch:0});
  game.shots.push(shot);game.tick(Flight.tick);
  const state=game.snapshot(pilot,0);
  assert.equal(game.shots.length,0);
  return {pilot,hit:state.events.find(e=>e.kind==='hit'),caster,state};
}
for(const weapon of ['missile','ribbon']){
  for(const [part,x,z,hull,local] of [
    ['fuselage',0,-10,100,100],['leftWing',-10,0,42,78],['rightWing',10,0,42,78],
    ['tail',-5,11,54,82],['engine',-3,7,62,88],['leftGear',-2,1,18,100],
    ['rightGear',2,1,18,100],['noseGear',0,-4,18,100]
  ]){
    const {pilot,hit,caster,state}=hitZone(x,z,weapon,false,weapon==='ribbon');
    assert.equal(hit?.part,part,weapon+' '+part);
    assert.equal(state.self.hp,100-hull);assert.equal(caster.kills,Number(hull===100));
    for(const [id,value] of Object.entries(pilot.body.condition))
      assert.equal(value,100-(id==='fuselage'?hull:id===part?local:0),part+' affects '+id);
  }
}
const blockedWing=hitZone(-10,0,'missile',true);
const banked=hitZone(-10,0,'ribbon',false,false,Math.PI*.65);
assert.equal(banked.hit.part,'leftWing');assert.equal(banked.pilot.body.condition.rightWing,100);
assert.equal(blockedWing.pilot.hp,100);assert.equal(blockedWing.hit.part,undefined);
assert(blockedWing.state.events.some(e=>e.kind==='refract'));
assert.equal(direct.pilot.hp,0);assert.equal(direct.game.players.get('caster').kills,1);assert.equal(miss.pilot.hp,100);assert(miss.events.some(e=>e.kind==='fade'));
assert.equal(intercept.pilot.hp,100);assert.equal(intercept.game.shots.length,0);assert.equal(intercept.events.filter(e=>e.kind==='intercept').length,1);
assert(!intercept.events.some(e=>e.kind==='hit'));assert.equal(intercept.pilot.kills,0);
assert.equal(third.pilot.hp,100);assert.equal(third.game.players.get('third').hp,0);
const Outfit=require('./outfit.js');
assert(Outfit.valid(65) && Outfit.cost(65)===7);
assert(!Outfit.valid(66) && !Outfit.keys.includes('Digit7'));
for(const [weapon,range,expected] of [['missile',400,true],['ribbon',400,false],['missile',2400,false],['ribbon',2400,true]]){
  const trial=new Arena(0),p=trial.add('one','opal'),q=trial.add('two','opal');
  p.body=Flight.create('opal',[900,1300,1500],0);
  q.body=Flight.create('opal',[900,1300,1500-range],0);
  p.shield=q.shield=0;
  assert(!trial.input(p,{controls:idle,weapon,kit:66}));
  p.kit=weapon==='ribbon'?65:3;
  const command={controls:idle,weapon,target:q.id};
  for(let i=0;i<240;i++){trial.input(p,command);trial.tick(Flight.tick);}
  assert.equal(trial.snapshot(p,0).self.acquire,expected?100:0);
  if(expected){
    trial.input(p,{...command,weapon:'gun'});assert.equal(p.acquire,0);
    for(let i=0;i<240 && !trial.shots.length;i++){trial.input(p,{...command,fire:true});trial.tick(Flight.tick);}
    assert.equal(trial.shots.length,1);assert.equal(trial.snapshot(p,0).shots[0][8],weapon);
    assert(Math.abs(trial.snapshot(p,0).self.cool-Sight.profiles[weapon].wait)<1e-8);
    assert(trial.snapshot(q,0).self.incoming);
    trial.input(q,{controls:idle,weapon:'gun',dodge:true});assert(!trial.shots[0].diverted);assert.equal(trial.decoys.length,1);
  }else{
    trial.input(p,{...command,fire:true});trial.tick(Flight.tick);assert.equal(trial.shots.length,0);
  }
}
assert.equal(crossing(0,false,false,'ribbon').pilot.hp,0);
const contact=require('./contacts.cjs');
assert.equal(contact.orb([-100,0,0],[100,0,0],[0,32.1,0],[0,32.1,0],32),Infinity);
assert(contact.orb([-100,0,0],[100,0,0],[0,-100,0],[0,100,0],32)<.5);
assert.equal(contact.orb([-100,0,0],[0,0,0],[0,0,0],[100,0,0],32),Infinity);
{
  const game=new Arena(0),p=game.add('p','tern'),q=game.add('q','tern');
  p.shield=q.shield=0;p.body=Flight.create('tern',[900,1450,1600],0);
  q.body=Flight.create('tern',[900,1450,-1400],0);
  const shot=Bolts.launch(1,p,q,'ribbon');game.shots.push(shot);
  game.input(q,{controls:idle,weapon:'gun',dodge:true});
  for(let i=0;i<600 && game.shots.length;i++)game.tick(Flight.tick);
  assert(!shot.diverted);assert(!q.hp);assert(!game.decoys.length);
}
{
  const game=new Arena(0),pilot=game.add('solo','tern');
  game.input(pilot,{controls:idle,weapon:'gun',dodge:true});
  for(let i=0;i<60;i++)game.event('spark',pilot,pilot);
  const sync=game.snapshot(pilot,0);
  assert(!sync.events.some(e=>e.kind==='flare'));
  assert(Array.isArray(sync.decoys[0]),'late join reconstructs active effects past the event window');
  game.remove(pilot.id);assert.equal(game.decoys.length,0);
}
const sweeping={prev:[0,100,0],pos:[0,100,30],axes:contact.basisOf([0,0,1])};
assert(contact.tracer(sweeping,[-20,100,15],[20,100,15])<1);
assert.equal(contact.tracer(sweeping,[-20,108,15],[20,108,15]),Infinity);
assert.equal(contact.tracer(sweeping,[-20,100,30],[20,100,30]),Infinity);

{
  const body=Flight.create('sail',[0,1000,0],0),peer={body,priorPos:body.pos},hit={};
  assert(contact.gun([-40,1004.6,0],[40,1004.6,0],peer)<1);
  assert.equal(contact.gun([-40,1005.1,0],[40,1005.1,0],peer),Infinity);
  assert(contact.gun([body.span+2,1000,-40],[body.span+2,1000,40],peer,hit)<1);
  assert.equal(hit.part,'rightWing');
  // Both endpoints miss a fast crossing avatar.
  peer.priorPos=[-60,1000,0];body.pos=[60,1000,0];
  assert(contact.gun([0,1000,-40],[0,1000,40],peer)<1);
}
const gallery=new Arena(0),gunner=gallery.add('gunner','tern'),runner=gallery.add('runner','tern');
gunner.shield=runner.shield=0;
gunner.body=Flight.create('tern',[900,900,1600],0);
runner.body=Flight.create('tern',[900,900,1400],0);
gallery.input(gunner,{controls:idle,target:null,weapon:'gun',fire:true});
gallery.tick(Flight.tick);assert.equal(runner.hp,100);assert.equal(gallery.tracers.length,1);
gallery.input(gunner,{controls:idle,target:null,weapon:'gun',fire:false});
for(let i=0;i<45;i++)gallery.tick(Flight.tick);
assert.equal(runner.hp,96);assert(runner.body.damaged);assert(runner.body.condition.fuselage<100);
// A shot one wing-width off the centerline must damage that wing.
gunner.gunAt=0;gunner.body=Flight.create('tern',[907,900,1600],0);
runner.body=Flight.create('tern',[900,900,1400],0);runner.hp=100;
gallery.input(gunner,{controls:idle,weapon:'gun',fire:true});
gallery.tick(Flight.tick);gallery.input(gunner,{controls:idle,weapon:'gun',fire:false});
for(let i=0;i<45;i++)gallery.tick(Flight.tick);
assert.equal(runner.hp,96);assert(runner.body.condition.rightWing<100);assert.equal(runner.body.condition.leftWing,100);
gallery.remove(runner.id);
gunner.heat=0;
const previousCount=gunner.gunCount;
const hold=()=>gallery.input(gunner,{controls:idle,target:null,weapon:'gun',fire:true});
for(let i=0;i<400&&!gunner.hot;i++){hold();gallery.tick(Flight.tick);}
assert.equal(gunner.gunCount-previousCount,96);
assert(gunner.hot);const stamp=gunner.lastGun;
for(let i=0;i<160;i++){hold();gallery.tick(Flight.tick);}
assert.equal(stamp,gunner.lastGun);assert(gunner.hot);
for(let i=0;i<200;i++){hold();gallery.tick(Flight.tick);}
assert(gunner.lastGun>stamp);assert(!gunner.hot);
// Hold eight independent triggers. Each pellet gets its own live ID, including
// after a missed snapshot; acknowledging IDs must avoid a second full upload.
const stream=new Arena(0),pilots=[];
for(let n=0;n<8;n++){
  const p=stream.add('stream'+n,'tern');
  p.body=Flight.create('tern',[120*n,1450,1700],0);p.shield=0;pilots.push(p);
}
let ack=0;
for(let frame=1;frame<=120;frame++){
  for(const p of pilots)stream.input(p,{controls:idle,weapon:'gun',fire:true});
  stream.tick(Flight.tick);
  if(frame===52)ack=stream.snapshot(pilots[0],0).tracerSeq;
}
assert(pilots.every(p=>p.gunCount===30 && !p.hot));
const full=stream.snapshot(pilots[0],0),delta=stream.snapshot(pilots[0],0,ack);
assert.deepEqual(full.live,[full.tracers[0][0],240]);
assert.equal(full.tracers.length,8*25);
assert.deepEqual(delta.tracers,full.tracers.filter(t=>t[0]>ack));
assert.equal(stream.snapshot(pilots[0],0,240).tracers.length,0);
stream.remove(pilots[2].id);
const ranges=stream.snapshot(pilots[0],0).live,idsFromRanges=[];
for(let i=0;i<ranges.length;i+=2)for(let id=ranges[i];id<=ranges[i+1];id++)idsFromRanges.push(id);
assert.deepEqual(idsFromRanges,stream.tracers.map(t=>t.id));
const clickRoom=new Arena(0),clicker=clickRoom.add('tap','tern');
clickRoom.input(clicker,{controls:idle,weapon:'gun',fire:false,tap:true});
for(let i=0;i<16;i++)clickRoom.tick(Flight.tick);
assert.equal(clicker.gunCount,1);
// Fire a free streak into a tower and verify that the obstacle consumes it.
const block=new Arena(0),shooter=block.add('p','tern');shooter.shield=0;
shooter.body=Flight.create('tern',[255,205,-30],0);
block.input(shooter,{controls:idle,weapon:'gun',fire:true});block.tick(Flight.tick);
assert.equal(block.tracers.length,1);
block.input(shooter,{controls:idle,weapon:'gun',fire:false});
for(let i=0;i<10;i++)block.tick(Flight.tick);assert.equal(block.tracers.length,0);
const bridgeShot=Bolts.launch(99,{id:'p',body:Flight.create('tern',[530,121,-60],0)},
  {id:'q',life:1,body:Flight.create('tern',[530,121,-140],0)});
let bridgeContact;
for(let i=0;i<240&&!bridgeContact;i++)bridgeContact=Bolts.step(bridgeShot,{hp:100,life:1,body:Flight.create('tern',[530,121,-140],0)},Flight.tick);
assert.equal(bridgeContact,'fade');
const helper=room.add('c','heron','苍鹭');b.shield=0;
room.damage(helper,b,11);room.damage(a,b,100);
assert.equal(helper.assists,1);assert.equal(a.kills,1);
tick(270);
assert.equal(b.life,sortie+1);assert.equal(b.flareCells,12);assert.equal(b.puffs,0);
const crown=new Arena(0,'crown'),firstStar=crown.add('one'),secondStar=crown.add('two');
firstStar.shield=secondStar.shield=0;
for(let i=0;i<970;i++)crown.tick(Flight.tick);
assert.equal(firstStar.beacons,1);assert.equal(crown.starId,'one');
crown.damage(secondStar,firstStar,100);
assert.equal(crown.starId,'two');assert.equal(secondStar.beacons,2);assert.equal(crown.starTime,0);
async function network(){
  await checkBufferedLaunch();
  const server=createServer();await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const base='http://127.0.0.1:'+server.address().port;
  async function post(path,data,token){
    const res=await fetch(base+'/'+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
    return {status:res.status,...await res.json()};
  }
  try{
    for(const mode of ['tour','pvp']){
      const join=name=>post('join',{room:mode.toUpperCase(),mode,type:'gull',name});
      const first=await join('北辰'),second=await join('北辰');
      if(mode==='pvp')assert.equal((await post('join',{room:'PVP',mode,type:'tern',rule:'crown'})).status,409);
      assert.equal(first.name,'北辰');assert.equal(second.name,'北辰·2');
      assert.equal((await join('<script>')).status,400);
      const state=mode==='tour'?{pos:[0,900,0],quat:[0,0,0,1]}:{controls:idle,weapon:'gun'};
      await post('sync',state,first.token);
      assert.equal((await post('sync',state,second.token)).peers[0].name,'北辰');
    }
  }finally{await new Promise(ok=>server.close(ok));}
}
async function checkBufferedLaunch(){
  const source=require('node:fs').readFileSync(require.resolve('./room.js'),'utf8');
  const FlightRoom=require('node:vm').runInNewContext(source+';FlightRoom',{Sight,Flight,Outfit,performance});
  const game=new Arena(0),pilot=game.add('pilot','tern'),client=new FlightRoom();
  client.leave();client.mode='pvp';client.token='test';client.selectWeapon('missile');
  for(const [id,x,z] of [['pilot',0,0],['A',-15,-650],['B',15,-650]]){
    const p=game.players.get(id)??game.add(id,'tern');
    p.shield=0;p.body=Flight.create('tern',[x,1300,z],0);
  }
  for(let i=0;i<140;i++){
    game.input(pilot,{controls:idle,target:'A',weapon:'missile'});game.tick(Flight.tick);
  }
  client.request=async(_,command)=>{
    assert(game.input(pilot,command));game.tick(Flight.tick);return game.snapshot(pilot,0);
  };
  client.target='A';
  const now=performance.now();
  await client.sync(null,now,idle,false);
  assert.equal(client.marks.get('A'),100);
  client.pressTrigger();client.cycleTarget();assert.equal(client.target,'B');
  await client.sync(null,now+70,idle,false);
  assert.equal(game.shots[0]?.to,'A');assert.equal(client.target,'B');
  pilot.missileAt=0;
  await client.sync(null,now+140,idle,true);
  assert.equal(game.shots.length,1,'holding the key cannot launch at a different contact');
  client.self=empty;
  assert.equal(client.flareReadout(),'热诱弹 0/12 · 已耗尽 · '+empty.flareRefill+' 秒后补 1 枚');
  assert.equal(client.flareReadout(true),'来袭 · 热诱弹已耗尽');
}
network().then(()=>console.log('PASS ring and range, continuous capture, warnings, moving shot, maneuver miss, decoy, assists and distinct names in both rooms')).catch(e=>{console.error(e);process.exitCode=1;});
