const Flight = require('./flight.js');
const Fields=require('./airfields.js');
const Lake=require('./lake.js');
const Outfit=require('./outfit.js');
const groundAt=require('./terrain.js').makeHeightSampler();
const Sight=require('./sight.js');
const PeerPose=require('./peer-pose.js');
const Bolts=require('./bolts.cjs');
const Contact=require('./contacts.cjs');
const PatrolWaves=require('./waves.cjs');
// Shared arcade balance for every aircraft. HP is hull condition, while a
// struck component has its own condition that affects the existing flight rig.
const wingHit={hull:.42,local:.78},gearHit={hull:.18,local:1};
const missileHits={fuselage:{hull:1,local:1},engine:{hull:.62,local:.88},tail:{hull:.54,local:.82},
  leftWing:wingHit,rightWing:wingHit,noseGear:gearHit,leftGear:gearHit,rightGear:gearHit};
const weapons = {
  echo:{wait:5,range:155,damage:28},arc:{wait:6,range:Sight.arc.reach,jump:110,damage:14,hopDamage:6},
  glyph:{wait:4.2,range:700,radius:115,damage:30},prism:{wait:6.5},
  pulse: {range:290,wait:3.6,damage:23},
  gun: { range: 620, wait: 1/Sight.gunRate, damage: 2 },
  missile:Sight.profiles.missile,ribbon:Sight.profiles.ribbon,
  laser: { range: Sight.laser.reach, wait: 4, damage: 100 }
};
function distance2(a,b){return (a[0]-b[0])**2+(a[1]-b[1])**2+(a[2]-b[2])**2;}
const silent = {pitch:0,roll:0,yaw:0,throttle:0};
const spawnHeading=(slot,cooperative=false)=>cooperative?Math.PI:slot*Math.PI/4+Math.PI+.30;
function spawn(slot,type,cooperative) {
  if(cooperative)return Flight.create(type,[900+(slot%2?1:-1)*Math.ceil(slot/2)*45,1050,560-slot*26],spawnHeading(slot,true));
  const angle=slot*Math.PI/4;
  return Flight.create(type,[900+680*Math.sin(angle),1050,1500-680*Math.cos(angle)],spawnHeading(slot));
}
const rounded=(vector,scale)=>vector.map(value=>Math.round(value*scale)/scale);
class Arena {
  constructor(now,rule='beacon',patrolDraw) {
    this.mission=rule==='waves'?new PatrolWaves(weapons,groundAt,patrolDraw):null;
    this.rule=rule;this.starId=null;this.starTime=0;
    this.time=0; this.matchTime=0; this.last=now; this.acc=0; this.players=new Map(); this.events=[]; this.tracers=[];this.tracerId=0;this.shots=[]; this.shotId=0; this.serial=0; this.holder=null; this.hold=0; this.zoneCount=0;
  }
  add(id,type='comet',name=id,botSlot=null,kit=Outfit.standard) {
    if(!Object.hasOwn(Flight.fleet,type)||!Flight.fleet[type].pvp)throw new Error('Invalid arena airframe');
    Contact.prepare(type);
    const slots=new Set([...this.players.values()].map(player=>player.slot));
    const slot=botSlot??[0,4,2,6,1,5,3,7].find(value=>!slots.has(value));
    const player={id,type,slot,name,bot:botSlot!==null,assists:0,kills:0,deaths:0,life:0,kit,beacons:0,refitAt:0};
    this.players.set(id,player); this.reset(player);
    return player;
  }
  reset(player) {
    player.marks=new Map();player.focus=null;player.lastFired=null;
    Object.assign(player,{body:spawn(player.slot,player.type,this.mission&&!player.bot),hp:100,life:player.life+1,shield:this.time+2.4,revive:0,lastSummary:null,priorPos:[0,0,0],puffs:0,puffAt:0,flareCells:Outfit.flares.capacity,
      tags:new Map(),acquire:0,controls:silent,target:null,laser:0,gunAt:0,tap:false,gunCount:0,heat:0,hot:false,lastGun:-10,missileAt:0,ribbonAt:0,laserAt:0,weapon:Outfit.first(player.kit),pulseAt:0,echo:null,echoAt:0,arcAt:0,arcCast:null,glyphAt:0,glyph:null,prismAt:0,prismUntil:0,fire:false,flareRefillAt:0,divertUntil:0,lastInput:-1});
  }
  remove(id) {
    this.tracers=this.tracers.filter(t=>t.owner!==id);
    this.players.delete(id); this.shots=this.shots.filter(shot=>shot.from!==id&&shot.to!==id);
    if(this.players.size<2){
      this.holder=null; this.hold=0; this.zoneCount=0; this.starId=null; this.starTime=0;
    }
  }
  opponents(a,b) {
    return b && a!==b && (!this.mission || a.bot!==b.bot);
  }
  arcEligible(player,peer){
    return this.opponents(player,peer) && peer.hp>0 && peer.shield<=this.time &&
      Sight.inRing(player.body,peer.body.pos,Sight.arc.ring,Sight.arc.reach);
  }
  scan(player,spec,dt) {
    const marks=player.marks;
    let requested=this.players.get(player.target);
    const cooling=player[player.weapon+'At']>this.time;
    const eligible=peer=>this.opponents(player,peer)&&peer.hp>0&&peer.shield<=this.time
      && !(cooling&&player.lastFired===peer.id)
      && Sight.inRing(player.body,peer.body.pos,spec.ring,spec.reach,spec.inner);
    for(const [id,mark] of marks){
      const peer=this.players.get(id);
      if(!eligible(peer)||peer.life!==mark.life)marks.delete(id);
    }
    if(player.autoFocus && !player.fire){
      // Choose the room avatar nearest the center of the on-screen reticle.
      let best=Infinity,previous=null,previousOffset=Infinity;
      const {pos,basis}=player.body;
      for(const peer of this.players.values()){
        if(!eligible(peer))continue;
        const dx=peer.body.pos[0]-pos[0],dy=peer.body.pos[1]-pos[1],dz=peer.body.pos[2]-pos[2];
        const ahead=dx*basis.f[0]+dy*basis.f[1]+dz*basis.f[2];
        const offset=Math.max(0,(dx*dx+dy*dy+dz*dz)/(ahead*ahead)-1);
        if(offset<best){best=offset;requested=peer;}
        if(peer.id===player.focus){previous=peer;previousOffset=offset;}
      }
      // Two nearly overlapping nameplates should not swap the highlighted avatar every tick.
      if(previous && previousOffset<=(Math.sqrt(best)+spec.ring*.05)**2)requested=previous;
    }
    if(eligible(requested)&&!marks.has(requested.id)){
      if(marks.size===Sight.trackSlots)marks.delete([...marks.keys()].at(-1));
      marks.set(requested.id,{life:requested.life,time:0});
    }
    for(const peer of this.players.values()){
      if(marks.size>=Sight.trackSlots)break;
      if(!marks.has(peer.id)&&eligible(peer))marks.set(peer.id,{life:peer.life,time:0});
    }
    for(const mark of marks.values())mark.time=Math.min(spec.fill,mark.time+dt);
    player.focus=marks.has(requested?.id)?requested.id:(marks.keys().next().value??null);
    player.acquire=marks.get(player.focus)?.time??0;
    return this.players.get(player.focus);
  }
  input(player,data) {
    const controls={};
    for(const axis of Object.keys(silent)) {
      if(!Number.isFinite(data.controls?.[axis])||Math.abs(data.controls[axis])>1)return false;
      controls[axis]=data.controls[axis];
    }
    if(data.controls.keyboard!==undefined && typeof data.controls.keyboard!=='boolean')return false;
    controls.keyboard=data.controls.keyboard===true;
    if(!Object.hasOwn(weapons,data.weapon)) return false;
    if(data.controls.vector!==undefined && typeof data.controls.vector!=='boolean')return false;
    if(data.controls.trim!==undefined && ![-1,0,1].includes(data.controls.trim))return false;
    controls.trim=data.controls.trim||0;
    controls.vector=data.controls.vector===true;
    for(const key of ['gear','brake']){
      if(data.controls[key]!==undefined && typeof data.controls[key]!=='boolean')return false;
      controls[key]=data.controls[key];
    }
    if(data.kit!==undefined){
      if(!Outfit.valid(data.kit))return false;
      if(player.kit!==data.kit){
        player.kit=data.kit;player.refitAt=this.players.size<2?this.time:this.time+5;
        player.laser=0;player.acquire=0;player.marks.clear();player.focus=null;player.fire=false;
        if(!Outfit.has(player.kit,player.weapon))player.weapon=Outfit.first(player.kit);
      }
    }
    if(player.hp<=0) return true;
    const equipped=Outfit.has(player.kit,data.weapon);
    const selectionChanged=player.target!==data.target || player.weapon!==data.weapon;
    if(equipped && player.weapon!==data.weapon){player.marks.clear();player.focus=null;player.acquire=0;}
    if(player.target!==data.target || player.weapon!==data.weapon || !data.fire) player.laser=0;
    player.controls=controls; if(equipped)player.weapon=data.weapon;
    player.target=this.opponents(player,this.players.get(data.target))?data.target:null;
    player.tap=equipped && data.weapon==='gun' && data.tap===true;
    player.fire=equipped && data.fire===true; player.lastInput=this.time;
    player.autoFocus=data.autoFocus===true;
    player.fireLife=data.fireLife??this.players.get(player.target)?.life;
    // The sync reply is sent before the next physics tick. Echo the new primary
    // immediately without awarding a second slice of capture time.
    if(selectionChanged && equipped && Sight.profiles[player.weapon] && player.refitAt<=this.time && player.shield<=this.time)
      this.scan(player,Sight.profiles[player.weapon],0);
    if(data.dodge===true && this.time>=player.puffAt && !player.puffs && player.flareCells){
      player.puffs=Math.min(Outfit.flares.burst,player.flareCells);
      this.dispense(player);
    }
    return true;
  }
  dispense(player){
    if(!player.flareRefillAt)player.flareRefillAt=this.time+Outfit.flares.refill;
    const b=player.body,{r,f,u}=b.basis;
    player.flareCells--;player.puffs--;player.puffAt=this.time+Outfit.flares.interval;
    const side=player.flareCells%2?1:-1;
    const start=b.pos.map((v,i)=>v+side*r[i]*2-7*f[i]);
    const end=start.map((v,i)=>v+b.vel[i]*.19+r[i]*side*49-f[i]*40-u[i]*18);
    const e=this.event('flare',player,player,start,end);
    e.c=end.map((v,i)=>v+side*18*r[i]+6*u[i]);
    // Each coloured packet spends one arcade diversion token.
    const shot=this.shots.find(s=>!s.diverted && s.to===player.id && s.life===player.life);
    if(shot){Bolts.divert(shot,end);player.divertUntil=this.time+1.4;}
  }
  event(kind,from,to,a=from.body.pos,b=to.body.pos) {
    this.events.push({seq:++this.serial,kind,from:from.id,to:to.id,a:a.slice(),b:b.slice(),at:this.time});
    if(this.events.length>48) this.events.shift();
    return this.events[this.events.length-1];
  }
  damage(from,to,amount,part,localWear=amount*.8,impact=null,weapon=from.weapon) {
    if(to.hp<=0 || to.shield>this.time || (from!==to && !this.opponents(from,to))) return;
    if(from!==to && to.prismUntil>this.time){
      to.prismUntil=0;this.event('refract',from,to);return;
    }
    const previous=to.hp;
    if(from!==to){
      to.tags.set(from.id,this.time);
      Fields.wear(to.body,'fuselage',amount);
      const zone=part||Fields.sector(to.body,impact?.a??from.body.pos);
      if(zone!=='fuselage')Fields.wear(to.body,zone,localWear);
      impact=impact||this.event('damage',from,to);
      Object.assign(impact,{part:zone,weapon,life:to.life});
    }
    to.hp=Math.max(0,Math.min(to.hp-amount,to.body.condition.fuselage));
    if(impact)impact.loss=previous-to.hp;
    if(!to.hp) {
      if(this.players.size>=2)to.deaths++;
      if(from!==to) from.kills++; to.revive=this.time+2.2; to.fire=false; to.laser=0;
      for(const [id,at] of to.tags){
        const helper=this.players.get(id);
        if(helper && helper!==from && this.time-at<=5)helper.assists++;
      }
      if(this.rule==='crown'&&to.id===this.starId){
        this.starId=null;this.starTime=0;
        if(from!==to&&from.hp){from.beacons+=2;this.starId=from.id;}
      }
      this.event('burst',from,to);
    }
  }
  beaconSite(){
    return Lake.relayOrder[Math.floor(this.matchTime/Lake.relayDuration)%Lake.relayOrder.length];
  }
  tick(dt) {
    if(!this.players.size)return;
    const competitive=this.players.size>=2;
    const previousSite=this.beaconSite();
    this.time+=dt;
    this.mission?.update(this);
    if(competitive)this.matchTime+=dt;
    const site=this.beaconSite();
    if(site!==previousSite){this.holder=null;this.hold=0;}
    let occupant=null, count=0;
    for(const player of this.players.values()) {
      if(!player.hp) {if(!player.bot && this.time>=player.revive) this.reset(player); continue;}
      if(this.time-player.lastInput>.45) {player.controls=silent;player.fire=false;player.laser=0;}
      for(let i=0;i<3;i++)player.priorPos[i]=player.body.pos[i];
      Flight.step(player.body,player.controls,dt,groundAt);
      const [east,up,south]=player.body.pos;
      if(player.body.crashed || (!player.body.grounded && !player.body.softApproach && up<420 && up<=Math.max(0,groundAt(east,south))+3) || Lake.collide(player.body) || up>Lake.arenaCeiling || Math.hypot(east-900,south-1500)>Lake.arenaRadius) {
        player.shield=0; this.damage(player,player,100); continue;
      }
      if(competitive && this.rule==='beacon' && player.shield<=this.time && Lake.inZone(player.body.pos,Lake.sites[site])){occupant=player;count++;}
    }
    for(const a of this.players.values())for(const b of this.players.values()){
      if(a.slot>=b.slot || !a.hp || !b.hp || a.shield>this.time||b.shield>this.time || !this.opponents(a,b))continue;
      Fields.brush(a.body,b.body);
    }
    this.zoneCount=count;
    const holder=count===1?occupant.id:null;
    if(holder!==this.holder || !holder)this.hold=0;
    this.holder=holder;
    if(holder && (this.hold+=dt)>=4){occupant.beacons++;this.hold-=4;}
    if(competitive && this.rule==='crown'){
      const star=this.players.get(this.starId);
      if(star?.hp&&star.shield<=this.time){
        this.starTime+=dt;
        if(this.starTime>=8){star.beacons++;this.starTime-=8;}
      }else{
        this.starId=null;this.starTime=0;
        for(const pilot of this.players.values())if(pilot.hp&&pilot.shield<=this.time){this.starId=pilot.id;break;}
      }
    }
    for(const pilot of this.players.values())if(pilot.hp){
      if(pilot.body.crashed || pilot.body.condition.fuselage===0){pilot.shield=0;this.damage(pilot,pilot,100);}
      else pilot.hp=pilot.body.condition.fuselage;
    }
    const hits=[];
    for(const player of this.players.values()) {
      if(player.hp && player.flareRefillAt && this.time>=player.flareRefillAt){
        player.flareCells++;
        player.flareRefillAt=player.flareCells<Outfit.flares.capacity?player.flareRefillAt+Outfit.flares.refill:0;
      }
      if(player.hp && player.puffs && player.puffAt<=this.time)this.dispense(player);
      if(player.hot || this.time-player.lastGun>.28)player.heat=Math.max(0,player.heat-dt*.32);
      if(player.hot && player.heat<=.2)player.hot=false;
      let other=this.players.get(player.target);
      const spec=weapons[player.weapon];
      if(player.echo && this.time>=player.echo.until){
        const center=player.echo.pos;
        this.event('chime',player,player,center,center);
        for(const peer of this.players.values()){
          if(this.opponents(player,peer) && peer.hp && distance2(center,peer.body.pos)<=weapons.echo.range**2)
            hits.push([player,peer,weapons.echo.damage,undefined,undefined,this.event('damage',player,peer,center),'echo']);
        }
        player.echo=null;
      }
      const mark=player.glyph;
      if(mark && this.time>=mark.until){
        const peer=this.players.get(mark.id);
        if(peer?.hp && peer.life===mark.life){
          this.event('bloom',player,peer,mark.pos,mark.pos);
          if(Math.hypot(...peer.body.pos.map((v,i)=>v-mark.pos[i]))<=weapons.glyph.radius)hits.push([player,peer,weapons.glyph.damage,undefined,undefined,this.event('damage',player,peer,mark.pos),'glyph']);
        }
        player.glyph=null;
      }
      const armed=player.hp>0 && player.refitAt<=this.time && player.shield<=this.time;
      const cast=player.arcCast;
      if(cast){
        const target=this.players.get(cast.id);
        if(!armed || player.weapon!=='arc' || player.target!==cast.id || !this.arcEligible(player,target) || target.life!==cast.life){
          player.arcCast=null;
          if(target?.hp && target.life===cast.life)this.event('arcBreak',player,target);
        }else if(this.time>=cast.until){
          player.arcCast=null;
          const arc=weapons.arc;
          hits.push([player,target,arc.damage,undefined,undefined,this.event('arc',player,target),'arc']);
          let nearest=null,best=arc.jump**2;
          for(const peer of this.players.values()){
            if(peer===target || !this.arcEligible(player,peer))continue;
            const d=distance2(target.body.pos,peer.body.pos);
            if(d<=best){nearest=peer;best=d;}
          }
          if(nearest){
            const hop=this.event('arcHop',player,nearest,target.body.pos,nearest.body.pos);
            hits.push([player,nearest,arc.hopDamage,undefined,undefined,hop,'arc']);
          }
        }
      }
      const inputAge=this.time-player.lastInput;
      const available=armed && inputAge<=.45;
      const missile=Sight.profiles[player.weapon];
      if(armed && missile && inputAge<=1.5)other=this.scan(player,missile,dt);
      else if(player.marks.size){player.marks.clear();player.focus=null;player.acquire=0;}
      const freeGun=player.weapon==='gun' && player.hp && player.refitAt<=this.time && (available||!competitive);
      if(freeGun && (player.fire||player.tap) && !player.hot && player.gunAt<=this.time+1e-8){
        const b=player.body,dir=b.basis.f;
        player.lastGun=this.time;player.gunAt=this.time+weapons.gun.wait;
        player.heat=Math.min(1,player.heat+1/Sight.gunCapacity+1e-12);player.hot=player.heat>=1;
        const pos=b.pos.map((v,i)=>v+dir[i]*14),vel=b.vel.map((v,i)=>v+dir[i]*Sight.streakSpeed);
        const id=++this.tracerId;
        player.gunCount++;
        this.tracers.push({id,owner:player.id,life:player.life,pos,vel,age:0,
          spawn:[id,Math.round((this.time-dt)*1000),...rounded(pos,10),...rounded(vel,10)]});
      }
      player.tap=false;
      if(player.weapon==='gun')continue;
      if(!available || !player.fire){player.laser=0;continue;}
      if(player.weapon==='echo'){
        if(player.echoAt<=this.time){
          player.echoAt=this.time+spec.wait;player.echo={pos:player.body.pos.slice(),until:this.time+1};
          this.event('echo',player,player);
        }
        continue;
      }
      if(player.weapon==='prism'){
        if(player.prismAt<=this.time){
          player.prismAt=this.time+spec.wait;player.prismUntil=this.time+1.6;this.event('prism',player,player);
        }
        continue;
      }
      if(player.weapon==='pulse'){
        if(player.pulseAt<=this.time){
          player.pulseAt=this.time+spec.wait;this.event('pulse',player,player);
          for(const peer of this.players.values()){
            if(this.opponents(player,peer) && peer.hp && peer.shield<=this.time &&
              Math.hypot(...peer.body.pos.map((v,i)=>v-player.body.pos[i]))<=spec.range)hits.push([player,peer,spec.damage]);
          }
        }
        continue;
      }
      if(!other?.hp || other===player || other.shield>this.time){player.laser=0;continue;}
      if(player.weapon==='arc'){
        if(player.arcAt<=this.time && this.arcEligible(player,other)){
          player.arcAt=this.time+spec.wait;
          player.arcCast={id:other.id,life:other.life,until:this.time+Sight.arc.fill};
          this.event('arcWindup',player,other);
        }
        continue;
      }
      if(player.weapon==='glyph'){
        if(player.glyphAt<=this.time && Math.hypot(...other.body.pos.map((v,i)=>v-player.body.pos[i]))<=spec.range){
          player.glyphAt=this.time+spec.wait;player.glyph={id:other.id,life:other.life,pos:other.body.pos.slice(),until:this.time+1.2};
          this.event('glyph',player,other);
        }
        continue;
      }
      const point=other.body.pos;
      if(missile){
        if(player.acquire<missile.fill || player.target!==other.id || player.fireLife!==other.life)continue;
      }else if(!Sight.inRing(player.body,point,Sight.laser.ring,spec.range)){
        player.laser=0;continue;
      }
      const key=player.weapon+'At';
      if(player[key]>this.time)continue;
      if(player.weapon==='laser' && (player.laser+=dt)<Sight.laser.fill)continue;
      player[key]=this.time+spec.wait;player.laser=0;
      this.event(player.weapon,player,other,player.body.pos,point);
      if(missile){
        this.shots.push(Bolts.launch(++this.shotId,player,other,player.weapon));
        player.lastFired=other.id;player.marks.delete(other.id);player.focus=null;player.acquire=0;player.fire=false;
      }else hits.push([player,other,spec.damage]);
    }
    // Finite-lived arcade streaks. Sample the short tick segment in order so scenery
    // in front of an avatar absorbs the shot first, even on a fast crossing.
    const contacts=[];
    for(const shot of this.shots){
      const target=this.players.get(shot.to),from=this.players.get(shot.from);
      if(!target?.hp || target.life!==shot.life){contacts.push({at:0,kind:'fade',shot,from});continue;}
      const ended=Bolts.move(shot,target,dt),wall=Bolts.obstacle(shot);
      if(wall<=1)contacts.push({at:wall,kind:'fade',shot,from});
      else if(ended)contacts.push({at:1,kind:'fade',expires:true,shot,from});
      const detail={};
      for(const peer of this.players.values()){
        if(!peer.hp||!from||!this.opponents(from,peer)||peer.shield>this.time)continue;
        const at=Contact.plane(shot,peer.body,peer.priorPos,detail);
        if(at<=1)contacts.push({at,kind:'hit',shot,from,peer,part:detail.part});
      }
    }
    const nearby=[];
    for(let i=this.tracers.length-1;i>=0;i--){
      const t=this.tracers[i],owner=this.players.get(t.owner);
      t.age+=dt;
      let done=!owner || owner.life!==t.life || t.age>Sight.streakLife;
      t.vel[1]-=18*dt;
      const [px,py,pz]=t.pos,ex=t.vel[0]*dt,ey=t.vel[1]*dt,ez=t.vel[2]*dt;
      if(!done && this.shots.length){
        const end=[px+ex,py+ey,pz+ez];
        for(const shot of this.shots){
          if(this.mission && !this.opponents(owner,this.players.get(shot.from)))continue;
          const at=Contact.tracer(shot,t.pos,end);
          if(at<=1)contacts.push({at,kind:'intercept',shot,t,from:owner});
        }
      }
      const scenery=Math.min(py,py+ey)<=Math.max(420,Lake.sceneryTop+1);
      nearby.length=0;
      for(const peer of this.players.values()){
        if(!owner || !this.opponents(owner,peer) || !peer.hp || peer.shield>this.time)continue;
        const p=peer.body.pos;
        if(Math.abs(p[0]-px)<=16+Math.abs(ex) && Math.abs(p[1]-py)<=16+Math.abs(ey) &&
           Math.abs(p[2]-pz)<=16+Math.abs(ez))nearby.push(peer);
      }
      if(!done && !scenery && !nearby.length){
        t.pos[0]+=ex;t.pos[1]+=ey;t.pos[2]+=ez;continue;
      }
      const steps=Math.max(1,Math.ceil(Math.hypot(ex,ey,ez)/3)),slice=dt/steps;
      for(let k=0;!done && k<steps;k++){
        for(let d=0;d<3;d++)t.pos[d]+=slice*t.vel[d];
        const [x,y,z]=t.pos,field=y<185 && Fields.at(x,z);
        if((y<420 && y<=Math.max(0,groundAt(x,z))) || (field && Math.abs(y-field.y)<2.5) || (scenery && Lake.touches(t.pos,.5))){done=true;contacts.push({at:(k+1)/steps,kind:'wall',t});break;}
        for(const peer of nearby){
          const b=peer.body,dx=x-b.pos[0],dy=y-b.pos[1],dz=z-b.pos[2];
          if(dx*dx+dy*dy+dz*dz>245)continue;
          const dot=a=>dx*a[0]+dy*a[1]+dz*a[2];
          if((dot(b.basis.r)/(b.span+1))**2+(dot(b.basis.u)/3.5)**2+(dot(b.basis.f)/12)**2>1)continue;
          contacts.push({at:(k+1)/steps,kind:'spark',t,peer,from:owner,point:t.pos.slice()});
          done=true;break;
        }
      }
      if(done)this.tracers.splice(i,1);
    }
    if(contacts.length){
      // Resolve in sub-tick order so a later intercept cannot cancel an earlier impact.
      const spentShots=new Set(),spentRounds=new Set();
      contacts.sort((a,b)=>a.at-b.at || Number(!!a.expires)-Number(!!b.expires));
      for(const {at,kind,shot,t,from,peer,point,part} of contacts){
        if(spentShots.has(shot)||spentRounds.has(t))continue;
        if(t)spentRounds.add(t);if(shot)spentShots.add(shot);
        if(kind==='wall'||!from)continue;
        const p=point||shot.prev.map((v,i)=>v+(shot.pos[i]-v)*at);
        const effect=this.event(kind,from,peer||from,p,p);
        if(kind==='hit'||kind==='spark'){
          const direction=shot?shot.axes.f:t.vel;
          const scale=40/Math.max(.001,Math.hypot(...direction));
          effect.source=p.map((v,i)=>v-direction[i]*scale);
        }
        if(kind==='hit'){
          const base=weapons[shot.type].damage,loss=missileHits[part];
          hits.push([from,peer,base*loss.hull,part,base*loss.local,effect,shot.type]);
        }else if(kind==='spark')hits.push([from,peer,weapons.gun.damage,Fields.sector(peer.body,p),undefined,effect,'gun']);
      }
      if(spentShots.size)this.shots=this.shots.filter(s=>!spentShots.has(s));
      if(spentRounds.size)this.tracers=this.tracers.filter(t=>!spentRounds.has(t));
    }
    for(const hit of hits)this.damage(...hit);
  }
  advance(now) {
    this.acc+=Math.max(0,Math.min(.25,(now-this.last)/1000));this.last=now;
    while(this.acc+1e-12>=Flight.tick) {this.tick(Flight.tick);this.acc-=Flight.tick;}
  }
  snapshot(player,after,seenTracer=0,known=null,compactSelf=false) {
    const summary=pilot=>{
      if(!pilot.lastSummary||pilot.summaryTime!==this.time){
        pilot.summaryTime=this.time;
        pilot.lastSummary={gunCount:pilot.gunCount,gunning:pilot.fire && !pilot.hot && pilot.weapon==='gun' && this.time-pilot.lastGun<.075,id:pilot.id,name:pilot.name,type:pilot.type,condition:pilot.body.damaged?{...pilot.body.condition}:null,rig:rounded(Flight.rig(pilot.body),100),assists:pilot.assists,vel:rounded(pilot.body.vel,1),pos:rounded(pilot.body.pos,100),quat:rounded(pilot.body.quat,100000),hp:pilot.hp,kills:pilot.kills,deaths:pilot.deaths,beacons:pilot.beacons,life:pilot.life};
        pilot.poseRow=null;
      }
      return pilot.lastSummary;
    };
    const remain=until=>Math.max(0,until-this.time);
    // Consecutive live IDs compress to one pair, even during an eight-player burst.
    if(this.tracerSnapshotTime!==this.time || this.tracerSnapshotList!==this.tracers){
      this.tracerSnapshotTime=this.time;this.tracerSnapshotList=this.tracers;
      const ranges=[];
      for(const t of this.tracers){
        if(ranges.length && ranges[ranges.length-1]===t.id-1)ranges[ranges.length-1]=t.id;
        else ranges.push(t.id,t.id);
      }
      this.liveRanges=ranges;
    }
    let lo=0,hi=this.tracers.length;
    while(lo<hi){const mid=(lo+hi)>>>1;if(this.tracers[mid].id<=seenTracer)lo=mid+1;else hi=mid;}
    const births=[];
    for(let i=lo;i<this.tracers.length;i++)births.push(this.tracers[i].spawn);
    const peers=[];
    let arcThreat=null,laserThreat=null,warned=false,patrolLock=null;
    for(const other of this.players.values()){
      if(other===player)continue;
      if(other.hp){
        if(other.arcCast?.id===player.id && other.arcCast.life===player.life)arcThreat=other.id;
        if(other.target===player.id && other.laser>0)laserThreat=other.id;
        const mark=other.marks.get(player.id);
        if(mark?.life===player.life){
          warned=true;
          if(other.bot && Sight.profiles[other.weapon]){
            const percent=Sight.percent(mark.time,Sight.profiles[other.weapon].fill);
            if(!patrolLock||percent>patrolLock.percent)patrolLock={id:other.id,weapon:other.weapon,percent};
          }
        }
      }
      const peer=summary(other);
      if(!known){peers.push(peer);continue;}
      other.poseRow??=PeerPose.pack(peer);
      peers.push(known.includes(peer.id)?other.poseRow:[...other.poseRow,peer.name,peer.type]);
    }
    const result={clock:Math.round(this.time*1000),tracerSeq:this.tracerId,live:this.liveRanges,
      tracers:births,peers,
      self:{...summary(player),vel:rounded(player.body.vel,1000),rates:rounded(player.body.rates,10000),throttle:player.body.throttle,engine:player.body.engine,
        condition:{...player.body.condition},service:player.body.service,damaged:player.body.damaged,pitchTrim:player.body.pitchTrim,grounded:player.body.grounded,gear:player.body.gear,gearDown:player.body.gearDown,touchdowns:player.body.touchdowns,sinkAtTouch:player.body.sinkAtTouch,prism:remain(player.prismUntil),
        vector:player.body.vector,deploy:player.body.deploy,charge:player.body.charge,empty:player.body.empty,
        heat:player.heat,hot:player.hot,kit:player.kit,weapon:player.weapon,refit:remain(player.refitAt),
        star:this.rule==='crown'?{id:this.starId,seconds:Math.floor(this.starTime)}:undefined,
        beacon:{site:this.beaconSite(),left:Math.ceil(Lake.relayDuration-this.matchTime%Lake.relayDuration),count:this.zoneCount,hold:player.id===this.holder?Math.floor(this.hold*10)/10:0},
        lock:player.arcCast?Math.max(0,1-remain(player.arcCast.until)/Sight.arc.fill):player.laser/Sight.laser.fill,shield:remain(player.shield),revive:remain(player.revive),cool:remain(player[player.weapon+'At']),
        flares:player.flareCells,puffs:player.puffs,dodge:remain(player.puffAt),flareRefill:Math.ceil(remain(player.flareRefillAt)),diverted:player.divertUntil>this.time,acquire:Sight.percent(player.acquire,Sight.profiles[player.weapon]?.fill||1),
        arcThreat,laserThreat,warned:warned || !!laserThreat,
        incoming:this.shots.some(shot=>!shot.diverted&&shot.to===player.id&&shot.life===player.life)},
      shots:this.shots.map(s=>[s.id,...rounded(s.pos,10),s.diverted?1:0,...rounded(s.axes.f,1000),s.type,+(!s.diverted && s.to===player.id && s.life===player.life)]),
      events:this.events.filter(event=>event.seq>after && this.time-event.at<1.5),serial:this.serial};
    if(Sight.profiles[player.weapon])result.tracking={focus:player.focus,marks:[...player.marks].map(([id,mark])=>[id,Sight.percent(mark.time,Sight.profiles[player.weapon].fill)])};
    if(this.mission){
      result.mission=this.mission.snapshot(this.time,this.players.get(player.target));
      if(patrolLock)result.mission.lock=patrolLock;
    }
    if(compactSelf)result.self=PeerPose.packSelf(result.self);
    return result;
  }
}
module.exports={Arena,spawnHeading};
