const Flight = require('./flight.js');
const Lake = require('./lake.js');
const Outfit = require('./outfit.js');

const rosters=[['tern','gull'],['swift','wisp','petrel'],['opal','j10','ibis','j16']];
const names = ['青羽', '浮灯', '雨燕', '云雀'];
const packs=[['glyph','prism'],['echo','pulse'],['arc','prism'],['pulse','glyph'],['arc','echo'],['echo','prism']];
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));
const flatDistance=(a,b)=>Math.hypot(a[0]-b[0],a[2]-b[2]);

class PatrolWaves {
  constructor(effects,groundAt) {
    this.effects=effects;this.groundAt=groundAt;
    this.wave = 0;
    this.drones = [];
    this.nextWave = 0;
    this.nextDecision = 0;
    this.serial = 0;
    this.round = 0;
  }

  start(arena) {
    this.wave = this.wave % 3 + 1;
    this.nextWave = null;
    for (let i = 0; i <= this.wave; i++) {
      const angle = i * 2 * Math.PI / (this.wave + 1);
      const pack=packs[(this.round*2+Math.floor(this.round/3)+i)%packs.length],type=rosters[this.wave-1][i];
      const drone = arena.add('ai-' + ++this.serial,type,'AI · '+names[i],8+i,Outfit.maskOf(...pack));
      drone.cruiseHeight = 1020 + 45 * i;
      drone.radius = 580 + i * 100;
      drone.center=[900,1500];drone.lane=i;
      drone.route='patrol';drone.partner=null;drone.nextAction=arena.time;drone.pack=pack;
      drone.lastHealth=100;drone.prismDue=null;
      drone.body = Flight.create(drone.type, [900 + drone.radius * Math.sin(angle),
        drone.cruiseHeight, 1500 - drone.radius * Math.cos(angle)], angle + (i%2?-1:1)*Math.PI/2);
      drone.weapon=pack[0];
      drone.controls = {pitch:0, roll:0, yaw:0, throttle:0};
      this.drones.push(drone);
    }
    this.round++;
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
    const assignments=new Map(humans.map(h=>[h.id,0]));
    for(const d of this.drones)if(d.hp&&assignments.has(d.partner))assignments.set(d.partner,assignments.get(d.partner)+1);
    let alive = 0;
    for (const drone of this.drones) {
      if (!drone.hp) continue;
      alive++;
      const {body, controls} = drone, [x, y, z] = body.pos;
      let partner=humans.find(h=>h.id===drone.partner);
      if(partner)assignments.set(partner.id,assignments.get(partner.id)-1);
      let score=Infinity;
      for(const human of humans){
        const cost=assignments.get(human.id)*2400+flatDistance(body.pos,human.body.pos)-(human.id===drone.partner?650:0);
        if(cost<score){partner=human;score=cost;}
      }
      drone.partner=partner?.id??null;
      if(partner)assignments.set(partner.id,assignments.get(partner.id)+1);
      const goal=partner?.body.pos;
      const offsetX=(goal?.[0]??900)-900,offsetZ=(goal?.[2]??1500)-1500;
      const reach=Math.min(1,(Lake.arenaRadius-1400)/Math.max(1,Math.hypot(offsetX,offsetZ)));
      const chaseX=900+offsetX*reach-drone.center[0],chaseZ=1500+offsetZ*reach-drone.center[1];
      const distance=goal?flatDistance(body.pos,goal):0;
      const regroup=goal && distance>(drone.route==='regroup'?1050:1800);
      const step=regroup?1:Math.min(1,(100+16*this.wave)*interval/Math.max(1,Math.hypot(chaseX,chaseZ)));
      drone.center[0]+=chaseX*step;drone.center[1]+=chaseZ*step;
      const shortLane=drone.lane%2,altitude=goal?Math.max(650,Math.min(6500,goal[1]+(shortLane?85:-40))):drone.cruiseHeight;
      const radius=goal?drone.radius*(shortLane?.60:.82):drone.radius;
      const angle = Math.atan2(x-drone.center[0],drone.center[1]-z) + (shortLane?-.75:.65);
      let dx=drone.center[0]+radius*Math.sin(angle)-x;
      let dz=drone.center[1]-radius*Math.cos(angle)-z;
      for(const mate of this.drones){
        if(mate===drone||!mate.hp||Math.abs(y-mate.body.pos[1])>110)continue;
        const sx=x-mate.body.pos[0],sz=z-mate.body.pos[2],gap=Math.hypot(sx,sz);
        if(gap>=210)continue;
        const space=(210-gap)*3;
        dx+=space*(gap>1?sx/gap:drone.lane<mate.lane?-1:1);
        dz+=space*(gap>1?sz/gap:0);
      }
      const {f, r, u} = body.basis;
      const floor=y<700?Math.max(0,this.groundAt(x,z),this.groundAt(x+body.vel[0]*1.5,z+body.vel[2]*1.5)):0;
      const clearance=y-floor+Math.min(0,body.vel[1])*1.5;
      const recover=clearance<(drone.route==='recover'?190:110);
      drone.route=recover?'recover':regroup?'regroup':goal?'follow':'patrol';
      const turn = Math.atan2(dx*r[0] + dz*r[2], dx*f[0] + dz*f[2]);
      const bank = Math.atan2(-r[1], u[1]);
      controls.roll = clamp(1.6 * ((recover?0:clamp(turn * 1.6, .95)) - bank) + .35 * body.rates[2], 1);
      controls.pitch = clamp((Math.max(altitude,floor+180)-y)*.009 - body.vel[1]*.095 - f[1]*.7
        + .18 * Math.abs(bank) - .25 * body.rates[0], .85);
      controls.yaw = clamp(turn * .55, .7);
      const cruise=Flight.fleet[drone.type].cruise*(regroup?1.55:1);
      controls.throttle = clamp((cruise-Math.hypot(...body.vel))*.08,.8);
      drone.lastInput = arena.time;
      let near = null, best = Infinity;
      for (const human of humans) {
        const p = human.body.pos, d = (x-p[0])**2 + (y-p[1])**2 + (z-p[2])**2;
        if (d < best) { near = human; best = d; }
      }
      drone.target = near?.id;
      if(drone.pack.includes('prism') && drone.hp<drone.lastHealth && drone.prismAt<=arena.time && drone.prismDue===null)
        drone.prismDue=arena.time+.7;
      drone.lastHealth=drone.hp;
      drone.fire=false;
      if(drone.shield>arena.time || recover)continue;
      if(drone.prismDue!==null && arena.time>=drone.prismDue){
        drone.weapon='prism';drone.fire=true;drone.prismDue=null;
      }else if(arena.time>=drone.nextAction){
        const available=drone.pack.find(id=>id!=='prism' && drone[id+'At']<=arena.time && best<=this.effects[id].range**2);
        if(available){drone.weapon=available;drone.fire=true;drone.nextAction=arena.time+.55+.09*drone.lane;}
      }
    }
    if (!alive) this.nextWave = arena.time + (this.wave === 3 ? 15 : 5);
  }

  snapshot(time) {
    return {wave:this.wave, remaining:this.drones.filter(d => d.hp > 0).length,
      total:this.drones.length, countdown:this.nextWave === null ? 0 : Math.max(0, Math.ceil(this.nextWave-time))};
  }
}
module.exports = PatrolWaves;
