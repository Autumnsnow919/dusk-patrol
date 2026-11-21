const Flight = require('./flight.js');
const Lake = require('./lake.js');
const Outfit = require('./outfit.js');
const Sight = require('./sight.js');
const {randomInt} = require('node:crypto');

const rosters=[[['tern'],['gull']],[['swift'],['wisp','m2000'],['petrel','f5']],
  [['opal','f15'],['j10'],['ibis'],['j16']]];
const carriesMissile=mask=>Object.keys(Sight.profiles).some(id=>Outfit.has(mask,id));
const names = ['青羽', '浮灯', '雨燕', '云雀'];
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
const flatDistance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);
// Every combination of at least two items that fits the same hangar budget.
const kits=[];
for(let mask=1;mask<2**Outfit.items.length;mask++){
  if(Outfit.valid(mask) && (mask&(mask-1)))kits.push(mask);
}

// A pass ends at a fixed point in the game world; moving the target cannot
// drag this point along and keep two avatars flying into each other.
function setGate(drone,time,route,dx,dz,length,seconds){
  const {pos,basis}=drone.body;
  if(Math.hypot(dx,dz)<.01){dx=basis.f[0];dz=basis.f[2];}
  const scale=length/(Math.hypot(dx,dz)||1);
  drone.gate={x:pos[0]+dx*scale,z:pos[2]+dz*scale,until:time+seconds,route};
}

function assignPartner(drone,humans,assignments){
  if(assignments.has(drone.partner))assignments.set(drone.partner,assignments.get(drone.partner)-1);
  let partner=null,best=Infinity;
  for(const human of humans){
    const cost=assignments.get(human.id)*2400+flatDistance(drone.body.pos,human.body.pos)-(human.id===drone.partner?650:0);
    if(cost<best){partner=human;best=cost;}
  }
  const id=partner?.id??null,life=partner?.life??0;
  if((drone.partner!==id || drone.partnerLife!==life) && drone.gate?.route!=='entry')drone.gate=null;
  drone.partner=id;drone.partnerLife=life;
  if(partner)assignments.set(id,assignments.get(id)+1);
  return partner;
}

function chooseAction(arena,drone,opponent,effects){
  const now=arena.time,body=drone.body;
  const input={controls:drone.controls,target:opponent?.id,weapon:drone.weapon,fire:false};
  const hurt=drone.hp<drone.lastHealth;
  drone.lastHealth=drone.hp;
  if(hurt && Outfit.has(drone.kit,'prism') && drone.prismAt<=now && drone.prismDue===null)drone.prismDue=now+.7;
  const incoming=drone.flareCells>0 && arena.shots.some(s=>s.to===drone.id && s.life===drone.life && !s.diverted);
  if(!incoming)drone.alertAt=null;
  else if(drone.alertAt===null)drone.alertAt=now+(drone.fire?1.2:.65)+.12*drone.lane;
  input.dodge=incoming && now>=drone.alertAt && drone.shield<=now;
  if(drone.shield>now || drone.refitAt>now)return input;
  if(drone.arcCast){input.weapon='arc';input.target=drone.arcCast.id;return input;}
  if(drone.prismDue!==null && drone.prismDue<=now){
    drone.prismDue=null;
    input.weapon='prism';input.fire=true;return input;
  }
  if(!opponent || drone.route==='recover' || drone.route==='escape' || now<drone.nextAction)return input;
  const point=opponent.body.pos;
  const distance=Math.hypot(point[0]-body.pos[0],point[1]-body.pos[1],point[2]-body.pos[2]);
  // A live mark belongs to a specific avatar life. Finish that input before
  // cycling through secondary items. The room still validates each launch.
  const active=Sight.profiles[drone.weapon];
  if(active && drone[drone.weapon+'At']<=now){
    const focus=drone.marks.has(opponent.id)?opponent:arena.players.get(drone.focus);
    const mark=focus && drone.marks.get(focus.id);
    if(mark && arena.opponents(drone,focus) && focus.hp && focus.shield<=now && mark.life===focus.life &&
       Sight.inRing(body,focus.body.pos,active.ring,active.reach,active.inner)){
      input.target=focus.id;input.fireLife=focus.life;input.fire=mark.time>=active.fill;
      return input;
    }
  }
  for(let i=0;i<drone.pack.length;i++){
    const index=(drone.slotCursor+i)%drone.pack.length,id=drone.pack[index];
    if(id==='prism')continue;
    if(id==='gun'){
      if(drone.hot || (now>=drone.burstEnd && now<drone.gunRest) || !Sight.inRing(body,point,.13,effects.gun.range))continue;
      if(now>=drone.burstEnd){
        drone.burstEnd=now+.45;drone.gunRest=drone.burstEnd+.33;
      }
    }else{
      if(drone[id+'At']>now)continue;
      const reticle=Sight.reticle(id);
      const ready=reticle?Sight.inRing(body,point,reticle.ring,reticle.reach,reticle.inner):distance<=effects[id].range;
      if(!ready)continue;
    }
    input.weapon=id;
    const lock=Sight.profiles[id];
    const mark=drone.marks.get(opponent.id);
    input.fire=!lock || (drone.weapon===id && mark?.life===opponent.life && mark.time>=lock.fill);
    input.fireLife=opponent.life;
    // Stay on a charging item or a short burst. Cycle after an instant effect.
    drone.slotCursor=(lock || id==='laser' || id==='gun')?index:(index+1)%drone.pack.length;
    if(input.fire && id!=='laser' && id!=='gun')drone.nextAction=now+.4;
    return input;
  }
  return input;
}

class PatrolWaves {
  constructor(effects,groundAt,drawIndex=randomInt) {
    this.effects=effects;this.groundAt=groundAt;
    this.drawIndex=drawIndex;
    this.wave = 0;
    this.drones = [];
    this.nextWave = 0;
    this.nextDecision = 0;
    this.serial = 0;
  }

  start(arena) {
    this.wave = this.wave % 3 + 1;
    this.nextWave = null;
    const remaining=kits.slice();
    for (let i = 0; i <= this.wave; i++) {
      const angle = i * 2 * Math.PI / (this.wave + 1);
      // One seat enters through the marked lane with a randomly drawn missile kit.
      // The other seats still draw from the entire legal outfit pool.
      const entry=i===this.wave,pool=entry?remaining.filter(carriesMissile):remaining;
      const kit=pool[this.drawIndex(pool.length)];
      remaining.splice(remaining.indexOf(kit),1);
      const variants=rosters[this.wave-1][i];
      const type=variants.length===1?variants[0]:variants[this.drawIndex(variants.length)];
      const drone=arena.add('ai-'+ ++this.serial,type,'AI · '+names[i],8+i,kit);
      drone.cruiseHeight = 1020 + 45 * i;
      drone.radius = 580 + i * 100;
      drone.center=[900,1500];drone.lane=i;
      drone.route='patrol';drone.partner=null;drone.gate=null;drone.partnerLife=0;
      drone.pack=Outfit.items.filter(item=>Outfit.has(kit,item.id)).map(item=>item.id);
      drone.slotCursor=this.drawIndex(drone.pack.length);
      drone.lastHealth=100;drone.prismDue=null;drone.alertAt=null;drone.burstEnd=0;drone.gunRest=0;drone.nextAction=0;
      const atField=entry && [...arena.players.values()].some(p=>!p.bot && flatDistance(p.body.pos,[900,1050,560])<1500);
      if(atField){
        drone.body=Flight.create(type,[930,1050,-570],Math.PI);
        setGate(drone,arena.time,'entry',0,1,1800,5);
      }else{
        drone.body=Flight.create(type,[900+drone.radius*Math.sin(angle),drone.cruiseHeight,1500-drone.radius*Math.cos(angle)],
          angle+(i%2?-1:1)*Math.PI/2);
      }
      if(entry)drone.slotCursor=drone.pack.findIndex(id=>Sight.profiles[id]);
      drone.weapon=drone.pack[drone.slotCursor];
      drone.controls = {pitch:0, roll:0, yaw:0, throttle:0};
      this.drones.push(drone);
    }
  }

  update(arena) {
    if (arena.time < this.nextDecision) return;
    const interval=.125;
    this.nextDecision = arena.time + interval;
    if (this.nextWave !== null) {
      if (arena.time < this.nextWave) return;
      for (const drone of this.drones) arena.remove(drone.id);
      this.drones.length = 0;
      this.start(arena);
    }
    const humans=[...arena.players.values()].filter(p=>!p.bot && p.hp && p.shield<=arena.time);
    // The purple circles are public telegraphs, including after their owner is down.
    const circles=[];
    for(const pilot of arena.players.values()){
      if(pilot.bot)continue;
      if(pilot.echo && pilot.echo.until>arena.time)circles.push({pos:pilot.echo.pos,radius:this.effects.echo.range});
      if(pilot.glyph && pilot.glyph.until>arena.time)circles.push({pos:pilot.glyph.pos,radius:this.effects.glyph.radius,id:pilot.glyph.id,life:pilot.glyph.life});
    }
    const assignments=new Map(humans.map(h=>[h.id,0]));
    for(const d of this.drones)if(d.hp&&assignments.has(d.partner))assignments.set(d.partner,assignments.get(d.partner)+1);
    let alive = 0;
    for (const drone of this.drones) {
      if (!drone.hp) continue;
      alive++;
      const {body, controls} = drone, [x, y, z] = body.pos;
      const partner=assignPartner(drone,humans,assignments);
      const goal=partner?.body.pos;
      const offsetX=(goal?.[0]??900)-900,offsetZ=(goal?.[2]??1500)-1500;
      const reach=Math.min(1,(Lake.arenaRadius-1400)/Math.max(1,Math.hypot(offsetX,offsetZ)));
      const chaseX=900+offsetX*reach-drone.center[0],chaseZ=1500+offsetZ*reach-drone.center[1];
      const distance=goal?flatDistance(body.pos,goal):0;
      const regroup=goal && distance>(drone.route==='regroup'?1050:1800);
      const step=regroup?1:Math.min(1,(100+16*this.wave)*interval/Math.max(1,Math.hypot(chaseX,chaseZ)));
      drone.center[0]+=chaseX*step;drone.center[1]+=chaseZ*step;
      const shortLane=drone.lane%2;
      let altitude=goal?Math.max(220,Math.min(6500,goal[1])):drone.cruiseHeight;
      let dx,dz;
      const {f,r,u}=body.basis;
      let route='patrol';
      if(drone.gate && ((drone.gate.route==='entry' && goal && distance>3000) || arena.time>=drone.gate.until || Math.hypot(drone.gate.x-x,drone.gate.z-z)<50))drone.gate=null;
      const ring=circles.find(c=>(!c.id || (c.id===drone.id && c.life===drone.life)) &&
        Math.hypot(x-c.pos[0],y-c.pos[1],z-c.pos[2])<c.radius+35);
      if(ring && drone.gate?.route!=='escape')setGate(drone,arena.time,'escape',x-ring.pos[0],z-ring.pos[2],360,2.6);
      if(goal){
        route=regroup?'regroup':'approach';
        dx=(regroup?drone.center[0]:goal[0])-x;
        dz=(regroup?drone.center[1]:goal[2])-z;
        if(regroup)altitude+=shortLane?80:35;
        const gap=Math.hypot(distance,y-goal[1]);
        if(!drone.gate && drone.pack.every(id=>id==='prism'||Sight.profiles[id]?.inner>gap)){
          setGate(drone,arena.time,'space',x-goal[0],z-goal[2],900,9);
        }else if(!drone.gate && distance<135 && Math.abs(y-goal[1])<170){
          const side=shortLane?-1:1;
          setGate(drone,arena.time,'pass',f[0]+side*.45*r[0],f[2]+side*.45*r[2],470,3.4);
        }
      }else{
        const angle=Math.atan2(x-drone.center[0],drone.center[1]-z)+(shortLane?-.75:.65);
        dx=drone.center[0]+drone.radius*Math.sin(angle)-x;
        dz=drone.center[1]-drone.radius*Math.cos(angle)-z;
      }
      if(drone.gate){
        route=drone.gate.route;dx=drone.gate.x-x;dz=drone.gate.z-z;
        altitude=route==='entry'?1050:Math.max(y,altitude)+(shortLane?16:32);
      }
      for(const mate of this.drones){
        if(mate===drone||!mate.hp||Math.abs(y-mate.body.pos[1])>110)continue;
        const sx=x-mate.body.pos[0],sz=z-mate.body.pos[2],gap=Math.hypot(sx,sz);
        if(gap>=210)continue;
        const space=(210-gap)*3;
        dx+=space*(gap>1?sx/gap:drone.lane<mate.lane?-1:1);
        dz+=space*(gap>1?sz/gap:0);
      }
      const gx=x+dx-900,gz=z+dz-1500,limit=Lake.arenaRadius-650;
      if(gx*gx+gz*gz>limit*limit){
        const scale=limit/Math.hypot(gx,gz);
        dx=900+gx*scale-x;dz=1500+gz*scale-z;
      }
      const floor=y<700?Math.max(0,this.groundAt(x,z),this.groundAt(x+body.vel[0]*1.5,z+body.vel[2]*1.5)):0;
      const clearance=y-floor+Math.min(0,body.vel[1])*1.5;
      const recover=clearance<(drone.route==='recover'?190:110);
      drone.route=recover?'recover':route;
      const turn = Math.atan2(dx*r[0] + dz*r[2], dx*f[0] + dz*f[2]);
      const bank = Math.atan2(-r[1], u[1]);
      controls.roll = clamp(1.6 * ((recover?0:clamp(turn * 1.6, .95)) - bank) + .35 * body.rates[2], 1);
      controls.pitch = clamp((Math.max(altitude,floor+180)-y)*.009 - body.vel[1]*.095 - f[1]*.7
        + .18 * Math.abs(bank) - .25 * body.rates[0], .85);
      controls.yaw = clamp(turn * .55, .7);
      // Ease back towards cruising speed near the player. A single distance
      // threshold left equally fast avatars separated forever after a pass.
      let catchUp=0;
      if(regroup)catchUp=.55;
      else if(route==='approach')catchUp=Math.min(.55,Math.max(0,(distance-300)/1500));
      const cruise=Flight.fleet[drone.type].cruise*(1+catchUp);
      controls.throttle = clamp((cruise-Math.hypot(...body.vel))*.08,.8);
      arena.input(drone,chooseAction(arena,drone,partner,this.effects));
    }
    if (!alive) this.nextWave = arena.time + (this.wave === 3 ? 15 : 5);
  }

  snapshot(time,target) {
    return {wave:this.wave, remaining:this.drones.filter(d => d.hp > 0).length,
      contact:target?.bot&&target.hp?{id:target.id,kit:target.kit,weapon:target.weapon,route:target.route}:undefined,
      total:this.drones.length, countdown:this.nextWave === null ? 0 : Math.max(0, Math.ceil(this.nextWave-time))};
  }
}
module.exports = PatrolWaves;
