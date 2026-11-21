const scopeEffects=new Set(['echo','chime','arcWindup','arcBreak','arc','arcHop','glyph','bloom','prism','refract','pulse','burst','laser']);
class FlightRoom {
  get combat() { return this.mode==='pvp'||this.mode==='pve'; }
  lockReadout(){
    const lock=this.mission?.lock;
    if(!lock)return '锁定预警';
    const name=this.peers.get(lock.id)?.name||'巡逻机';
    return name+' · '+(lock.weapon==='ribbon'?'流光':'燕尾')+'蓄锁 '+lock.percent+'%';
  }
  flareReadout(incoming=false) {
    const {flares,puffs,flareRefill}=this.self;
    if(incoming)return !flares?'来袭 · 热诱弹已耗尽':puffs?'来袭 · 热诱弹连放中':'来袭 · X 热诱弹';
    const next=flareRefill?' · '+flareRefill+' 秒后补 1 枚':'';
    return '热诱弹 '+flares+'/'+Outfit.flares.capacity+' · '+(!flares?'已耗尽':puffs?'连放中':'就绪')+next;
  }
  hostile(peer) { return this.mode==='pvp'||(this.mode==='pve'&&peer.id.startsWith('ai-')); }
  constructor() {
    this.decoys=new Map();this.peers=new Map();this.marks=new Map();this.shots=new Map();this.tracers=new Map();this.seenTracer=0; this.generation=0; this.status='单人飞行'; this.nextSync=0;
  }
  cycleTarget() {
    const peers=[...this.peers.values()].filter(p=>p.hp&&this.hostile(p));
    const spec=Sight.reticle(this.weapon);
    let choices=peers;
    if(spec && this.self){
      const body={pos:this.self.pos,basis:Flight.axes(this.self.quat)};
      const inside=peers.filter(p=>this.marks.has(p.id)||Sight.inRing(body,p.pos,spec.ring,spec.reach,spec.inner));
      if(inside.length)choices=inside;
    }
    const index=choices.findIndex(p=>p.id===this.target);
    this.target=choices.length?choices[(index+1)%choices.length].id:null;
    this.manualTarget=this.target;
  }
  selectWeapon(weapon) {
    if(this.weapon!==weapon){this.weapon=weapon;this.marks.clear();this.triggerTap=false;this.manualTarget=null;}
  }
  pressTrigger(){
    if(!Sight.profiles[this.weapon]){this.triggerTap=true;return;}
    const peer=this.peers.get(this.target);
    if(peer?.hp && this.marks.get(peer.id)===100 && !this.self?.cool)
      this.triggerTap={target:peer.id,life:peer.life,at:performance.now()};
  }
  async request(path, data, token) {
    const response=await fetch('/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(3000)});
    if(!response.ok) throw Object.assign(new Error('房间服务 '+response.status),{status:response.status,reason:(await response.json().catch(()=>({}))).reason});
    return response.json();
  }
  leave() {
    this.decoys.clear();this.marks.clear();
    if(this.token) this.request('leave',{},this.token).catch(()=>{});
    this.triggerTap=false;this.tracerTime=-Infinity;this.token=null; this.generation++; this.busy=false; this.peers.clear(); this.shots.clear();this.tracers=new Map();this.seenTracer=0;this.name=''; this.status='单人飞行';
    this.hurt=null;this.strike=null;
    this.harbor=null; this.mission=null; this.kit=Outfit.standard; this.pendingKit=null;
    this.mode='tour'; this.self=null; this.target=null;this.manualTarget=null; this.weapon='gun'; this.after=0; this.events=[]; this.dodge=false;
  }
  async join(room,type,mode='tour',name='',rule='beacon',kit=Outfit.standard) {
    this.leave();
    const version=this.generation;
    const reply=await this.request('join',{room,type,mode,name,rule,kit,protocol:PeerPose.protocol});
    if(reply.mode!==mode||reply.protocol!==PeerPose.protocol||reply.type!==type) {this.request('leave',{},reply.token).catch(()=>{}); throw Object.assign(new Error('旧版房主'),{reason:'version'});}
    if(version!==this.generation) { this.request('leave',{},reply.token).catch(()=>{}); return null; }
    this.kit=kit;this.weapon=Outfit.first(kit);
    this.token=reply.token; this.id=reply.id;this.name=reply.name;this.mode=mode;this.rule=rule;this.code=reply.room??room; this.status=this.code+' · 1/8'; this.nextSync=0; return reply;
  }
  async sync(body,now,controls,fire,holdFlares=false) {
    if(!this.token || this.busy || now<this.nextSync) return;
    const version=this.generation;
    const duel=this.combat;
    this.busy=true; this.nextSync=now+(duel?65:90);
    try {
      if(duel && typeof controls==='function')controls=controls();
      const launch=this.triggerTap?.target && now-this.triggerTap.at<=450?this.triggerTap:null;
      const tapped=this.triggerTap===true;
      const command=duel?{controls,compactSelf:true,weapon:this.weapon,target:launch?.target??this.target,fire:Sight.profiles[this.weapon]?!!launch:fire||tapped,fireLife:launch?.life,tap:tapped,dodge:this.dodge||holdFlares,after:this.after,seenTracer:this.seenTracer,known:[...this.peers.keys()]}:{pos:body.pos,quat:body.quat,vel:body.vel,condition:body.damaged?body.condition:undefined,rig:Flight.rig(body).map(v=>Math.round(v*100)/100)};
      if(duel && this.pendingKit!==null)command.kit=this.pendingKit;
      if(duel && Sight.profiles[this.weapon])command.autoFocus=!this.manualTarget && !launch;
      this.triggerTap=false;this.dodge=false;
      const {peers,self:wireSelf,events,serial,harbor,shots,tracers,clock,tracerSeq,live,mission,tracking,decoys=[]}=await this.request('sync',command,this.token);
      if(version!==this.generation) return;
      const keep=new Set();
      for(let i=0;i<peers.length;i++){
        const row=peers[i];
        const peer=Array.isArray(row)?PeerPose.unpack(row,this.peers.get(row[0])):row;
        peers[i]=peer;
        keep.add(peer.id);
        const current=this.peers.get(peer.id);
        if(current && current.life===peer.life)Object.assign(current,peer);
        else this.peers.set(peer.id,{...peer,displayPos:peer.pos,displayQuat:peer.quat});
      }
      for(const id of this.peers.keys()) if(!keep.has(id)) this.peers.delete(id);
      this.harbor=harbor;this.mission=mission;
      if(duel) {
        const self=Array.isArray(wireSelf)?PeerPose.unpackSelf(wireSelf,Airfields.freshCondition):wireSelf;
        for(const shot of tracers)this.tracers.set(shot[0],shot);
        let range=0;
        for(const id of this.tracers.keys()){
          while(range<live.length && id>live[range+1])range+=2;
          if(range===live.length || id<live[range])this.tracers.delete(id);
        }
        this.seenTracer=tracerSeq;this.tracerClock=clock;this.tracerTime=performance.now();
        const liveDecoys=new Set();
        for(const row of decoys){
          if(Array.isArray(row)){
            const [id,at,start,velocity]=row;
            this.decoys.set(id,{at,start,velocity,pos:start.slice(),nextSmoke:0});
            liveDecoys.add(id);
          }else liveDecoys.add(row);
        }
        for(const id of this.decoys.keys())if(!liveDecoys.has(id))this.decoys.delete(id);
        this.kit=self.kit;
        if(this.pendingKit===self.kit)this.pendingKit=null;
        if(!Outfit.has(self.kit,this.weapon))this.selectWeapon(self.weapon);
        if(this.weapon===command.weapon){
          this.marks.clear();
          if(tracking && self.weapon===this.weapon){
            for(const [id,percent] of tracking.marks)if(this.peers.get(id)?.hp)this.marks.set(id,percent);
            if(this.target===command.target && this.marks.has(tracking.focus)){
              this.target=tracking.focus;
              if(this.manualTarget!==this.target)this.manualTarget=null;
            }
          }
        }
        if(this.self?.life!==self.life){this.hurt=null;this.strike=null;}
        this.self=self;this.after=serial;
        const stamp=performance.now(),ids=new Set();
        for(const [id,x,y,z,diverted,fx,fy,fz,type,threat] of shots){
          ids.add(id);const point=[x,y,z],old=this.shots.get(id);
          this.shots.set(id,{prev:(old?.shown??point).slice(),pos:point,shown:(old?.shown??point).slice(),stamp,
            type,threat,front:[fx,fy,fz],interval:old?Math.min(160,Math.max(35,stamp-old.stamp)):65,diverted,smokeAt:old?.smokeAt??0});
        }
        for(const id of this.shots.keys())if(!ids.has(id))this.shots.delete(id);
        for(const event of events){
          const born=stamp-Math.max(0,clock-event.at*1000);
          if(scopeEffects.has(event.kind))this.events.push({...event,born});
          if(event.loss>0){
            const key=event.to===this.id && event.life===self.life?'hurt':event.from===this.id?'strike':null;
            if(key){
              const last=this[key],stack=last && born-last.born<250 && last.weapon===event.weapon && last.part===event.part && last.from===event.from && last.to===event.to && last.life===event.life;
              this[key]={...event,born,loss:event.loss+(stack?last.loss:0)};
            }
          }
          if(stamp-born<650)this.onEffect?.(event);
        }
        this.events=this.events.filter(event=>stamp-event.born<1450).slice(-48);
        if(!this.peers.get(this.target)?.hp){this.target=peers.find(peer=>peer.hp&&this.hostile(peer))?.id??null;this.manualTarget=null;}
        this.onState?.(self);
      }
      const others=this.mode==='pve'?peers.filter(p=>!this.hostile(p)).length:peers.length;
      this.status=this.code+' · '+(others+1)+'/8';
    } catch(error) {
      if(version!==this.generation) return;
      this.marks.clear();this.peers.clear();this.shots.clear();this.tracers=new Map();this.seenTracer=0; this.tracerTime=-Infinity;this.nextSync=performance.now()+900;
      if(error.status===401) {this.leave(); this.status='房间已超时 · H 重新加入';}
      else this.status='连接中断 · 正在重试';
    } finally {if(version===this.generation) this.busy=false;}
  }
}
