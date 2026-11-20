const assert = require('node:assert/strict');
const Flight = require('./flight.js');
const {Arena} = require('./arena.cjs');
const {createServer} = require('./server.cjs');
const Outfit=require('./outfit.js');
const Sight=require('./sight.js');

function repeatableArena(seed=1){
  return new Arena(0,'waves',length=>{
    seed=(Math.imul(1664525,seed)+1013904223)>>>0;
    return Math.floor(length*seed/4294967296);
  });
}
function equip(drone,...ids){
  const kit=Outfit.maskOf(...ids);
  assert(Outfit.valid(kit));
  Object.assign(drone,{kit,pack:ids,weapon:ids[0],slotCursor:0,nextAction:0});
}

function exerciseDraw(){
  const masks=[];
  for(let mask=1;mask<2**Outfit.items.length;mask++){
    if(Outfit.valid(mask) && Outfit.items.filter(item=>Outfit.has(mask,item.id)).length>=2)masks.push(mask);
  }
  const seen=new Set();
  for(let i=0;i<masks.length;i++){
    const room=new Arena(0,'waves',length=>i%length);
    const one=room.add('one','tern');room.tick(Flight.tick);
    const [a,b]=room.mission.drones;
    seen.add(a.kit);assert.notEqual(a.kit,b.kit);
    const kit=a.kit,late=room.add('late','tern');one.target=late.target=a.id;
    room.tick(Flight.tick);
    for(const pilot of [one,late])assert.equal(room.snapshot(pilot,0).mission.contact.kit,kit);
  }
  assert.deepEqual(seen,new Set(masks));
  assert(Outfit.items.every(item=>masks.some(mask=>Outfit.has(mask,item.id))));
  console.log(masks.length+' distinct legal NPC loadouts reachable at first spawn');
}
exerciseDraw();

function exerciseDecisions(){
  const game=repeatableArena(),one=game.add('one','tern'),two=game.add('two','swift');
  game.tick(Flight.tick);game.time=4;const [a,b]=game.mission.drones;
  equip(a,'glyph','prism');equip(b,'echo','pulse');
  function decide(){game.time+=.2;game.mission.update(game);}
  decide();assert.notEqual(a.partner,b.partner,'co-op routes share coverage');
  assert.equal(a.target,a.partner);assert.equal(b.target,b.partner);
  for(const p of [one,two])p.body.pos=[7100,1100,3000];
  decide();assert.equal(a.route,'regroup');assert.equal(a.center[0],7100);
  assert.notEqual(a.target,b.target,'both pilots are viable at the same distance');
  assert.equal(a.target,a.partner);assert.equal(b.target,b.partner);
  a.body.pos=[7100,90,3100];a.body.vel[1]=-12;
  decide();assert.equal(a.route,'recover');assert(!a.fire);assert(a.controls.pitch>0);
  b.body.pos=[7100,1100,3020];b.echoAt=game.time+2;b.nextAction=0;
  decide();assert.equal(b.weapon,'pulse');assert(b.fire);assert(Outfit.has(b.kit,b.weapon));
  a.body.pos=[7090,1050,3015];a.hp-=10;decide();assert.notEqual(a.weapon,'prism');
  game.time+=.71;decide();assert.equal(a.weapon,'prism');assert(a.fire);
}
exerciseDecisions();

function exerciseEquippedActions(){
  const range={gun:330,missile:900,ribbon:1000,laser:500,pulse:200,arc:300,glyph:450,echo:120,prism:450};
  for(const {id} of Outfit.items){
    const game=repeatableArena(),pilot=game.add('pilot','tern');
    game.tick(Flight.tick);
    const [drone,other]=game.mission.drones;
    other.hp=0;
    equip(drone,id,id==='prism'?'glyph':'prism');
    drone.body=Flight.create(drone.type,[900,1450,1500],0);
    pilot.body=Flight.create(pilot.type,[900,1450,1500-range[id]],0);
    drone.shield=pilot.shield=0;
    if(id==='prism')game.damage(pilot,drone,8);
    let observed=false;
    for(let i=0;i<4/Flight.tick && !observed;i++){
      game.tick(Flight.tick);
      if(id==='gun')observed=drone.gunCount>=3 && game.tracerId>=3;
      else observed=game.events.some(e=>e.from===drone.id && e.kind===id);
    }
    assert(observed,'room never executed the equipped '+id+' action');
    const charge=Sight.profiles[id]?.fill??(id==='laser'?Sight.laser.fill:0);
    assert(game.time>=charge,'room skipped the charge for '+id);
  }
  console.log('All '+Outfit.items.length+' equipped actions executed in live physics ticks');
}
exerciseEquippedActions();

function exerciseRouteChanges(){
  const game=repeatableArena(),pilot=game.add('pilot','tern');
  game.tick(Flight.tick);game.time=4;
  const [drone,mate]=game.mission.drones;mate.hp=0;
  function decide(){game.time+=.15;game.mission.update(game);}
  drone.body=Flight.create(drone.type,[900,1450,1500],0);
  pilot.body=Flight.create(pilot.type,[900,1450,1410],0);
  equip(drone,'ribbon','prism');decide();
  assert.equal(drone.route,'space');assert.equal(drone.fire,false);
  drone.gate=null;equip(drone,'gun','prism');decide();
  assert.equal(drone.route,'pass');
  const exit=drone.gate;
  pilot.body.pos[0]+=150;decide();assert.equal(drone.gate,exit);
  pilot.glyph={id:drone.id,life:drone.life,pos:drone.body.pos.slice(),until:game.time+1.2};
  decide();assert.equal(drone.route,'escape');assert(!drone.fire);
  pilot.shield=game.time+2;decide();
  assert.equal(drone.target,null);assert.equal(drone.route,'escape');
  pilot.glyph=null;pilot.shield=game.time+5;game.time+=3;decide();
  assert.equal(drone.target,null);assert.equal(drone.gate,null);
  assert.equal(drone.route,'patrol');assert(!drone.fire);
  pilot.shield=0;decide();
  assert.equal(drone.target,pilot.id);
}
exerciseRouteChanges();

function exerciseCrossing(){
  const game=repeatableArena(),pilot=game.add('pilot','tern');
  game.tick(Flight.tick);
  const [drone,mate]=game.mission.drones;mate.hp=0;
  drone.body=Flight.create(drone.type,[900,1450,1500],0);
  pilot.body=Flight.create(pilot.type,[930,1450,1400],Math.PI);
  drone.shield=pilot.shield=0;
  equip(drone,'gun','prism');
  let passed=false,separated=false;
  for(let i=0;i<75/Flight.tick;i++){
    game.tick(Flight.tick);
    const pos=drone.body.pos,to=pilot.body.pos;
    const gap=Math.hypot(pos[0]-to[0],pos[1]-to[1],pos[2]-to[2]);
    passed ||= drone.route==='pass';
    separated ||= passed && gap>1000;
    assert(drone.hp && pilot.life===1);
    if(separated && gap<600)return;
  }
  assert.fail('NPC never caught up with a level same-type player after crossing');
}
exerciseCrossing();

function exerciseWarning(){
  const game=repeatableArena(),pilot=game.add('pilot','tern');
  game.tick(Flight.tick);
  const [drone,mate]=game.mission.drones;mate.hp=0;
  drone.shield=pilot.shield=0;
  drone.body=Flight.create(drone.type,[900,1450,1500],0);
  pilot.body=Flight.create(pilot.type,[900,1450,4500],0);
  const shot=require('./bolts.cjs').launch(1,pilot,drone,'ribbon');
  game.shots.push(shot);
  const run=seconds=>{for(let i=0;i<Math.round(seconds/Flight.tick);i++)game.tick(Flight.tick);};
  run(.6);assert(!shot.diverted);assert.equal(drone.flareCells,12);
  run(1.3);assert(shot.diverted);assert.equal(drone.flareCells,9);
  assert.equal(game.events.filter(e=>e.from===drone.id && e.kind==='flare').length,3);
  const followup=require('./bolts.cjs').launch(2,pilot,drone,'ribbon');
  game.shots.push(followup);
  run(1.8);
  assert(followup.diverted);assert.equal(drone.flareCells,6);
  assert(game.snapshot(drone,0).self.flareRefill>55);
}
exerciseWarning();

function rejoinTime(){
  const game=repeatableArena(),leader=game.add('leader','j10');
  // Keep the human at a repeatable meeting point. The NPCs fly the normal room physics.
  for(let i=0;i<45*120;i++){
    const t=i*Flight.tick;
    leader.body.pos=[7100,1150,1500+450*Math.sin(t*.025)];
    game.tick(Flight.tick);
    if(game.mission.drones.some(d=>d.hp&&Math.hypot(d.body.pos[0]-leader.body.pos[0],d.body.pos[2]-leader.body.pos[2])<1000))return t;
  }
  assert.fail('patrol failed to rejoin the moving meeting point in 45 seconds');
}
console.log('First patrol aircraft within 1 km of the meeting point after '+rejoinTime().toFixed(1)+' s');

function exerciseWaves() {
  const game = repeatableArena();
  const pilot = game.add('pilot', 'tern'), friend = game.add('friend', 'gull');
  const run = seconds => {
    for (let i=0; i<Math.round(seconds / Flight.tick); i++) game.tick(Flight.tick);
  };
  run(Flight.tick);
  equip(game.mission.drones[0],'glyph','prism');
  run(3);
  assert.equal(game.mission.wave, 1);
  const first = game.mission.drones[0], start = first.body.pos.slice();
  run(2);
  assert(Math.hypot(...start.map((p,i)=>p-first.body.pos[i])) > 30);
  assert(game.events.some(e=>e.from===first.id && e.kind==='glyph'));

  // An area effect reaches both seats. Only the hostile plane may take damage.
  pilot.body = Flight.create('tern', [900,1050,1500], 0);
  friend.body = Flight.create('gull', [950,1050,1500], 0);
  first.body = Flight.create('tern', [850,1050,1500], 0);
  const friendHp = friend.hp, enemyHp = first.hp;
  const controls = {pitch:0,roll:0,yaw:0,throttle:0};
  game.input(pilot,{controls,weapon:'pulse',kit:8,fire:true,target:friend.id});
  assert.equal(pilot.target, null);
  pilot.refitAt = game.time;
  run(Flight.tick);
  assert.equal(friend.hp,friendHp);
  assert(first.hp < enemyHp);
  for (const size of [2,3,4]) {
    assert.equal(game.mission.drones.length, size);
    assert.equal(new Set(game.mission.drones.map(d=>d.kit)).size,size);
    assert(game.mission.drones.every(d=>Outfit.valid(d.kit)&&d.pack.every(id=>Outfit.has(d.kit,id))));
    for (const drone of game.mission.drones) game.damage(pilot,drone,100);
    run(.25);
    const state = game.snapshot(pilot,0,0,[],true).mission;
    assert.equal(state.remaining,0);
    assert.equal(state.total,size);
    assert(state.countdown>0);
    const oldIds = game.mission.drones.map(d=>d.id);
    run(state.countdown + .25);
    assert(oldIds.every(id=>!game.players.has(id)));
    run(2.5); // let the next wave's spawn protection expire
  }
  assert.equal(game.mission.wave,1);
  assert.equal(pilot.kills,9);
}

async function exerciseRooms() {
  const server = createServer();
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const call = (path,data,token) => fetch('http://127.0.0.1:'+server.address().port+'/'+path,{
    method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},
    body:JSON.stringify(data)
  });
  const join = (room,mode='pve') => call('join',{room,mode,type:'tern'});
  try {
    const leader = await (await join('')).json();
    assert(leader.room && leader.rule==='waves');
    await new Promise(resolve=>setTimeout(resolve,40));
    const sync = (token,target) => call('sync',{controls:{pitch:0,yaw:0,roll:0,throttle:0},weapon:'gun',target},token).then(r=>r.json());
    const solo = await sync(leader.token);
    assert.equal(solo.mission.remaining,2);
    assert(solo.peers.every(peer=>peer.id.startsWith('ai-')));
    const team = [leader];
    for(let i=1;i<8;i++) team.push(await (await join(leader.room)).json());
    assert(team.every(p=>p.token));
    assert.equal(new Set(team.map(p=>p.slot)).size,8);
    assert.equal((await join(leader.room)).status,409);
    assert.equal((await join(leader.room,'pvp')).status,409);
    const late = await sync(team[7].token);
    assert.equal(late.peers.length,9);
    assert.deepEqual(late.peers.filter(p=>p.id.startsWith('ai-')).map(p=>p.id),solo.peers.map(p=>p.id));
    const [a,b]=solo.peers;
    const seenByLeader=(await sync(leader.token,a.id)).mission.contact;
    const seenByFriend=(await sync(team[7].token,a.id)).mission.contact;
    assert.equal(seenByLeader.id,a.id);assert(Outfit.valid(seenByLeader.kit));
    assert.equal(seenByLeader.kit,seenByFriend.kit);
    const next=(await sync(team[7].token,b.id)).mission.contact;
    assert.equal(next.id,b.id);assert.notEqual(next.kit,seenByLeader.kit);
    for(const player of team) await call('leave',{},player.token);
    assert.equal((await join(leader.room,'tour')).status,200);
  } finally {await new Promise(resolve=>server.close(resolve));}
}
function exercisePatrolResponse(){
  const arena=repeatableArena(),left=arena.add('left','tern'),right=arena.add('right','tern');
  left.body=Flight.create('tern',[-2800,1500,1600],0);
  right.body=Flight.create('tern',[4600,1500,1600],0);
  left.shield=right.shield=0;
  const advance=seconds=>{for(let i=0;i<Math.round(seconds/Flight.tick);i++)arena.tick(Flight.tick);};
  advance(Flight.tick);equip(arena.mission.drones[0],'glyph','prism');advance(3);
  const [first,second]=arena.mission.drones;
  assert(first.center[0]<690 && second.center[0]>1110,'each lane travels toward its player');
  arena.damage(left,first,8);
  advance(.45);
  assert(!arena.events.some(e=>e.from===first.id&&e.kind==='prism'));
  advance(.6);
  assert(arena.events.some(e=>e.from===first.id&&e.kind==='prism'));
  const hp=first.hp;
  arena.damage(left,first,8);assert.equal(first.hp,hp);
  left.body=Flight.create('tern',[900,1600,1500],0);
  right.body=Flight.create('tern',[915,1600,800],0);
  first.body=Flight.create(first.type,[900,1600,700],0);
  arena.input(left,{controls:{pitch:0,roll:0,yaw:0,throttle:0},weapon:'missile',target:right.id});
  arena.tick(Flight.tick);
  const marks=new Map(arena.snapshot(left,0).tracking.marks);
  assert(marks.has(first.id) && !marks.has(right.id));
  assert.equal(arena.snapshot(right,0).self.warned,false);
}
exerciseWaves();
exercisePatrolResponse();
exerciseRooms().then(()=>console.log('PASS PvE waves, AI flight and attacks, friendly fire, solo and eight-seat co-op'));
