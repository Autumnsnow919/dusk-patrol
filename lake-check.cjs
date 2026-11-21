const assert=require('node:assert/strict');
const Flight=require('./flight.js');
const Lake=require('./lake.js');
const Outfit=require('./outfit.js');
const {Arena}=require('./arena.cjs');
const {createServer}=require('./server.cjs');
const {makeHeightSampler}=require('./terrain.js');
const controls={pitch:0,roll:0,yaw:0,throttle:0};
const command=(weapon,other={})=>({controls,weapon,...other});
const ground=makeHeightSampler();
for(const gate of Lake.gates){
  const a=[gate.x,gate.y,gate.z-3],b=[gate.x,gate.y,gate.z+3];
  assert(Lake.crosses(gate,a,b));assert(!Lake.crosses(gate,b,a));
  assert(!Lake.touches([gate.x,gate.y,gate.z]));assert(ground(gate.x,gate.z)<gate.y-5);
}
assert(Lake.touches([530,121,-90]));assert(Lake.touches([255,200,-108]));
assert(Lake.touches([Lake.gates[2].x+Lake.gates[2].w,Lake.gates[2].y,Lake.gates[2].z]));
assert.equal(Lake.vertices().length%30,0);
const arena=new Arena(0),pilot=arena.add('pilot','tern'),peer=arena.add('peer','osprey');
for(const bad of [0,-1,15,4.5,'5',1<<Outfit.items.length,6])assert(!arena.input(pilot,command('gun',{kit:bad})));
assert.equal(pilot.kit,3);assert.equal(Outfit.cost(5),7);assert.equal(Outfit.cost(10),7);
assert(arena.input(pilot,command('laser',{kit:5,fire:true,target:peer.id})));assert.equal(pilot.refitAt,5);
arena.time=1;arena.input(pilot,command('laser',{kit:5}));assert.equal(pilot.refitAt,5);
arena.input(pilot,command('missile',{fire:true}));assert(!pilot.fire);assert.equal(pilot.weapon,'laser');
arena.reset(pilot);assert.equal(pilot.kit,5);
pilot.body=Flight.create('tern',[530,83,-101],Math.PI);
for(let i=0;i<32;i++)arena.tick(Flight.tick);
assert.equal(pilot.hp,100);assert(pilot.body.pos[2]>-90);
pilot.body=Flight.create('tern',[530,121,-91],Math.PI);arena.tick(Flight.tick);assert.equal(pilot.hp,0);
arena.reset(pilot);pilot.body=Flight.create('tern',[530,1,-91],Math.PI);arena.tick(Flight.tick);assert.equal(pilot.hp,0);
arena.reset(pilot);
const site=Lake.sites[Lake.relayOrder[0]];
arena.time=10;pilot.shield=peer.shield=0;
peer.body=Flight.create(peer.type,[2200,900,2200],0);
for(let i=0;i<500;i++){pilot.body.pos=site.pos.slice();arena.tick(Flight.tick);}
assert.equal(pilot.beacons,1);
peer.body.pos=site.pos.slice();peer.body.pos[0]+=75;arena.tick(Flight.tick);assert.equal(arena.zoneCount,2);assert.equal(arena.hold,0);
arena.matchTime=Lake.relayDuration-.002;arena.tick(Flight.tick);assert.equal(arena.beaconSite(),Lake.relayOrder[1]);
arena.input(pilot,command('pulse',{kit:10,fire:true}));
pilot.body.pos=[0,900,0];peer.body.pos=[0,900,80];arena.tick(Flight.tick);assert.equal(peer.hp,100);
arena.time=pilot.refitAt+.01;arena.input(pilot,command('pulse',{fire:true}));arena.tick(Flight.tick);assert.equal(peer.hp,77);
assert.equal(arena.snapshot(pilot,0).self.kit,10);
// Both new items fit in one seven-point kit. All distances here are game units.
const echoArc=(1<<7)|(1<<8);
assert(Outfit.valid(echoArc));assert.equal(Outfit.cost(echoArc),7);
const party=new Arena(0,'crown');
const pilots=['sender','selected','near','far'].map(id=>party.add(id,'ember'));
const [sender,selected,near,far]=pilots;
for(const [i,x] of [0,100,240,305].entries()){
  pilots[i].body=Flight.create('ember',[x,1400,0],0);pilots[i].shield=0;
}
party.input(sender,command('arc',{kit:echoArc,fire:true,target:selected.id}));
party.tick(Flight.tick);assert.equal(selected.hp,100);
party.time=6;
const cast=()=>{party.input(sender,command('arc',{fire:true,target:selected.id}));party.tick(Flight.tick);};
cast();assert.equal(sender.arcCast,null,'side target cannot start a chain');
selected.body.pos=[0,1400,100];cast();assert.equal(sender.arcCast,null,'rear target cannot start a chain');
selected.body.pos=[0,1400,-430];cast();assert.equal(sender.arcCast,null,'out of range');
selected.body.pos=[0,1400,-150];cast();
assert.equal(party.snapshot(selected,0).self.arcThreat,sender.id);assert.equal(selected.hp,100);
selected.body.pos=[150,1400,-20];party.tick(Flight.tick);
assert.equal(party.snapshot(selected,0).self.arcThreat,null);assert.equal(selected.hp,100);
assert(sender.arcAt>party.time,'breaking the chain spends the cooldown');
party.time=sender.arcAt+.01;
selected.body.pos=[0,1400,-135];cast();
assert(sender.arcCast);party.input(sender,command('echo',{target:selected.id}));
party.tick(Flight.tick);assert.equal(sender.arcCast,null,'switching weapons breaks the chain');
party.time=sender.arcAt+.01;
for(const [i,[x,z]] of [[0,0],[0,-180],[54,-225],[58,-172]].entries())pilots[i].body=Flight.create('ember',[x,1400,z],0);
cast();party.input(sender,command('arc',{fire:false,target:selected.id}));
for(let i=0;i<100;i++)party.tick(Flight.tick);
assert.equal(selected.hp,100,'telegraph precedes damage');
for(let i=0;i<12;i++)party.tick(Flight.tick);
assert.deepEqual(pilots.map(p=>p.hp),[100,86,94,100]);
assert.deepEqual(party.events.filter(e=>e.loss).map(e=>[e.kind,e.weapon,e.loss]),[['arc','arc',14],['arcHop','arc',6]]);
party.input(sender,command('echo',{fire:true}));party.tick(Flight.tick);
assert(sender.echo && sender.echoAt>party.time+4);
const siteOfEcho=sender.echo.pos.slice();
party.input(sender,command('echo',{fire:false}));
for(let i=0;i<122;i++){
  selected.body.pos=siteOfEcho.map((n,k)=>n+(k===0?100:0));
  near.body.pos=siteOfEcho.map((n,k)=>n+(k===0?240:0));
  party.tick(Flight.tick);
}
assert.equal(selected.hp,58);assert.equal(near.hp,94);assert.equal(sender.hp,100);
assert.equal(party.events.filter(e=>e.kind==='chime').length,1);
const pose=require('./peer-pose.js'),fields=require('./airfields.js');
for(const p of [sender,selected]){
  const plain=JSON.parse(JSON.stringify(party.snapshot(p,0).self));
  const wire=JSON.parse(JSON.stringify(party.snapshot(p,0,0,[],true).self));
  assert.deepEqual(pose.unpackSelf(wire,fields.freshCondition),plain);
}
async function network(){
  const server=createServer();
  await new Promise(ok=>server.listen(0,'127.0.0.1',ok));
  const base='http://127.0.0.1:'+server.address().port;
  async function post(path,data,token){
    const res=await fetch(base+'/'+path,{method:'POST',headers:{'content-type':'application/json',...(token?{authorization:'Bearer '+token}:{})},body:JSON.stringify(data)});
    return {status:res.status,...await res.json()};
  }
  try{
    const join=(room,mode)=>post('join',{room,mode,type:'kite'});
    const p=await join('DUEL','pvp');
    assert.equal((await post('join',{room:'DUEL',mode:'pvp',type:'kite',protocol:16})).reason,'version');
    assert.equal((await post('join',{room:'DUEL',mode:'pvp',type:'j16',kit:15})).status,400);
    const custom=await post('join',{room:'CUSTOM',mode:'pve',type:'j16',kit:65,protocol:17});
    const load=await post('sync',command('ribbon',{controls:{pitch:.35,roll:-.2,yaw:0,throttle:.1,keyboard:true}}),custom.token);
    assert.equal(load.self.kit,65);assert.equal(load.self.weapon,'ribbon');assert.equal(load.self.refit,0);
    assert.equal((await post('sync',command('gun',{controls:{pitch:1.1,roll:0,yaw:0,throttle:0}}),custom.token)).status,400);
    assert.equal((await post('sync',command('gun',{kit:15}),p.token)).status,400);
    const valid=await post('sync',command('laser',{kit:5}),p.token);
    assert.equal(valid.self.kit,5);assert.equal(valid.self.refit,0);
    const [a,b]=await Promise.all([join('CLUB','tour'),join('CLUB','tour')]);
    const pos=Lake.sites[3].pos,quat=[0,0,0,1];
    let result;
    for(let i=0;i<12;i++){
      result=await Promise.all([a,b].map(ticket=>post('sync',{pos,quat},ticket.token)));
      if(i<11)await new Promise(ok=>setTimeout(ok,510));
    }
    assert.equal(result[1].harbor.count,2);assert.equal(result[1].harbor.rallies,1);
    const away=await post('sync',{pos:[0,900,0],quat},a.token);
    assert.equal(away.harbor.seconds,0);assert.equal(away.harbor.count,1);
    const isolated=await join('OTHER','tour');const solo=await post('sync',{pos,quat},isolated.token);
    assert.equal(solo.harbor.rallies,0);assert.equal(solo.harbor.count,1);
  }finally{await new Promise(ok=>server.close(ok));}
}
network().then(()=>console.log('PASS landmarks, bridge passage, collision, objective rotation, contested scoring, timed group rally, weapon budget and live refitting')).catch(e=>{console.error(e);process.exitCode=1;});
