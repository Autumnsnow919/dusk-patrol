// Run against the current release, or pass an extracted game directory for comparison.
const path = require('node:path');
const fs = require('node:fs');
const directory = process.argv[2] ? path.resolve(process.argv[2]) : __dirname;
const {Arena} = require(path.join(directory, 'arena.cjs'));
const Flight = require(path.join(directory, 'flight.js'));
const compact = fs.existsSync(path.join(directory, 'peer-pose.js'));
const selfRows=compact && typeof require(path.join(directory,"peer-pose.js")).packSelf==="function";
const bytes = value => Buffer.byteLength(JSON.stringify(value));
const controls = {pitch:0, yaw:0, roll:0, throttle:0, vector:false, gear:false, brake:false, trim:0};

function sample(count, fire, altitude) {
  const arena = new Arena(0);
  const pilots = Array.from({length:count}, (_, i) => {
    const p = arena.add('ABCDEF0'+i, 'tern', '湖区飞行员'+i);
    p.body = Flight.create('tern', [160*i, altitude, 1800], 0);
    p.shield = 0;
    return {p, seen:0, known:[]};
  });
  const intervals = [];
  let traffic = 0, syncs = 0, peak = 0;
  for (let frame=0; frame<240; frame++) {
    if (frame%8===0) {
      for (const client of pilots) {
        const {p} = client;
        const command = {controls, weapon:'gun', target:null, fire, tap:false, dodge:false, after:0, seenTracer:client.seen};
        if (compact) command.known = client.known;
        if(selfRows)command.compactSelf=true;
        arena.input(p, command);
        const reply = arena.snapshot(p, 0, client.seen, command.known, selfRows);
        client.seen = reply.tracerSeq;
        if (compact) client.known = reply.peers.map(row => row[0]);
        traffic += bytes(command) + bytes(reply);
        syncs++;
      }
    }
    const start = performance.now();
    arena.tick(Flight.tick);
    intervals.push(performance.now()-start);
    peak = Math.max(peak, arena.tracers.length);
  }
  intervals.sort((a,b)=>a-b);
  return {pilots:count, fire, altitude, peakTracers:peak, rounds:arena.tracerId,
    tickP95ms:+intervals[Math.floor(intervals.length*.95)].toFixed(3),
    bytesPerSync:+(traffic/syncs).toFixed(1)};
}

console.table([sample(1,false,1300), sample(8,false,1300), sample(8,true,1300), sample(8,true,210)]);
