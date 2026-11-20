const assert = require('node:assert/strict');
const Flight = require('./flight.js');
const {Arena} = require('./arena.cjs');
const {createServer} = require('./server.cjs');
const Outfit=require('./outfit.js');

function exerciseDecisions(){
  const game=new Arena(0,'waves'),one=game.add('one','tern'),two=game.add('two','swift');
  game.tick(Flight.tick);game.time=4;const [a,b]=game.mission.drones;
  function decide(){game.time+=.2;game.mission.update(game);}
  decide();assert.notEqual(a.partner,b.partner,'co-op routes share coverage');
  for(const p of [one,two])p.body.pos=[7100,1100,3000];
  decide();assert.equal(a.route,'regroup');assert.equal(a.center[0],7100);
  a.body.pos=[7100,90,3100];a.body.vel[1]=-12;
  decide();assert.equal(a.route,'recover');assert(!a.fire);assert(a.controls.pitch>0);
  b.body.pos=[7100,1100,3020];b.echoAt=game.time+2;
  decide();assert.equal(b.weapon,'pulse');assert(b.fire);assert(Outfit.has(b.kit,b.weapon));
  a.body.pos=[7090,1050,3015];a.hp-=10;decide();assert.notEqual(a.weapon,'prism');
  game.time+=.71;decide();assert.equal(a.weapon,'prism');assert(a.fire);
}
exerciseDecisions();

function rejoinTime(){
  const game=new Arena(0,'waves'),leader=game.add('leader','j10');
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
  const game = new Arena(0, 'waves');
  const pilot = game.add('pilot', 'tern'), friend = game.add('friend', 'gull');
  const run = seconds => {
    for (let i=0; i<Math.round(seconds / Flight.tick); i++) game.tick(Flight.tick);
  };
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
    const sync = token => call('sync',{controls:{pitch:0,yaw:0,roll:0,throttle:0},weapon:'gun'},token).then(r=>r.json());
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
    for(const player of team) await call('leave',{},player.token);
    assert.equal((await join(leader.room,'tour')).status,200);
  } finally {await new Promise(resolve=>server.close(resolve));}
}
function exercisePatrolResponse(){
  const arena=new Arena(0,'waves'),left=arena.add('left','tern'),right=arena.add('right','tern');
  left.body=Flight.create('tern',[-2800,1500,1600],0);
  right.body=Flight.create('tern',[4600,1500,1600],0);
  left.shield=right.shield=0;
  const advance=seconds=>{for(let i=0;i<Math.round(seconds/Flight.tick);i++)arena.tick(Flight.tick);};
  advance(3);
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
