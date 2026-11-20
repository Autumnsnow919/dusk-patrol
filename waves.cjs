const Flight = require('./flight.js');

// These pilots fly a circuit over the lake. Only their arcade abilities select
// a player. Navigation uses the same flight step as a human-controlled plane.
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
      drone.body = Flight.create(drone.type, [900 + drone.radius * Math.sin(angle),
        drone.cruiseHeight, 1500 - drone.radius * Math.cos(angle)], angle + Math.PI / 2);
      drone.weapon = i % 2 ? 'echo' : 'glyph';
      drone.controls = {pitch:0, roll:0, yaw:0, throttle:0};
      this.drones.push(drone);
    }
  }

  update(arena) {
    if (arena.time < this.nextDecision) return;
    this.nextDecision = arena.time + .125;
    if (this.nextWave !== null) {
      if (arena.time < this.nextWave) return;
      for (const drone of this.drones) arena.remove(drone.id);
      this.drones.length = 0;
      this.start(arena);
    }
    let alive = 0;
    for (const drone of this.drones) {
      if (!drone.hp) continue;
      alive++;
      const {body, controls} = drone, [x, y, z] = body.pos;
      const angle = Math.atan2(x - 900, 1500 - z) + .65;
      const dx = 900 + drone.radius * Math.sin(angle) - x;
      const dz = 1500 - drone.radius * Math.cos(angle) - z;
      const {f, r, u} = body.basis;
      const turn = Math.atan2(dx*r[0] + dz*r[2], dx*f[0] + dz*f[2]);
      const bank = Math.atan2(-r[1], u[1]);
      controls.roll = clamp(1.6 * (clamp(turn * 1.6, .95) - bank) + .35 * body.rates[2], 1);
      controls.pitch = clamp((drone.cruiseHeight-y)*.009 - body.vel[1]*.095 - f[1]*.7
        + .18 * Math.abs(bank) - .25 * body.rates[0], .85);
      controls.yaw = clamp(turn * .55, .7);
      controls.throttle = clamp((Flight.fleet[drone.type].cruise - Math.hypot(...body.vel))*.08, .6);
      drone.lastInput = arena.time;
      let near = null, best = Infinity;
      for (const human of arena.players.values()) {
        if (human.bot || !human.hp || human.shield > arena.time) continue;
        const p = human.body.pos, d = (x-p[0])**2 + (y-p[1])**2 + (z-p[2])**2;
        if (d < best) { near = human; best = d; }
      }
      drone.target = near?.id;
      drone.fire = best <= (drone.weapon === 'echo' ? 300 : 700)**2;
    }
    if (!alive) this.nextWave = arena.time + (this.wave === 3 ? 15 : 5);
  }

  snapshot(time) {
    return {wave:this.wave, remaining:this.drones.filter(d => d.hp > 0).length,
      total:this.drones.length, countdown:this.nextWave === null ? 0 : Math.max(0, Math.ceil(this.nextWave-time))};
  }
}
module.exports = PatrolWaves;
