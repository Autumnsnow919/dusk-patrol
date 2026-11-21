const scopeRing=Array.from({length:24},(_,i)=>[Math.cos(i*Math.PI/12),Math.sin(i*Math.PI/12)]);
class DuelScope {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.next=0;this.peerAxes={r:[0,0,0],u:[0,0,0],f:[0,0,0]};}
  draw(now,room,body,cam,waypoint){
    if(now<this.next)return;
    const navOnly=!room.combat && !room.peers.size;
    const interval=1000/(navOnly?15:60);
    this.next=now+interval-(now-this.next)%interval;
    const c=this.canvas,g=this.ctx,w=Math.min(960,innerWidth),h=Math.round(innerHeight*w/innerWidth);
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
    const seated=cam.wCockpit>.985,windowFloor=seated?Math.floor(h*Cockpit.windscreenHeight())-3:h;
    const docked=seated&&w<h,R=docked?27:40,rx=w-R-20,ry=docked?Math.min(h-100,windowFloor+R+12):90;
    if(navOnly&&this.navOnly&&this.radarY===ry)g.clearRect(rx-R-10,ry-R-10,2*R+20,2*R+48);else g.clearRect(0,0,w,h);
    this.navOnly=navOnly;
    this.radarY=ry;
    g.font='500 12px "IBM Plex Mono", monospace';g.lineWidth=1;
    const focal=h/(2*Math.tan(cam.fov/2)),gold='#ffd884',cream='#fff3dc',teal='#8ed8c0',red='#ff9364',ink='#1b1326';
    function project(p,allowBelowGlass=false){
      const x=p[0]-cam.pos[0],y=p[1]-cam.pos[1],z=p[2]-cam.pos[2];
      const dot=a=>x*a[0]+y*a[1]+z*a[2],depth=dot(cam.B.f);
      if(depth<1)return null;
      const py=Math.round(h/2-dot(cam.B.u)*focal/depth);
      if(seated && !allowBelowGlass && py>=windowFloor)return null;
      return [Math.round(w/2+dot(cam.B.r)*focal/depth),py];
    }
    function projectBeam(a,b){
      const depth=p=>(p[0]-cam.pos[0])*cam.B.f[0]+(p[1]-cam.pos[1])*cam.B.f[1]+(p[2]-cam.pos[2])*cam.B.f[2];
      const da=depth(a),db=depth(b),near=1.1;
      if(da<near && db<near)return null;
      if(da>=near && db>=near)return [project(a,true),project(b,true)];
      const t=(near-da)/(db-da),cut=a.map((v,i)=>v+(b[i]-v)*t);
      return [project(da<near?cut:a,true),project(db<near?cut:b,true)];
    }
    function path(points,close=false){
      if(!points || points.some(p=>!p))return;
      g.beginPath();g.moveTo(...points[0]);for(let i=1;i<points.length;i++)g.lineTo(...points[i]);
      if(close)g.closePath();g.stroke();
    }
    function circle(p,r){if(!p)return;g.beginPath();g.arc(p[0],p[1],r,0,2*Math.PI);g.stroke();}
    function label(txt,x,y,col){
      const tw=g.measureText(txt).width;
      x=Math.max(2,Math.min(w-tw-5,x));g.fillStyle=ink;g.fillRect(x-2,y-12,tw+5,15);
      g.fillStyle=col;g.fillText(txt,x,y);
    }
    const duel=room.combat,self=room.self,basis=Flight.axes(body.quat),target=room.peers.get(room.target);
    const range=duel?(Sight.reticle(room.weapon)?.reach||Sight.reach):4000;
    const showTarget=duel && target?.hp;
    const pos=showTarget?target.displayPos:null;
    const targetRange=pos?Math.hypot(pos[0]-body.pos[0],pos[1]-body.pos[1],pos[2]-body.pos[2]):Infinity;
    g.fillStyle='#18212df0';g.fillRect(rx-R-7,ry-R-7,2*R+14,2*R+(showTarget?39:23));
    g.strokeStyle='#537c79';circle([rx,ry],R);circle([rx,ry],R/2);
    path([[rx-R,ry],[rx+R,ry]]);path([[rx,ry-R],[rx,ry+R]]);
    g.fillStyle=teal;g.fillText('N',rx+3,ry-R+9);g.fillText((duel?'RAD ':'NAV ')+(range/1000)+' km',rx-R,ry+R+12);
    if(!duel){
      for(const field of Airfields.strips){
        const dx=field.x-body.pos[0],dz=field.z-body.pos[2];
        if(dx*dx+dz*dz<range*range){g.strokeStyle=teal;g.strokeRect(rx+dx*R/range-2,ry+dz*R/range-2,4,4);}
      }
      if(waypoint){
        const dx=waypoint.pos[0]-body.pos[0],dz=waypoint.pos[2]-body.pos[2],scale=(R-3)/Math.max(range,Math.hypot(dx,dz));
        const x=rx+dx*scale,y=ry+dz*scale;
        g.strokeStyle=gold;path([[x,y-4],[x+4,y],[x,y+4],[x-4,y]],true);
      }
    }
    if(showTarget){
      const level=pos[1]-body.pos[1];
      g.fillStyle=gold;g.fillText((level>50?'↑ ':level< -50?'↓ ':'')+(targetRange<1000?Math.round(targetRange)+' m':(targetRange/1000).toFixed(1)+' km'),rx-R,ry+R+27);
    }
    g.strokeStyle=cream;path([[rx,ry],[rx+basis.f[0]*9,ry+basis.f[2]*9]]);g.fillRect(rx-1,ry-1,3,3);
    const labelRows=[];
    for(const peer of room.peers.values()){
      if(peer.hp===0)continue;
      const p=peer.displayPos,dx=p[0]-body.pos[0],dz=p[2]-body.pos[2],horizontal=Math.hypot(dx,dz),scale=R/Math.max(range,horizontal*1.04);
      const x=Math.round(rx+dx*scale),y=Math.round(ry+dz*scale),selected=duel&&peer.id===room.target;
      const charge=room.marks.get(peer.id),col=selected?gold:room.hostile(peer)?red:teal;
      g.strokeStyle=g.fillStyle=col;
      const head=Flight.axes(peer.displayQuat,this.peerAxes).f;
      path([[x,y],[x+head[0]*6,y+head[2]*6]]);
      if(horizontal>range)circle([x,y],2);else g.fillRect(x-1,y-1,3,3);
      if(charge!==undefined){g.strokeStyle=charge===100?gold:cream;circle([x,y],6);}
      if(self?.star?.id===peer.id){g.fillStyle=gold;g.fillText('★',x-4,y-5);}
      if(selected)g.strokeRect(x-4,y-4,8,8);
      const screen=project(p);if(!screen)continue;
      const [px,py]=screen;if(px<0||py<0||px>w||py>h)continue;
      let ly=Math.max(15,py-12);
      for(const row of labelRows)if(Math.abs(row[0]-px)<95&&Math.abs(row[1]-ly)<14)ly=row[1]+15;
      if(seated)ly=Math.min(ly,windowFloor-4);
      const altitude=p[1]-body.pos[1],level=Math.abs(altitude)<50?'':altitude>0?' ↑':' ↓';
      const track=charge===undefined?'':charge===100?' LOCK':' '+charge+'%';
      labelRows.push([px,ly]);label((self?.star?.id===peer.id?'★ ':'')+peer.name+level+track+(selected?' · '+Math.round(Math.hypot(dx,altitude,dz))+' m':''),px+9,ly,col);
      if(selected){g.strokeStyle=gold;path([[px-10,py-4],[px-10,py+4],[px-5,py+4]]);path([[px+10,py+4],[px+10,py-4],[px+5,py-4]]);}
      if(selected && charge===100){
        g.strokeStyle=ink;g.lineWidth=3;circle(screen,5);
        g.strokeStyle=gold;g.lineWidth=1;circle(screen,5);
      }
    }
    if(!duel||!self)return;
    if(!seated){
      const reticle=Sight.reticle(room.weapon);
      const dist=target?Math.max(75,Math.min(reticle?.reach||Sight.reach,targetRange)):650;
      const axisPoint=body.pos.map((v,i)=>v+basis.f[i]*dist),aim=project(axisPoint);
      g.strokeStyle=cream;
      if(aim){path([[aim[0]-4,aim[1]],[aim[0]+4,aim[1]]]);path([[aim[0],aim[1]-4],[aim[0],aim[1]+4]]);}
      if(reticle){
        const dots=[];
        for(const [co,si] of scopeRing){
          dots.push(project(axisPoint.map((v,d)=>v+reticle.ring*dist*(co*basis.r[d]+si*basis.u[d]))));
        }
        g.lineWidth=3;g.strokeStyle='#292335';path(dots,true);
        const charge=(room.weapon==='laser'||room.weapon==='arc')?Math.floor(100*self.lock):room.marks.get(room.target)||0;
        const aligned=room.weapon==='arc' && pos && Sight.inRing(body,pos,reticle.ring,reticle.reach);
        g.lineWidth=1;g.strokeStyle=charge===100?gold:charge||aligned?teal:cream;path(dots,true);
        const bottom=dots[18];
        if(charge && bottom)label(charge===100?'LOCK':charge+'%',bottom[0]-15,bottom[1]+16,g.strokeStyle);
      }
    }
    if(room.weapon==='gun' && target?.hp && target.vel && targetRange<=620){
      const pip=project(Sight.badge(target.displayPos,target.vel,body)),p=project(target.displayPos);
      if(pip&&p){
        const [x,y]=pip;
        g.strokeStyle='#9fbd9e';path([p,pip]);g.strokeStyle=ink;g.lineWidth=3;
        path([[x,y-5],[x+5,y],[x,y+5],[x-5,y]],true);g.lineWidth=1;g.strokeStyle=gold;
        path([[x,y-5],[x+5,y],[x,y+5],[x-5,y]],true);
      }
    }
    const bearing=(point,origin=body.pos)=>{
      const dx=point[0]-origin[0],dy=point[1]-origin[1],dz=point[2]-origin[2];
      const dot=axis=>dx*axis[0]+dy*axis[1]+dz*axis[2];
      return Math.atan2(dot(basis.r),dot(basis.f));
    };
    const bearingName=angle=>['前','右前','右','右后','后','左后','左','左前'][(Math.round(angle*4/Math.PI)+8)%8];
    const noticeY=Math.min(h*.36,windowFloor*.64),cx=w/2;
    function centered(text,y,color){label(text,cx-g.measureText(text).width/2,Math.min(y,windowFloor-4),color);}
    const arcSource=self.arcThreat && room.peers.get(self.arcThreat);
    if(arcSource)centered('跳光链蓄力 · '+bearingName(bearing(arcSource.displayPos))+'方 · 脱离对手机头圈',noticeY,gold);
    const hurt=room.hurt,strike=room.strike;
    if(hurt && now-hurt.born<1150){
      const angle=bearing(hurt.source??hurt.a,hurt.b),r=24,cy=noticeY+27;
      g.strokeStyle=red;g.lineWidth=4;
      g.beginPath();g.arc(cx,cy,r,angle-Math.PI/2-.45,angle-Math.PI/2+.45);g.stroke();g.lineWidth=1;
      centered(bearingName(angle)+'方中弹 · '+Outfit.items.find(item=>item.id===hurt.weapon).name+' · '+Airfields.labels[hurt.part]+' −'+Math.ceil(hurt.loss),cy+40,red);
    }
    if(strike && now-strike.born<750){
      const point=project(strike.b);
      if(point){
        g.strokeStyle=cream;g.lineWidth=2;
        for(const x of [-1,1])for(const y of [-1,1])path([[point[0]+x*9,point[1]+y*9],[point[0]+x*4,point[1]+y*4]]);
        g.lineWidth=1;
      }
      centered('命中 '+(room.peers.get(strike.to)?.name||'目标')+' · '+Airfields.labels[strike.part]+' −'+Math.ceil(strike.loss),noticeY+85,teal);
    }
    for(const shot of room.shots.values()){
      const point=project(shot.shown);
      if(!point)continue;
      const [x,y]=point;
      if(x<0||x>w||y<0||y>windowFloor)continue;
      g.strokeStyle=shot.diverted?teal:shot.threat?red:gold;g.lineWidth=2;
      const tail=project(shot.shown.map((v,i)=>v-shot.front[i]*24));
      path([tail,point]);path([[x,y-4],[x+4,y],[x,y+4],[x-4,y]],true);g.lineWidth=1;
    }
    if(self.incoming||self.warned){
      let txt=self.incoming?room.flareReadout(true):room.lockReadout();
      if(!self.incoming && self.laserThreat){
        const painter=room.peers.get(self.laserThreat);
        if(painter)txt=bearingName(bearing(painter.displayPos))+'方激光照射 · 脱离光圈';
      }
      if(self.incoming){
        let nearest=null,best=Infinity;
        for(const shot of room.shots.values())if(shot.threat){
          const d=Math.hypot(...shot.shown.map((v,i)=>v-body.pos[i]));
          if(d<best){best=d;nearest=shot;}
        }
        if(nearest)txt=bearingName(bearing(nearest.shown))+'方 · '+txt;
      }
      label(txt,seated?w-108:w/2-g.measureText(txt).width/2,seated?ry+R+45:h*.21,self.incoming?red:gold);
    }
    if(!room.events.length)return;
    let areaWarning=null;
    if(seated){g.save();g.beginPath();g.rect(0,0,w,windowFloor);g.clip();}
    for(const event of room.events){
      const age=(now-event.born)/1000,from=project(event.a),to=project(event.b);
      g.strokeStyle=event.kind==='laser'?teal:gold;
      if(event.kind==='arcBreak' && age<.65 && !arcSource && !self.lock && (event.to===room.id||event.from===room.id))
        centered(event.to===room.id?'已脱离跳光链':'跳光链中断',noticeY,teal);
      if(event.kind==='arcWindup' && age<Sight.arc.fill &&
        ((self.arcThreat===event.from && event.to===room.id)||(event.from===room.id && self.weapon==='arc' && self.lock>0))){
        const beam=projectBeam(room.peers.get(event.from)?.displayPos??body.pos,room.peers.get(event.to)?.displayPos??body.pos);
        g.strokeStyle=gold;g.setLineDash([4,5]);path(beam);g.setLineDash([]);
      }
      if(event.kind==='echo' && age<1){
        g.strokeStyle='#d5a2ff';
        const edge=project(event.a.map((v,i)=>v+155*cam.B.r[i]));
        if(from && edge)circle(from,Math.max(3,Math.abs(edge[0]-from[0])));
        circle(from,4+10*(1-age));
        if(room.hostile({id:event.from}) && event.from!==room.id && Math.hypot(...body.pos.map((v,i)=>v-event.a[i]))<155)
          areaWarning='回声浮标 · 飞出紫圈';
      }
      if(event.kind==='chime' && age<.5){g.strokeStyle='#e5c8ff';circle(from,8+96*age);}
      if((event.kind==='arc'||event.kind==='arcHop') && age<.32){
        const ends=projectBeam(event.a,event.b);if(!ends)continue;
        const [start,end]=ends;
        g.strokeStyle=event.kind==='arc'?'#abfff0':'#f9df93';
        const mx=(start[0]+end[0])/2,my=(start[1]+end[1])/2;
        const bolt=[start,[mx+6,my-7],[mx-4,my+5],end];
        g.lineWidth=5;path(bolt);g.lineWidth=1;g.strokeStyle='#fff7df';path(bolt);circle(to,5+age*35);
      }
      if(event.kind==='glyph' && age<1.2){
        g.strokeStyle='#f5aedc';
        const edge=project(event.b.map((v,i)=>v+115*cam.B.r[i]));
        if(to && edge){g.lineWidth=2;circle(to,Math.max(3,Math.abs(edge[0]-to[0])));g.lineWidth=1;circle(to,5);}
        if(room.id===event.to && Math.hypot(...body.pos.map((v,i)=>v-event.b[i]))<=115)areaWarning='染光印 · 飞出粉圈';
      }
      if(event.kind==='bloom' && age<.55){g.strokeStyle='#fed3ec';circle(to,5+age*74);}
      if((event.kind==='prism'||event.kind==='refract')&&age<.65){
        g.strokeStyle=teal;circle(to,14+18*age);circle(to,18+24*age);
      }
      if(event.kind==='pulse' && from && age<.5){
        const edge=project(event.a.map((v,i)=>v+290*cam.B.r[i]));
        if(edge){
          const radius=Math.max(3,Math.abs(edge[0]-from[0])*Math.min(1,age/.32));
          g.lineWidth=3;circle(from,radius);g.lineWidth=1;circle(from,radius*.92);
        }
      }
      if(event.kind==='burst'&&age<.6)circle(to,5+age*25);
      if(event.kind==='laser'&&age<.26){
        const beam=projectBeam(event.a,event.b);
        g.strokeStyle=teal;g.lineWidth=5;path(beam);g.strokeStyle=cream;g.lineWidth=1;path(beam);circle(to,4+50*age);
      }
    }
    if(seated)g.restore();
    if(areaWarning)centered(areaWarning,noticeY-18,'#f5aedc');
  }
}

class OrbitRig {
  constructor(){this.reset(0);}
  reset(heading){
    this.azimuth=heading+Math.PI*.5;this.elevation=.18;this.range=70;this.anchor=null;this.zoom=1;
  }
  input(dt,horizontal,vertical,zoom){
    if(this.anchor){this.zoom=Math.max(.45,Math.min(2.6,this.zoom*Math.exp(zoom*dt)));return;}
    this.azimuth+=horizontal*dt*1.6;
    this.elevation=Math.max(-1.32,Math.min(1.32,this.elevation+vertical*dt*1.15));
    this.range=Math.max(34,Math.min(240,this.range*Math.exp(-zoom*dt)));
  }
  toggleAnchor(position,subject){
    if(!this.anchor){this.anchor=position.slice();this.zoom=1;return;}
    const dx=this.anchor[0]-subject[0],dy=this.anchor[1]-subject[1],dz=this.anchor[2]-subject[2];
    this.azimuth=Math.atan2(dx,-dz);
    this.elevation=Math.max(-1.32,Math.min(1.32,Math.atan2(dy,Math.hypot(dx,dz))));
    this.range=Math.max(34,Math.min(240,Math.hypot(dx,dy,dz)));this.anchor=null;this.zoom=1;
  }
  shift(dx,dz){if(this.anchor){this.anchor[0]+=dx;this.anchor[2]+=dz;}}
  sample(subject,groundAt){
    const horizontal=this.range*Math.cos(this.elevation);
    const pos=this.anchor?this.anchor.slice():[subject[0]+horizontal*Math.sin(this.azimuth),
      subject[1]+this.range*Math.sin(this.elevation),subject[2]-horizontal*Math.cos(this.azimuth)];
    pos[1]=Math.max(pos[1],Math.max(0,groundAt(pos[0],pos[2]))+4);
    const dx=subject[0]-pos[0],dy=subject[1]-pos[1],dz=subject[2]-pos[2],dist=Math.hypot(dx,dy,dz);
    const front=dist>.01?[dx/dist,dy/dist,dz/dist]:[0,0,-1];
    const flat=Math.hypot(front[0],front[2]),right=flat>.0001?[-front[2]/flat,0,front[0]/flat]:[1,0,0];
    const up=[-right[2]*front[1],right[2]*front[0]-right[0]*front[2],right[0]*front[1]];
    return {pos,B:{f:front,r:right,u:up},fov:.83/this.zoom};
  }
}
if(typeof module!=='undefined')module.exports=OrbitRig;
