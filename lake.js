// Metres in the same east / up / south frame as Flight. Geometry and contact
// tests share the boxes, including the open space below decks and inside hoops.
const Lake = (() => {
  const fields=typeof module==="undefined"?Airfields:require("./airfields.js");
  const sites = [
    {id:'bridge', name:'赤霞悬索桥', pos:[530,77,-90], note:'从北向南穿过主跨，开始计时', color:'#ffa777'},
    {id:'slalom', name:'云梯双环', pos:[615,225,340], note:'沿琥珀环爬升，穿过青色终点环', color:'#ffd77c'},
    {id:'relay', name:'日晷中继站', pos:[1040,850,1400], note:'围绕中央信标盘旋', color:'#eeb4ff'},
    {id:'harbor', name:'白帆灯港', pos:[2240,360,2130], note:'观光房两架飞机在灯港空域会合 5 秒', color:'#8ce3da'},
    {id:'observatory', name:'西岭天文台', pos:[-880,590,1270], note:'从双穹顶上方通场', color:'#afc5ff'},
    ...fields.strips.map(f=>({...f,pos:[f.x,f.y,f.z],note:'南北向跑道 · 长 '+f.length+' m · 场高 '+f.y+' m'})),
    {id:'thermal',name:'西岭浮灯',pos:[-1450,540,610],note:'绕气球盘旋，寻找最强上升气流',color:'#ffc888'},
    {id:'spirecoast',name:'晨光岬灯列',pos:[11900,620,5200],note:'沿五座交错灯塔向南高速通场',color:'#ffbe81'},
    {id:'northarc',name:'北境拱门',pos:[-7000,490,-9000],note:'从巨拱中部穿越北方山口',color:'#c0e7e0'},
    {id:'windpass',name:'南岬风廊',pos:[-6000,510,12000],note:'沿蓝白翼标依次通过三道宽门',color:'#aabfff'},
    {id:'viaduct',name:'琥珀高架廊',pos:[23600,320,4100],note:'沿高架桥下方穿过连续门跨',color:'#ffb782'},
    {id:'shell',name:'月壳海湾',pos:[-22400,490,7000],note:'沿白色壳肋的中轴穿过海湾',color:'#cce6da'},
    {id:'needles',name:'蓝针石林',pos:[3200,520,-25600],note:'在交错岩柱之间沿山谷蛇行',color:'#abc8fb'},
    {id:'lanterns',name:'浮灯天阶',pos:[-7000,710,25900],note:'逐级抬高航线，穿过三座悬空灯门',color:'#ffe08a'}
  ];
  const frontier=sites.slice(12);
  const gates = [
    {x:530,y:60,z:-90,w:248,h:50},
    {x:615,y:225,z:340,w:104,h:104},
    {x:780,y:320,z:820,w:88,h:88}
  ];
  const colors={iron:[.29,.32,.39], red:[.71,.36,.28], cream:[.94,.83,.65], gold:[1,.76,.32],
    teal:[.31,.63,.59], slate:[.38,.44,.56], wine:[.46,.24,.38], violet:[.62,.54,.73]};
  const groups=sites.map(()=>({parts:[],min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]}));
  let group=groups[0];
  const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
  const unit=a=>{const n=Math.hypot(...a);return a.map(v=>v/n);};
  function beam(a,b,width,depth,tint) {
    const delta=b.map((v,i)=>v-a[i]), length=Math.hypot(...delta);
    const along=unit(delta), side=unit(cross(Math.abs(along[1])>.99?[0,0,1]:[0,1,0],along));
    const axes=[side,cross(along,side),along],half=[width/2,depth/2,length/2];
    const mid=a.map((v,i)=>(v+b[i])/2);
    group.parts.push({mid,axes,half,tint:colors[tint]});
    for(let d=0;d<3;d++){
      const radius=axes.reduce((sum,axis,i)=>sum+Math.abs(axis[d])*half[i],0);
      group.min[d]=Math.min(group.min[d],mid[d]-radius);
      group.max[d]=Math.max(group.max[d],mid[d]+radius);
    }
  }
  // Deck, tapering approaches, vermilion portal towers and suspension cables.
  const [bx,,bz]=sites[0].pos, deck=121;
  function bridgeBeam(x,y,z,X,Y,Z,w,h,col){beam([bx+x,y,bz+z],[bx+X,Y,bz+Z],w,h,col);}
  bridgeBeam(-585,deck,0,585,deck,0,39,13,'iron');
  for(const sign of [-1,1]){
    bridgeBeam(sign*585,deck,0,sign*820,55,0,39,13,'slate');
    for(const x of [sign*275,sign*570]){
      bridgeBeam(x,-65,0,x,115,0,35,52,'slate');
    }
    for(const z of [-18,18]){
      const x=sign*275;
      bridgeBeam(x,109,z,x,292,z,14,15,'red');
      bridgeBeam(x,288,z,sign*595,deck+9,z,6,6,'cream');
    }
    bridgeBeam(sign*275,272,-23,sign*275,272,23,14,14,'red');
  }
  for(const z of [-18,18]){
    let last=[-275,288,z];
    for(let x=-220;x<=275;x+=55){
      const y=155+133*(x/275)**2;
      bridgeBeam(...last,x,y,z,6,6,'cream');
      bridgeBeam(x,deck+6,z,x,y,z,4,4,'red');last=[x,y,z];
    }
    bridgeBeam(-580,deck+6,z,580,deck+6,z,4,5,'red');
  }
  function hoop(gate,color){
    const segments=24;
    for(let i=0;i<segments;i++){
      const point=n=>[gate.x+gate.w*Math.cos(n*2*Math.PI/segments),gate.y+gate.h*Math.sin(n*2*Math.PI/segments),gate.z];
      beam(point(i),point(i+1),11,10,i%6===0?'cream':color);
    }
  }
  group=groups[1];hoop(gates[1],'gold');hoop(gates[2],'teal');
  function mast(x,z,bottom,top,size,color){beam([x,bottom,z],[x,top,z],size,size,color);}
  group=groups[2];
  mast(1040,1400,-60,445,42,'wine');mast(1040,1400,445,588,22,'cream');
  for(let i=0;i<12;i++){
    const point=n=>[1040+140*Math.cos(n*Math.PI/6),460,1400+140*Math.sin(n*Math.PI/6)];
    beam(point(i),point(i+1),19,12,'violet');
    if(i%3===0)beam([1040,365,1400],point(i),14,18,'wine');
  }
  group=groups[3];
  for(const [dx,dz,h] of [[-210,-35,195],[210,-35,195],[0,165,116]]){
    const x=2240+dx,z=2130+dz;
    mast(x,z,-70,h,42,'cream');mast(x,z,h-45,h-21,46,'teal');mast(x,z,h,h+20,52,'gold');
    beam([x-65,25,z],[x+65,25,z],88,16,'slate');
    beam([x,28,z],[x+74,104,z],9,14,'teal');beam([x+74,104,z],[x,158,z],9,14,'teal');
  }
  group=groups[4];
  for(const [dx,dz,r] of [[-88,0,67],[111,45,49]]){
    const x=-880+dx,z=1270+dz,y=295;
    mast(x,z,0,y,r*1.6,'slate');
    for(let i=0;i<12;i++){
      const t=i*Math.PI/6,point=(radius,h)=>[x+radius*Math.cos(t),h,z+radius*Math.sin(t)];
      beam(point(r,y),point(r*.70,y+r*.70),r*.53,14,'cream');
      beam(point(r*.70,y+r*.70),point(5,y+r),r*.40,12,'cream');
    }
  }
  // Deck paint is excluded from obstacle tests. The wheel solver handles the deck itself.
  for(const [index,f] of fields.strips.entries()){
    group=groups[5+index];
    const {x,y,z,width,length}=f,start=z-length/2,end=z+length/2;
    const surface=(dx,za,zb,w,h,t,dy=0)=>beam([x+dx,y+dy,za],[x+dx,y+dy,zb],w,h,t);
    surface(0,start,end,width,4,'iron',-2);
    for(let at=start+32;at<end-24;at+=85)surface(0,at,at+32,2.4,.12,'cream',.12);
    for(const side of [-1,1]){
      surface(side*(width/2-2),start+4,end-4,1.1,.12,'cream',.13);
      for(let at=start+12;at<end-4;at+=96)surface(side*(width/2-1),at,at+3,2,.55,index===1?'gold':'teal',.3);
      for(let i=1;i<=4;i++)for(const t of [start+13,end-33])surface(side*i*width/12,t,t+20,2,.15,'cream',.13);
    }
    group.decor=group.parts.length;
    // Towers, windsock poles and raised supports along the shore.
    mast(x+width/2+22,z-140,y-100,y+36,13,'slate');
    mast(x+width/2+22,z-140,y+36,y+43,20,'teal');
    mast(x-width/2-12,start+100,y-60,y+13,2,'cream');
    beam([x-width/2-12,y+13,start+100],[x-width/2-23,y+10,start+101],3,3,'red');
    for(let at=start+20;at<end;at+=190)mast(x,at,-80,y-6,width*.63,'slate');
  }
  group=groups[8];
  for(const [x,z,h,t] of [[-1620,580,485,'gold'],[-1285,640,520,'red']]){
    mast(x,z,75,h-34,1.8,'cream');mast(x,z,h-36,h-30,8,'wine');
    mast(x,z,h-30,h-18,3,'cream');mast(x,z,h-18,h-4,22,t);
    mast(x,z,h-4,h+12,32,'cream');mast(x,z,h+12,h+23,24,t);
  }
  group=groups[9];
  for(let i=-2;i<=2;i++){
    const x=11900+(i%2===0?-185:185),z=5200+i*470,top=385+32*(i+2);
    mast(x,z,-88,top,38,'slate');mast(x,z,top-45,top-25,42,'red');
    mast(x,z,top,top+15,55,'cream');mast(x,z,top+15,top+28,32,'gold');
  }
  group=groups[10];
  for(const side of [-1,1]){
    const x=-7000+side*260; mast(x,-9000,-80,412,72,'wine');
    beam([x,412,-9000],[-7000+side*165,590,-9000],65,64,'slate');
    beam([-7000+side*165,590,-9000],[-7000,628,-9000],65,52,'cream');
  }
  group=groups[11];
  for(let i=-1;i<=1;i++)for(const side of [-1,1]){
    const x=-6000+i*95+side*160,z=12000+i*610;
    mast(x,z,-88,480,25,'slate');mast(x,z,480,530,27,'teal');
    beam([x,530,z],[x-side*57,552,z],18,13,'cream');
  }
  group=groups[12];
  for(let k=-3;k<=3;k++){
    const z=4100+k*260;
    for(const side of [-1,1]){
      const x=23600+side*130;
      mast(x,z,-95,375,24,'wine');
      beam([x,360,z],[23600+side*65,417,z],19,18,'gold');
    }
    beam([23445,421,z],[23755,421,z],42,14,'slate');
    if(k<3)beam([23600,434,z],[23600,434,z+260],290,11,'cream');
  }
  group=groups[13];
  for(let k=-2;k<=2;k++)for(const side of [-1,1]){
    const z=7000+k*210,x=-22400,top=650-22*Math.abs(k);
    mast(x+side*255,z,-92,400,28,'teal');
    beam([x+side*255,399,z],[x+side*160,top-45,z+35],24,24,'cream');
    beam([x+side*160,top-45,z+35],[x,top,z+80],19,18,'cream');
  }
  group=groups[14];
  for(let k=0;k<11;k++){
    const z=-26600+k*200,side=k%2?1:-1,x=3200+side*(150+60*Math.sin(k)),top=480+90*Math.sin(k*2);
    mast(x,z,-90,top*.65,82,'slate');
    beam([x,top*.65,z],[x-side*22,top,z+12],42,46,'teal');
    beam([x-side*22,top,z+12],[x-side*37,top+48,z+17],16,19,'cream');
  }
  group=groups[15];
  for(let k=-1;k<=1;k++){
    const x=-7000+120*k,y=710+85*k,z=25900+420*k;
    hoop({x,y,z,w:106,h:90},k?'gold':'violet');
    for(const side of [-1,1])mast(x+side*106,z,200,y-10,5,'slate');
  }
  const arenaRadius=32000,arenaCeiling=7200;
  const buckets=new Map(),empty=[];
  const bucketKey=(x,z)=>x+z*65536;
  for(const group of groups){
    for(let z=Math.floor((group.min[2]-48)/512);z<=Math.floor((group.max[2]+48)/512);z++){
      for(let x=Math.floor((group.min[0]-48)/512);x<=Math.floor((group.max[0]+48)/512);x++){
        const key=bucketKey(x,z);
        if(!buckets.has(key))buckets.set(key,[]);
        buckets.get(key).push(group);
      }
    }
  }
  function candidates(x,z,margin){
    return margin>48?groups:buckets.get(bucketKey(Math.floor(x/512),Math.floor(z/512)))||empty;
  }
  function touches(pos,margin=4,contact=null) {
    const [x,y,z]=pos;
    for(const g of candidates(x,z,margin)){
      if(x<g.min[0]-margin||x>g.max[0]+margin||y<g.min[1]-margin||y>g.max[1]+margin||z<g.min[2]-margin||z>g.max[2]+margin)continue;
      for(let j=g.decor||0;j<g.parts.length;j++){
        const part=g.parts[j];
        const dx=x-part.mid[0],dy=y-part.mid[1],dz=z-part.mid[2];
        let depth=Infinity,normal=null,sign=1;
        for(let i=0;i<3;i++){
          const axis=part.axes[i],projection=dx*axis[0]+dy*axis[1]+dz*axis[2];
          const span=part.half[i]+margin-Math.abs(projection);
          if(span<0){depth=-1;break;}
          if(span<depth){depth=span;normal=axis;sign=Math.sign(projection)||1;}
        }
        if(depth>=0){if(contact){contact.depth=depth;contact.normal=normal.map(v=>v*sign);}return true;}
      }
    }
    return false;
  }
  function collide(b){
    const [x,y,z]=b.pos,radius=Math.max(16,b.span+1);
    if(!candidates(x,z,radius).some(g=>x>=g.min[0]-radius&&x<=g.max[0]+radius&&y>=g.min[1]-radius&&y<=g.max[1]+radius&&z>=g.min[2]-radius&&z<=g.max[2]+radius))return false;
    const {r,f}=b.basis;
    for(const [part,side,long] of [['fuselage',0,0],['leftWing',-b.span,0],['rightWing',b.span,0],['tail',0,-9]]){
      const p=[x+side*r[0]+long*f[0],y+side*r[1]+long*f[1],z+side*r[2]+long*f[2]],hit={};
      if(!touches(p,part==='fuselage'?1.2:.45,hit))continue;
      const n=hit.normal,closing=Math.max(0,-(b.vel[0]*n[0]+b.vel[1]*n[1]+b.vel[2]*n[2]));
      if(part==='fuselage' && hit.depth>5){b.crashed=true;return true;}
      fields.scrape(b,part,closing);
      for(let i=0;i<3;i++){b.pos[i]+=n[i]*(hit.depth+.08);b.vel[i]+=n[i]*closing*1.03;}
      return b.crashed;
    }
    return false;
  }
  const batches=groups.map(g=>{
    const center=g.min.map((v,i)=>(v+g.max[i])*.5);
    return {center,roof:g.max[1],min:g.min,max:g.max,radius:Math.hypot(...center.map((v,i)=>v-g.min[i])),count:g.parts.length*36};
  });
  function vertices(){
    const out=[];
    for(const g of groups)for(const {mid,axes,half,tint} of g.parts){
      for(let axis=0;axis<3;axis++)for(const sign of [-1,1]){
        const u=(axis+1)%3,v=(axis+2)%3,normal=axes[axis].map(value=>value*sign);
        for(const [a,b] of [[-1,-1],[1,-1],[1,1],[-1,-1],[1,1],[-1,1]]){
          for(let d=0;d<3;d++)out.push(mid[d]+normal[d]*half[axis]+a*axes[u][d]*half[u]+b*axes[v][d]*half[v]);
          out.push(...normal,...tint,-1);
        }
      }
    }
    return new Float32Array(out);
  }
  function crosses(g,a,b){
    if(a[2]>=g.z||b[2]<g.z)return false;
    const t=(g.z-a[2])/(b[2]-a[2]),x=(a[0]+(b[0]-a[0])*t-g.x)/g.w,y=(a[1]+(b[1]-a[1])*t-g.y)/g.h;
    return g===gates[0]?Math.abs(x)<1&&Math.abs(y)<1:x*x+y*y<.85;
  }
  function inZone(pos,site){
    return Math.abs(pos[1]-site.pos[1])<=175 && (pos[0]-site.pos[0])**2+(pos[2]-site.pos[2])**2<=320**2;
  }
  const sceneryTop=Math.max(...groups.map(g=>g.max[1]));
  return {sites,frontier,gates,batches,sceneryTop,arenaRadius,arenaCeiling,collide,touches,vertices,crosses,inZone,relayOrder:[2,4,1],relayDuration:45};
})();
if(typeof module!=='undefined')module.exports=Lake;
