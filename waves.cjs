const Flight = require('./flight.js');
const Lake = require('./lake.js');
const Outfit = require('./outfit.js');

// Each NPC has a moving circuit and takes a turn following a player.
const types = ['tern', 'gull', 'swift', 'heron'];
const names = ['青羽', '浮灯', '雨燕', '云雀'];
const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

class PatrolWaves {
  constructor() {
    this.wave = 0;
    this.drones = [];
    this.nextWave = 0;
    this.nextDecision = 0;
    this.serial = 0;
  }

  start(arena) {
    this.wave = this.wave % 3 + 1;
    this.nextWave = null;
    for (let i = 0; i <= this.wave; i++) {
      const angle = i * 2 * Math.PI / (this.wave + 1);
      const drone = arena.add('ai-' + ++this.serial, types[i], 'AI · ' + names[i], 8 + i);
      drone.cruiseHeight = 1020 + 45 * i;
      drone.radius = 580 + i * 100;
      drone.center=[900,1500];drone.lane=i;
      drone.lastHealth=100;drone.prismDue=null;
      drone.body = Flight.create(drone.type, [900 + drone.radius * Math.sin(angle),
        drone.cruiseHeight, 1500 - drone.radius * Math.cos(angle)], angle + (i%2?-1:1)*Math.PI/2);
      drone.trick=i%2?'echo':'glyph';
      drone.kit=Outfit.maskOf(drone.trick,'prism');
      drone.weapon=drone.trick;
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
    let alive = 0;
    for (const drone of this.drones) {
      if (!drone.hp) continue;
      alive++;
      const {body, controls} = drone, [x, y, z] = body.pos;
      const partner=humans.length?humans[(drone.lane+Math.floor(arena.time/16))%humans.length]:null;
      const goal=partner?.body.pos;
      const offsetX=(goal?.[0]??900)-900,offsetZ=(goal?.[2]??1500)-1500;
      const reach=Math.min(1,(Lake.arenaRadius-1400)/Math.max(1,Math.hypot(offsetX,offsetZ)));
      const chaseX=900+offsetX*reach-drone.center[0],chaseZ=1500+offsetZ*reach-drone.center[1];
      const step=Math.min(1,(100+16*this.wave)*interval/Math.max(1,Math.hypot(chaseX,chaseZ)));
      drone.center[0]+=chaseX*step;drone.center[1]+=chaseZ*step;
      const shortLane=drone.lane%2,altitude=goal?Math.max(650,Math.min(6500,goal[1]+(shortLane?85:-40))):drone.cruiseHeight;
      const radius=goal?drone.radius*(shortLane?.60:.82):drone.radius;
      const angle = Math.atan2(x-drone.center[0],drone.center[1]-z) + (shortLane?-.75:.65);
      const dx = drone.center[0] + radius * Math.sin(angle) - x;
      const dz = drone.center[1] - radius * Math.cos(angle) - z;
      const {f, r, u} = body.basis;
      const turn = Math.atan2(dx*r[0] + dz*r[2], dx*f[0] + dz*f[2]);
      const bank = Math.atan2(-r[1], u[1]);
      controls.roll = clamp(1.6 * (clamp(turn * 1.6, .95) - bank) + .35 * body.rates[2], 1);
      controls.pitch = clamp((altitude-y)*.009 - body.vel[1]*.095 - f[1]*.7
        + .18 * Math.abs(bank) - .25 * body.rates[0], .85);
      controls.yaw = clamp(turn * .55, .7);
      controls.throttle = clamp((Flight.fleet[drone.type].cruise - Math.hypot(...body.vel))*.08, .6);
      drone.lastInput = arena.time;
      let near = null, best = Infinity;
      for (const human of humans) {
        const p = human.body.pos, d = (x-p[0])**2 + (y-p[1])**2 + (z-p[2])**2;
        if (d < best) { near = human; best = d; }
      }
      drone.target = near?.id;
      if(drone.hp<drone.lastHealth && drone.prismAt<=arena.time && drone.prismDue===null)
        drone.prismDue=arena.time+.7;
      drone.lastHealth=drone.hp;
      if(drone.prismDue!==null && arena.time>=drone.prismDue){
        drone.weapon='prism';drone.fire=true;drone.prismDue=null;
      }else{
        drone.weapon=drone.trick;
        drone.fire=best<=(drone.trick==='echo'?300:700)**2;
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
