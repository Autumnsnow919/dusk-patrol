class DuelScope {
  constructor(canvas){this.canvas=canvas;this.ctx=canvas.getContext('2d');this.next=0;this.peerAxes={r:[0,0,0],u:[0,0,0],f:[0,0,0]};}
  draw(now,room,body,cam){
    if(now<this.next)return;
    this.next=now+1000/90;
    const c=this.canvas,g=this.ctx,w=Math.min(960,innerWidth),h=Math.round(innerHeight*w/innerWidth);
    if(c.width!==w||c.height!==h){c.width=w;c.height=h;}
    g.clearRect(0,0,w,h);g.font='500 12px "IBM Plex Mono", monospace';g.lineWidth=1;
    const focal=h/(2*Math.tan(cam.fov/2)),gold='#ffd884',cream='#fff3dc',teal='#8ed8c0',red='#ff9364',ink='#1b1326';
    function project(p){
      const x=p[0]-cam.pos[0],y=p[1]-cam.pos[1],z=p[2]-cam.pos[2];
      const dot=a=>x*a[0]+y*a[1]+z*a[2],depth=dot(cam.B.f);
      if(depth<1)return null;
      return [Math.round(w/2+dot(cam.B.r)*focal/depth),Math.round(h/2-dot(cam.B.u)*focal/depth)];
    }
    function path(points,close=false){
      if(points.some(p=>!p))return;
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
    const rx=w-60,ry=90,R=40;
    g.fillStyle='#18212df0';g.fillRect(rx-R-7,ry-R-7,2*R+14,2*R+23);
    g.strokeStyle='#537c79';circle([rx,ry],R);circle([rx,ry],R/2);
    path([[rx-R,ry],[rx+R,ry]]);path([[rx,ry-R],[rx,ry+R]]);
    g.fillStyle=teal;g.fillText('N',rx+3,ry-R+9);g.fillText(room.weapon==='ribbon'?'3.6 km':'1.8 km',rx-R,ry+R+12);
    g.strokeStyle=cream;path([[rx,ry],[rx+basis.f[0]*9,ry+basis.f[2]*9]]);g.fillRect(rx-1,ry-1,3,3);
    const labelRows=[];
    for(const peer of room.peers.values()){
      if(peer.hp===0)continue;
      const p=peer.displayPos,dx=p[0]-body.pos[0],dz=p[2]-body.pos[2],scale=R/Math.max(room.weapon==='ribbon'?3600:1800,Math.hypot(dx,dz)*1.04);
      const x=Math.round(rx+dx*scale),y=Math.round(ry+dz*scale),selected=duel&&peer.id===room.target;
      const col=selected?gold:room.mode==='pve'&&room.hostile(peer)?red:teal;
      g.strokeStyle=g.fillStyle=col;
      const head=Flight.axes(peer.displayQuat,this.peerAxes).f;
      path([[x,y],[x+head[0]*6,y+head[2]*6]]);g.fillRect(x-1,y-1,3,3);
      if(self?.star?.id===peer.id){g.fillStyle=gold;g.fillText('★',x-4,y-5);}
      if(selected)g.strokeRect(x-4,y-4,8,8);
      const screen=project(p);if(!screen)continue;
      const [px,py]=screen;if(px<0||py<0||px>w||py>h)continue;
      let ly=Math.max(15,py-12);
      for(const row of labelRows)if(Math.abs(row[0]-px)<95&&Math.abs(row[1]-ly)<14)ly=row[1]+15;
      labelRows.push([px,ly]);label((self?.star?.id===peer.id?'★ ':'')+peer.name+(selected?' · '+Math.round(Math.hypot(dx,p[1]-body.pos[1],dz))+' m':''),px+9,ly,col);
      if(selected){g.strokeStyle=gold;path([[px-10,py-4],[px-10,py+4],[px-5,py+4]]);path([[px+10,py+4],[px+10,py-4],[px+5,py-4]]);}
    }
    if(!duel||!self)return;
    const missile=Sight.profiles[room.weapon];
    const dist=target?Math.max(75,Math.min(missile?.reach||Sight.reach,Math.hypot(...target.displayPos.map((v,i)=>v-body.pos[i])))):650;
    const axisPoint=body.pos.map((v,i)=>v+basis.f[i]*dist),aim=project(axisPoint);
    g.strokeStyle=cream;
    if(aim){path([[aim[0]-4,aim[1]],[aim[0]+4,aim[1]]]);path([[aim[0],aim[1]-4],[aim[0],aim[1]+4]]);}
    if(missile){
      const dots=[];
      for(let i=0;i<24;i++){
        const t=Math.PI*i/12;
        dots.push(project(axisPoint.map((v,d)=>v+missile.ring*dist*(Math.cos(t)*basis.r[d]+Math.sin(t)*basis.u[d]))));
      }
      g.lineWidth=3;g.strokeStyle='#292335';path(dots,true);
      g.lineWidth=1;g.strokeStyle=self.acquire===100?gold:self.acquire?teal:cream;path(dots,true);
      const bottom=dots[18];
      if(self.acquire && bottom)label(self.acquire===100?'LOCK':self.acquire+'%',bottom[0]-15,bottom[1]+16,g.strokeStyle);
    }
    if(room.weapon==='gun' && target?.hp && target.vel && dist<=620){
      const pip=project(Sight.badge(target.displayPos,target.vel,body)),p=project(target.displayPos);
      if(pip&&p){
        const [x,y]=pip;
        g.strokeStyle='#9fbd9e';path([p,pip]);g.strokeStyle=ink;g.lineWidth=3;
        path([[x,y-5],[x+5,y],[x,y+5],[x-5,y]],true);g.lineWidth=1;g.strokeStyle=gold;
        path([[x,y-5],[x+5,y],[x,y+5],[x-5,y]],true);
      }
    }
    if(self.incoming||self.warned){
      const txt=self.incoming?'来袭  ·  X 热诱弹':'锁定预警';
      label(txt,w/2-g.measureText(txt).width/2,h*.21,self.incoming?red:gold);
    }
    for(const event of room.events){
      const age=(now-event.born)/1000,from=project(event.a),to=project(event.b);
      g.strokeStyle=event.kind==='laser'?teal:gold;
      if(event.kind==='echo' && age<1){
        g.strokeStyle='#d5a2ff';
        const edge=project(event.a.map((v,i)=>v+155*cam.B.r[i]));
        if(from && edge)circle(from,Math.max(3,Math.abs(edge[0]-from[0])));
        circle(from,4+10*(1-age));
      }
      if(event.kind==='chime' && age<.5){g.strokeStyle='#e5c8ff';circle(from,8+96*age);}
      if((event.kind==='arc'||event.kind==='arcHop') && age<.32 && from && to){
        g.strokeStyle=event.kind==='arc'?'#abfff0':'#f9df93';
        const mx=(from[0]+to[0])/2,my=(from[1]+to[1])/2;
        path([from,[mx+3,my-5],[mx-2,my+4],to]);circle(to,4+age*25);
      }
      if(event.kind==='glyph' && age<1.2){
        g.strokeStyle='#f5aedc';circle(to,8+25*(1-age/1.2));
        if(room.id===event.to)label('染光印 · 飞离印记',w*.5-55,h*.26,g.strokeStyle);
      }
      if(event.kind==='bloom' && age<.55){g.strokeStyle='#fed3ec';circle(to,5+age*74);}
      if((event.kind==='prism'||event.kind==='refract')&&age<.65){
        g.strokeStyle=teal;circle(to,14+18*age);circle(to,18+24*age);
      }
      if(event.kind==='pulse'&&age<.5)circle(from,8+age*75);
      if(event.kind==='burst'&&age<.6)circle(to,5+age*25);
      if(event.kind==='laser'&&age<.15)path([from,to]);
    }
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
