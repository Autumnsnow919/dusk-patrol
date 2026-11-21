const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { randomUUID } = require('node:crypto');
const { fleet } = require('./flight.js');
const Fields=require('./airfields.js');
const Lake=require('./lake.js');
const Outfit=require('./outfit.js');
const PeerPose=require('./peer-pose.js');
const { Arena,spawnHeading } = require('./arena.cjs');

function createServer() {
  require('./contacts.cjs').prepare('scenery');
  const sessions = new Map();
  const rooms = new Map();
  const files = new Set(['index.html', 'airfields.js','airframes.js','flight.js','cockpit.js','pilot-stick.js', 'room.js', 'hangar.css','scope.js','lake.js','outfit.js','terrain.js','chart.js','sight.js','land-surface.js','world-cache.js','peer-pose.js','sound.js','boom-sample.js','PixelifySans.ttf','IBMPlexMono.ttf']);
  const expiry = 12000;
  let nextPrune=0;
  const remove=(token,pilot)=>{
    sessions.delete(token); pilot.group.members.delete(pilot); pilot.group.arena?.remove(pilot.id);
    if(!pilot.group.members.size) rooms.delete(pilot.room);
  };
  const prune = () => {
    const now=Date.now(); if(now<nextPrune) return; nextPrune=now+500;
    for (const [token, pilot] of sessions) if (now-pilot.seen>expiry) remove(token,pilot);
  };
  const server = http.createServer(async (req, res) => {
    const reply = (code, value) => {
      res.writeHead(code, { 'Content-Type':'application/json', 'Cache-Control':'no-store' });
      res.end(JSON.stringify(value));
    };
    try {
      const pathname = new URL(req.url,'http://localhost').pathname;
      if (req.method === 'GET') {
        const name = pathname === '/' ? 'index.html' : pathname.slice(1);
        if (!files.has(name)) return reply(404, {});
        const bytes = await fs.promises.readFile(path.join(__dirname,name));
        res.writeHead(200, { 'Content-Type':({'html':'text/html','js':'text/javascript','css':'text/css','ttf':'font/ttf'})[name.split('.').pop()] + '; charset=utf-8', 'Cache-Control':'no-cache' });
        return res.end(bytes);
      }
      if (req.method !== 'POST' || !['/join','/sync','/leave'].includes(pathname)) return reply(404,{});
      if (req.headers.origin && new URL(req.headers.origin).host !== req.headers.host) return reply(403,{});
      if (req.headers['content-type'] !== 'application/json') return reply(415,{});
      let raw = '';
      for await (const chunk of req) { raw += chunk; if (raw.length>2048) return reply(413,{}); }
      const data = JSON.parse(raw);
      if (!data || typeof data!=='object') return reply(400,{});
      prune();
      if (pathname === '/join') {
        if(data.protocol!==undefined && data.protocol!==PeerPose.protocol)return reply(409,{reason:'version'});
        if(data.kit!==undefined && !Outfit.valid(data.kit))return reply(400,{reason:'kit'});
        const mode=data.mode??'tour';
        let room=data.room;
        if((mode==='pvp'||mode==='pve') && room===''){
          do {room=randomUUID().slice(0,6).toUpperCase();} while(rooms.has(room));
        }
        if (typeof room!=='string' || !/^[A-Z0-9-]{1,16}$/.test(room) || !Object.hasOwn(fleet,data.type)) return reply(400,{});
        if(!['tour','pvp','pve'].includes(mode) || (mode!=='tour' && !fleet[data.type].pvp)) return reply(400,{});
        const rule=data.rule??(mode==='pve'?'waves':'beacon');
        if(!(mode==='pve'?rule==='waves':rule==='beacon'||(mode==='pvp'&&rule==='crown')))return reply(400,{});
        const group=rooms.get(room)??{mode,rule,members:new Set(),arena:mode!=='tour'?new Arena(performance.now(),rule):null};
        if(group.mode!==mode||group.rule!==rule) return reply(409,{reason:'mode'});
        const others=[...group.members];
        if (others.length>=8 || sessions.size>=256) return reply(409,{});
        const token = randomUUID(), id = randomUUID().slice(0,8);
        if(data.name!==undefined && typeof data.name!=='string')return reply(400,{});
        const entered=(data.name??'').normalize('NFKC').trim();
        if(entered && !/^[\p{L}\p{N} _·-]{1,12}$/u.test(entered))return reply(400,{reason:'name'});
        const base=entered||'飞行员', occupied=new Set(others.map(p=>p.name.toLowerCase()));
        let name=base;
        for(let n=2;occupied.has(name.toLowerCase());n++)name=base+'·'+n;
        const pilot={name,room,type:data.type,id,seen:Date.now(),pose:null,group};
        group.arena?.advance(performance.now()); const fighter=group.arena?.add(id,data.type,name,null,data.kit);
        rooms.set(room,group); group.members.add(pilot); sessions.set(token,pilot);
        return reply(200,{token,id,name,room,mode,rule,type:data.type,protocol:PeerPose.protocol,slot:fighter?.slot??others.length,lead:others.find(peer=>peer.pose)?.pose,
          spawn:fighter?.body.pos,heading:fighter?spawnHeading(fighter.slot,mode==='pve'):undefined});
      }
      const token = req.headers.authorization?.replace(/^Bearer /,''), pilot = sessions.get(token);
      if (!pilot) return reply(401,{});
      if (pathname === '/leave') {remove(token,pilot); return reply(200,{});}
      if(pilot.group.arena) {
        const arena=pilot.group.arena, player=arena.players.get(pilot.id); arena.advance(performance.now());
        if(!arena.input(player,data)) return reply(400,{});
        pilot.seen=Date.now(); return reply(200,arena.snapshot(player,Number.isSafeInteger(data.after)?data.after:0,Number.isSafeInteger(data.seenTracer)?data.seenTracer:0,Array.isArray(data.known)&&data.known.length<=(arena.mission?11:8)?data.known:null,data.compactSelf===true));
      }
      const vector = (value,size,limit) => Array.isArray(value) && value.length===size && value.every(num=>Number.isFinite(num)&&Math.abs(num)<=limit);
      if (!vector(data.pos,3,1e7)||!vector(data.quat,4,1.01)||Math.abs(Math.hypot(...data.quat)-1)>.025) return reply(400,{});
      pilot.seen=Date.now(); pilot.pose={condition:data.condition && Object.keys(Fields.labels).every(k=>Number.isInteger(data.condition[k])&&data.condition[k]>=0&&data.condition[k]<=100)?Object.fromEntries(Object.keys(Fields.labels).map(k=>[k,data.condition[k]])):null,pos:data.pos,quat:data.quat,rig:(vector(data.rig,9,1.001)||vector(data.rig,7,1.001))?data.rig:undefined,vel:vector(data.vel,3,2000)?data.vel:undefined};
      const peers=[...pilot.group.members].filter(peer=>peer!==pilot && peer.pose)
        .map(peer=>({id:peer.id,name:peer.name,type:peer.type,...peer.pose}));
      const group=pilot.group, now=performance.now();
      const harborCount=[...group.members].filter(member=>member.pose && Date.now()-member.seen<1500 && Lake.inZone(member.pose.pos,Lake.sites[3])).length;
      if(harborCount<2 || !group.lastGather || now-group.lastGather>1500){group.gatherSince=null;group.gatherDone=false;}
      if(harborCount>=2){
        group.gatherSince??=now;
        if(!group.gatherDone && now-group.gatherSince>=5000){group.rallies=(group.rallies??0)+1;group.gatherDone=true;}
      }
      group.lastGather=now;
      return reply(200,{peers,harbor:{count:harborCount,seconds:group.gatherSince===null?0:Math.min(5,Math.floor((now-group.gatherSince)/1000)),rallies:group.rallies??0}});
    } catch { if (!res.headersSent) reply(400,{}); }
  });
  return server;
}
if (require.main===module) {
  const port=Number(process.env.PORT ?? 8787);
  const server=createServer();
  server.on('error', error=>{console.error('无法启动联机服务:',error.message); process.exitCode=1;});
  server.listen(port,'0.0.0.0',()=>{
    const actual=server.address().port;
    console.log('本机游戏：http://127.0.0.1:'+actual+'/');
    for(const adapters of Object.values(os.networkInterfaces())) for(const address of adapters||[]) {
      if(address.family==='IPv4'&&!address.internal) console.log('局域网候选地址：http://'+address.address+':'+actual+'/');
    }
  });
}
module.exports={createServer};
