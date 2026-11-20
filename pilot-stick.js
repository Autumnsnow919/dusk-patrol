// Integrate key holds between physics frames and between room packets independently.
class PilotStick {
  constructor(){this.reset(0);}
  reset(now){
    this.last=now;this.axes=[0,0,0,0];
    this.local={area:[0,0,0,0],ms:0};this.wire={area:[0,0,0,0],ms:0};
  }
  advance(now){
    const dt=now-this.last;
    if(dt<=0)return;
    this.last=now;this.local.ms+=dt;this.wire.ms+=dt;
    for(let i=0;i<4;i++){
      const area=this.axes[i]*dt;this.local.area[i]+=area;this.wire.area[i]+=area;
    }
  }
  change(keys,now){
    this.advance(now);
    const fine=keys.has('ShiftLeft')||keys.has('ShiftRight');
    const scale=fine ? .35 : 1;
    this.axes[0]=scale*(keys.has('KeyS')-keys.has('KeyW'));
    this.axes[1]=scale*(keys.has('KeyD')-keys.has('KeyA'));
    this.axes[2]=scale*(keys.has('KeyE')-keys.has('KeyQ'));
    this.axes[3]=scale*(keys.has('KeyR')-keys.has('KeyF'));
  }
  sample(channel,now){
    this.advance(now);
    const bucket=this[channel];
    const read=i=>bucket.ms?Math.round(1000*bucket.area[i]/bucket.ms)/1000:this.axes[i];
    const command={pitch:read(0),roll:read(1),yaw:read(2),throttle:read(3),keyboard:true};
    bucket.ms=0;bucket.area.fill(0);
    return command;
  }
}
if(typeof module!=='undefined')module.exports=PilotStick;
