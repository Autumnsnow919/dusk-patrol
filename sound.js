// Short mono samples are synthesized once on first use. All timing is in game units.
class FlightAudio {
  constructor(rate) {
    this.rate=rate;this.bank=new Map();this.guns=new Map();this.counts=new Map();this.lastCue=new Map();
    this.enabled=true;this.active=false;this.voices=new Set();this.previous=null;
    try{this.enabled=localStorage.getItem('dusk-sound')!=='off';}catch{}
  }
  unlock(){
    if(!this.enabled)return;
    clearTimeout(this.idleTimer);
    try{
      if(!this.ctx)this.build(new (window.AudioContext||window.webkitAudioContext)());
      if(this.ctx.state==='suspended')this.ctx.resume().catch(()=>{});
    }catch{}
  }
  build(ctx){
    this.ctx=ctx;
    this.master=ctx.createGain();this.master.gain.value=0;
    const limiter=ctx.createDynamicsCompressor();
    limiter.threshold.value=-12;limiter.ratio.value=8;limiter.knee.value=8;
    limiter.connect(this.master);this.master.connect(ctx.destination);this.bus=limiter;
    const noise=ctx.createBufferSource();
    noise.buffer=this.sample('air');noise.loop=true;
    const band=(type,hz)=>{
      const filter=ctx.createBiquadFilter(),gain=ctx.createGain();
      filter.type=type;filter.frequency.value=hz;filter.Q.value=.65;gain.gain.value=0;
      noise.connect(filter);filter.connect(gain);gain.connect(this.bus);return {filter,gain};
    };
    this.engine=band('lowpass',530);this.wind=band('bandpass',1900);
    this.wheels=band('bandpass',155);
    this.buffet=band('lowpass',190);
    this.cabin=ctx.createBiquadFilter();this.cabin.type='lowpass';this.cabin.frequency.value=620;
    this.cabin.Q.value=.65;this.cabin.connect(this.bus);
    this.whine=ctx.createOscillator();this.whineGain=ctx.createGain();this.whineGain.gain.value=0;
    this.whine.connect(this.whineGain);this.whineGain.connect(this.bus);this.whine.start();noise.start();
  }
  setActive(active){
    this.active=active;
    clearTimeout(this.idleTimer);
    if(active && this.enabled && this.ctx?.state==='suspended')this.ctx.resume().catch(()=>{});
    if(this.ctx)this.master.gain.setTargetAtTime(active && this.enabled ? .72 : 0,this.ctx.currentTime,.016);
    if(!active||!this.enabled){
      for(const id of this.guns.keys())this.stopGun(id);
      for(const source of this.voices)source.stop();
      this.previous=null;this.lastCue.clear();this.counts.clear();
      if(this.ctx)this.idleTimer=setTimeout(()=>{
        if(!this.active || !this.enabled)this.ctx.suspend().catch(()=>{});
      },230);
    }
  }
  toggle(active){
    this.enabled=!this.enabled;
    try{localStorage.setItem('dusk-sound',this.enabled?'on':'off');}catch{}
    this.unlock();this.setActive(active);
  }
  get audible(){return this.ctx && this.active && this.enabled;}
  // Each recipe layers envelopes, filtered noise and pitched partials. The
  // repeated cannon waveform contains twelve different transients per loop.
  sample(name){
    if(this.bank.has(name))return this.bank.get(name);
    const durations={air:1,gun:12/this.rate,boom:.65,missile:.55,laser:.36,
      pulse:.47,flare:.28,burst:.76,hit:.21,gear:.48,touch:.28,hot:.38,ready:.19,
      warned:.24,incoming:.23,stall:.32,ground:.37,prism:.38,glyph:.32,service:.32};
    const ctx=this.ctx,hz=ctx.sampleRate;
    const buffer=ctx.createBuffer(1,Math.round(hz*durations[name]),hz),out=buffer.getChannelData(0);
    const tau=2*Math.PI,sin=Math.sin,exp=Math.exp;
    let seed=27183,low=0,mid=0,baseline=0;
    const bassCut=1-exp(-tau*21/hz);
    const ping=(u,f,decay)=>u<0?0:sin(tau*f*u)*Math.min(1,u/.003)*exp(-u*decay);
    for(let i=0;i<out.length;i++){
      seed=(Math.imul(seed,1664525)+1013904223)>>>0;
      const n=seed/2147483648-1;
      low+=(n-low)*(1-exp(-tau*210/hz));mid+=(n-mid)*(1-exp(-tau*1150/hz));
      const t=i/hz,T=i/out.length,rumble=low*5,hiss=n-mid;
      let v;
      switch(name){
        case 'air':v=n*.53+low*1.8;break;
        case 'gun':{
          const beat=T*12,k=Math.floor(beat),u=(beat-k)/this.rate;
          const snap=(mid*2.3+hiss*.40)*exp(-u*220);
          const body=sin(tau*(156*u-930*u*u))*exp(-u*92);
          v=(snap+body*.64)*(.86+.12*sin(k*4.4))*Math.min(1,u/.0007)+.11*rumble;
          break;
        }
        case 'boom':{
          // A short N-shaped pressure pulse. Removing its slow component
          // leaves two sharp fronts and a low thump on ordinary speakers.
          const gap=.108,rise=.0014;
          const pressure=t<gap?Math.min(1,t/rise)*(1-2*t/gap):-Math.max(0,1-(t-gap)/rise);
          baseline+=bassCut*(pressure-baseline);
          const tail=t-gap;
          const air=rumble*(.38*exp(-t*18)+(tail>0 ? .30*exp(-tail*10) : 0));
          v=2*(pressure-baseline)+air;break;
        }
        case 'missile':v=(mid*1.7+hiss*.4+sin(tau*(230*t-160*t*t))*.22)*exp(-t*5);break;
        case 'laser':v=(sin(tau*(980*t-1030*t*t))+.23*sin(tau*1850*t))*exp(-8*t);break;
        case 'pulse':v=(sin(tau*(220*t-175*t*t))+rumble*.46)*exp(-t*7);break;
        case 'flare':v=(hiss*.9+mid)*exp(-t*27)+(t>.085?(hiss*.65+mid)*exp(-(t-.085)*23):0);break;
        case 'burst':v=(rumble*1.3+mid*.8*exp(-t*9)+sin(tau*(69*t-27*t*t))*.58)*exp(-t*4.7);break;
        case 'hit':v=(n*.8+ping(t,210,30)+ping(t,630,50)*.55)*exp(-t*23);break;
        case 'gear':v=(.25*sin(tau*(165*t+45*t*t))+mid*.35)*sin(Math.PI*T)+ping(t-.39,92,48);break;
        case 'touch':v=(rumble+.6*ping(t,76,24))*exp(-t*19)+.28*ping(t-.045,760,37);break;
        case 'hot':v=.65*ping(t,490,15)+.68*ping(t-.14,320,13)+.23*hiss*exp(-t*8);break;
        case 'ready':v=.52*ping(t,560,28)+.6*ping(t-.066,850,30);break;
        case 'warned':v=.65*ping(t,610,12);break;
        case 'incoming':v=.74*ping(t,990,26)+.74*ping(t-.098,990,26);break;
        case 'stall':v=.55*sin(tau*176*t)*(1+.35*sin(tau*12*t))*sin(Math.PI*T);break;
        case 'ground':v=.72*ping(t,425,20)+.72*ping(t-.14,540,17);break;
        case 'prism':v=.50*ping(t,780,11)+.42*ping(t,1170,9);break;
        case 'glyph':v=.60*sin(tau*(390*t+670*t*t))*sin(Math.PI*T);break;
        case 'service':v=.5*ping(t,480,20)+.5*ping(t-.08,640,20)+.5*ping(t-.16,800,20);break;
      }
      const edge=name==='gun'?1:Math.min(1,i/(hz*.002),(out.length-i)/(hz*.008));
      out[i]=Math.tanh(v)*edge;
    }
    this.bank.set(name,buffer);return buffer;
  }
  voice(name,volume,pan=0,loop=false,rate=1){
    const c=this.ctx,node=c.createBufferSource(),gain=c.createGain();
    const stereo=c.createStereoPanner?c.createStereoPanner():null;
    node.buffer=this.sample(name==='cabinBoom'?'boom':name);node.loop=loop;node.playbackRate.value=rate;node.connect(gain);gain.gain.value=volume;
    const bus=name==='cabinBoom'?this.cabin:this.bus;
    if(stereo){stereo.pan.value=pan;gain.connect(stereo);stereo.connect(bus);}
    else gain.connect(bus);
    this.voices.add(node);
    node.onended=()=>{this.voices.delete(node);node.disconnect();gain.disconnect();stereo?.disconnect();};
    node.start();return {node,gain,stereo};
  }
  cue(name,volume=.65,pan=0,gap=0,rate=1){
    if(!this.audible || volume<.012 || this.voices.size>=28)return;
    const t=this.ctx.currentTime;
    if(t-(this.lastCue.get(name)??-10)<gap)return;
    this.lastCue.set(name,t);this.voice(name,volume,pan,false,rate);
  }
  stopGun(id){
    const voice=this.guns.get(id);if(!voice)return;
    const t=this.ctx.currentTime;
    voice.gain.gain.setTargetAtTime(0,t,.008);voice.node.stop(t+.04);this.guns.delete(id);
  }
  gun(id,playing,level,pan){
    if(!playing || level<.015 || !this.audible){this.stopGun(id);return;}
    let voice=this.guns.get(id);
    if(!voice){voice=this.voice('gun',0,pan,true);this.guns.set(id,voice);}
    const t=this.ctx.currentTime;
    voice.gain.gain.setTargetAtTime(level,t,.009);
    voice.stereo?.pan.setTargetAtTime(pan,t,.045);
  }
  emitter(id,state,playing,level,pan){
    if(!state){this.stopGun(id);this.counts.delete(id);return;}
    const count=this.counts.get(id);
    // A tap can begin and end between two network replies.
    if(!playing && !state.hot && level>.015 && count?.life===state.life &&
       state.gunCount>count.n && !this.guns.has(id) && this.voices.size<28){
      const voice=this.voice('gun',level,pan);
      const end=this.ctx.currentTime+Math.min(3,state.gunCount-count.n)/this.rate;
      voice.gain.gain.setTargetAtTime(0,end,.003);voice.node.stop(end+.016);
    }
    if(count){count.life=state.life;count.n=state.gunCount;}
    else this.counts.set(id,{life:state.life,n:state.gunCount});
    this.gun(id,playing,level,pan);
  }
  position(pos,cam){
    const x=pos[0]-cam.pos[0],y=pos[1]-cam.pos[1],z=pos[2]-cam.pos[2];
    const d=Math.hypot(x,y,z),r=cam.B.r;
    return [1/(1+(d/290)**1.5),Math.max(-1,Math.min(1,(x*r[0]+y*r[1]+z*r[2])/Math.max(1,d)))];
  }
  event(e,id,cam){
    if(!this.audible)return;
    const names={intercept:'burst',hit:'burst',burst:'burst',spark:'hit',missile:'missile',ribbon:'missile',laser:'laser',pulse:'pulse',
      echo:'glyph',chime:'pulse',arc:'prism',arcHop:'hit',flare:'flare',prism:'prism',refract:'prism',bloom:'pulse',glyph:'glyph'};
    const cue=names[e.kind];if(!cue)return;
    const impact=['hit','spark','burst','refract','bloom','intercept'].includes(e.kind);
    const local=(impact?e.to:e.from)===id;
    const [level,pan]=this.position(impact?e.b:e.a,cam);
    this.cue(cue,local ? .86 : level*.85,local?0:pan,cue==='hit' ? .075 : .025);
  }
  update(body,S,cam,room,brake,trigger){
    if(!this.audible)return;
    const t=this.ctx.currentTime,self=room.self,alive=self?.hp!==0;
    const prev=this.previous,continuous=prev?.body===body;
    const thrust=body.engine||0,prop=!!Flight.fleet[body.type].shaft;
    const set=(param,v)=>param.setTargetAtTime(v,t,.07);
    set(this.engine.gain.gain,alive ? .17+.44*thrust+.13*S.boost : 0);
    set(this.engine.filter.frequency,prop?180+360*thrust:340+730*thrust);
    set(this.whine.frequency,prop?64+48*thrust:640+710*thrust);
    set(this.whineGain.gain,alive?(prop ? .065 : .013)+thrust*.020:0);
    set(this.wind.gain.gain,alive?Math.min(.22,S.speed/1750)*(1-.45*cam.wCockpit):0);
    const transonic=Math.max(0,1-Math.abs(body.mach-1)/.065);
    set(this.buffet.gain.gain,alive ? .85*cam.wCockpit*transonic*transonic : 0);
    set(this.wheels.gain.gain,body.grounded?Math.min(.8,S.speed/85)*(brake ? .85 : .4):0);
    if(continuous && alive){
      if(body.touchdowns>prev.touch)this.cue('touch',Math.min(1,.30+(body.sinkAtTouch||0)*.09));
      if(body.gearDown!==prev.gear)this.cue('gear',.44);
      if(prev.damaged&&!body.damaged)this.cue('service',.45);
      if(self?.hot&&!prev.hot)this.cue('hot',.78);
      if(prev.hot&&self&&!self.hot)this.cue('ready',.50);
    }
    const synced=performance.now()-room.tracerTime<320;
    const alert=!alive?'':synced&&self?.incoming?'incoming':synced&&self?.warned?'warned':
      !body.grounded && !body.gearDown && S.agl<65 && S.vs<-7?'ground':body.stalled?'stall':'';
    if(alert) this.cue(alert,.72,0,{incoming:.38,warned:.86,stall:.88,ground:.76}[alert]);
    const [ownLevel,ownPan]=cam.wCockpit>.5?[1,0]:this.position(body.pos,cam);
    this.emitter('self',synced?self:null,alive && synced && trigger && self?.gunning,.78*ownLevel,ownPan);
    for(const peer of room.peers.values()){
      if(!synced || !peer.hp){this.emitter(peer.id,null,false,0,0);continue;}
      const [level,pan]=this.position(peer.displayPos,cam);this.emitter(peer.id,peer,peer.gunning,level*.66,pan);
    }
    for(const id of this.counts.keys())if(id!=='self'&&!room.peers.has(id))this.emitter(id,null,false,0,0);
    this.previous={body,touch:body.touchdowns,gear:body.gearDown,damaged:body.damaged,hot:self?.hot};
  }
}
