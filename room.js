class FlightRoom {
  constructor() {
    this.peers=new Map();this.shots=new Map();this.tracers=new Map();this.seenTracer=0; this.generation=0; this.status='单人飞行'; this.nextSync=0;
  }
  async request(path, data, token) {
    const response=await fetch('/'+path,{method:'POST',headers:{'Content-Type':'application/json',...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(data),signal:AbortSignal.timeout(3000)});
    if(!response.ok) throw Object.assign(new Error('房间服务 '+response.status),{status:response.status,reason:(await response.json().catch(()=>({}))).reason});
    return response.json();
  }
  leave() {
    if(this.token) this.request('leave',{},this.token).catch(()=>{});
    this.triggerTap=false;this.tracerTime=-Infinity;this.token=null; this.generation++; this.busy=false; this.peers.clear(); this.shots.clear();this.tracers=new Map();this.seenTracer=0;this.name=''; this.status='单人飞行';
    this.harbor=null; this.kit=Outfit.standard; this.pendingKit=null;
    this.mode='tour'; this.self=null; this.target=null; this.weapon='gun'; this.after=0; this.events=[]; this.dodge=false;
  }
  async join(room,type,mode='tour',name='',rule='beacon') {
    this.leave();
    const version=this.generation;
    const reply=await this.request('join',{room,type,mode,name,rule});
    if(reply.mode!==mode||reply.protocol!==10||reply.type!==type) {this.request('leave',{},reply.token).catch(()=>{}); throw new Error('旧版房主');}
    if(version!==this.generation) { this.request('leave',{},reply.token).catch(()=>{}); return null; }
    this.token=reply.token; this.id=reply.id;this.name=reply.name;this.mode=mode;this.rule=rule;this.code=reply.room??room; this.status=this.code+' · 1/8'; this.nextSync=0; return reply;
  }
  async sync(body,now,controls,fire) {
    if(!this.token || this.busy || now<this.nextSync) return;
    const version=this.generation;
    const duel=this.mode==='pvp';
    this.busy=true; this.nextSync=now+(duel?65:90);
    try {
      const command=duel?{controls,compactSelf:true,weapon:this.weapon,target:this.target,fire:fire||this.triggerTap,tap:this.triggerTap,dodge:this.dodge,after:this.after,seenTracer:this.seenTracer,known:[...this.peers.keys()]}:{pos:body.pos,quat:body.quat,vel:body.vel,condition:body.damaged?body.condition:undefined,rig:Flight.rig(body).map(v=>Math.round(v*100)/100)};
      if(duel && this.pendingKit!==null)command.kit=this.pendingKit;
      this.triggerTap=false;this.dodge=false;
      const {peers,self:wireSelf,events,serial,harbor,shots,tracers,clock,tracerSeq,live}=await this.request('sync',command,this.token);
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
      this.harbor=harbor;
      if(duel) {
        const self=Array.isArray(wireSelf)?PeerPose.unpackSelf(wireSelf,Airfields.freshCondition):wireSelf;
        for(const shot of tracers)this.tracers.set(shot[0],shot);
        let range=0;
        for(const id of this.tracers.keys()){
          while(range<live.length && id>live[range+1])range+=2;
          if(range===live.length || id<live[range])this.tracers.delete(id);
        }
        this.seenTracer=tracerSeq;this.tracerClock=clock;this.tracerTime=performance.now();
        this.kit=self.kit;
        if(this.pendingKit===self.kit)this.pendingKit=null;
        if(!Outfit.has(self.kit,this.weapon))this.weapon=self.weapon;
        this.self=self;this.after=serial;
        const stamp=performance.now(),ids=new Set();
        for(const [id,x,y,z,diverted,fx,fy,fz,type] of shots){
          ids.add(id);const point=[x,y,z],old=this.shots.get(id);
          this.shots.set(id,{prev:(old?.shown??point).slice(),pos:point,shown:(old?.shown??point).slice(),stamp,
            type,front:[fx,fy,fz],interval:old?Math.min(160,Math.max(35,stamp-old.stamp)):65,diverted,smokeAt:old?.smokeAt??0});
        }
        for(const id of this.shots.keys())if(!ids.has(id))this.shots.delete(id);
        for(const event of events)this.onEffect?.(event);
        for(const event of events) this.events.push({...event,born:performance.now()});
        this.events=this.events.filter(event=>performance.now()-event.born<1450).slice(-32);
        if(!this.peers.get(this.target)?.hp) this.target=peers.find(peer=>peer.hp)?.id??null;
        this.onState?.(self);
      }
      this.status=this.code+' · '+(peers.length+1)+'/8';
    } catch(error) {
      if(version!==this.generation) return;
      this.peers.clear();this.shots.clear();this.tracers=new Map();this.seenTracer=0; this.tracerTime=-Infinity;this.nextSync=performance.now()+900;
      if(error.status===401) {this.leave(); this.status='房间已超时 · H 重新加入';}
      else this.status='连接中断 · 正在重试';
    } finally {if(version===this.generation) this.busy=false;}
  }
}
