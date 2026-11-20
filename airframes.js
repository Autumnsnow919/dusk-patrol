// Rig slots are shared by the WebGL model, shadow pass and CPU mesh posing.
const AirframeJoints={
  slots:{6:0,7:1,8:2,15:3,16:4,20:5,21:6},
  index(part,x){return this.slots[part]*2+(x<0?0:1);}
};
// IDs 1–4 index uWear, 5–8 index uGearWear. Zero is unpainted scenery or FX.
const damageZones=[null,'fuselage','leftWing','rightWing','tail','leftGear','rightGear','noseGear','engine'];
const wingParts=new Set(['main wing','tip lamp','foreplane','foreplane bearing','joined rear wing','winglet']);
const tailParts=new Set(['fin and rudder','tailplane','tail boom','boom tailplane','ventral fin','tail fairing']);
const engineParts=new Set(['nacelle','nozzle','rotor','fan mount','propeller','spinner']);
function zoneOf(component,center){
  if(wingParts.has(component))return center[0]<0?2:3;
  if(tailParts.has(component))return 4;
  if(engineParts.has(component))return 8;
  if(component==='gear leg'||component==='wheel')return center[2]>1.7?7:center[0]<0?5:6;
  return 1;
}
function buildPlane(type = 'comet', cells = null, triangleParts = null) {
  const fleet=typeof module==='undefined'?Flight.fleet:require('./flight.js').fleet;
  const bolt=type==='bolt'||type==='ribbonBolt';
  const GREY=bolt?[.85,.84,.75]:fleet[type].color, SLATE=GREY.map((channel,index)=>channel*(index===2?.75:.54)), PALE=[.84,.86,.90];
  const RADOME = [0.25, 0.27, 0.36], DARK = [0.13, 0.11, 0.18], NOZZLE = [0.34, 0.29, 0.33];
  const RED = type==='ribbonBolt'?[.13,.75,.72]:[0.92, 0.31, 0.16], WHITE = type==='ribbonBolt'?[.58,.86,1.]:[0.95, 0.93, 0.88], GLASS = [0.99, 0.74, 0.27], GLOW = [1.0, 0.60, 0.24];
  const out = [];
  let component='body';
  const pivots=new Float32Array(14*3),axes=new Float32Array(14*3);
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // two-tone splinter camouflage on top, pale belly
  const camo = (n, c) => n[1] < -0.35 ? PALE : (Math.sin(c[2] * 0.62 + c[0] * 0.95) + Math.sin(c[2] * 0.27 - c[0] * 0.7 + 1.9) > 0.42 ? SLATE : GREY);

  function tri(a, b, c, col, mat, ctr) {
    let n = cross(sub(b, a), sub(c, a));
    const l = Math.hypot(n[0], n[1], n[2]);
    if (l < 1e-9) return;
    n = [n[0] / l, n[1] / l, n[2] / l];
    const g = [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3, (a[2] + b[2] + c[2]) / 3];
    if (n[0] * (g[0] - ctr[0]) + n[1] * (g[1] - ctr[1]) + n[2] * (g[2] - ctr[2]) < 0) n = [-n[0], -n[1], -n[2]];
    const cc = typeof col === 'function' ? col(n, g) : col;
    if(triangleParts)triangleParts.push(mat===14?0:zoneOf(component,g));
    for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0], n[1], n[2], cc[0], cc[1], cc[2], mat);
  }
  // rings: arrays of points, all the same length; cols: one colour (or fn) per segment
  function loft(rings, cols, mat = 0, caps = true) {
    const K = rings[0].length;
    for (let s = 0; s < rings.length - 1; s++) {
      const A = rings[s], B = rings[s + 1];
      if(cells)cells.push(Object.assign([A,B],{mat,component}));
      const ctr = [0, 0, 0];
      for (const p of A.concat(B)) { ctr[0] += p[0]; ctr[1] += p[1]; ctr[2] += p[2]; }
      ctr[0] /= 2 * K; ctr[1] /= 2 * K; ctr[2] /= 2 * K;
      const col = Array.isArray(cols[0]) || typeof cols[0] === 'function' ? cols[Math.min(s, cols.length - 1)] : cols;
      for (let k = 0; k < K; k++) {
        const k2 = (k + 1) % K;
        tri(A[k], A[k2], B[k2], col, mat, ctr); tri(A[k], B[k2], B[k], col, mat, ctr);
      }
      if (caps && (s === 0 || s === rings.length - 2)) {
        const R = s === 0 ? A : B;
        const c = [0, 0, 0]; for (const p of R) { c[0] += p[0] / K; c[1] += p[1] / K; c[2] += p[2] / K; }
        if (s === 0) for (let k = 0; k < K; k++) tri(c, A[k], A[(k + 1) % K], col, mat, ctr);
        if (s === rings.length - 2) for (let k = 0; k < K; k++) tri(c, B[k], B[(k + 1) % K], col, mat, ctr);
      }
    }
  }
  const ell = (z, rx, ry, cy, n = 10, cx = 0) => Array.from({ length: n }, (_, i) => { const a = (i + 0.5) / n * Math.PI * 2; return [cx + Math.cos(a) * rx, cy + Math.sin(a) * ry, z]; });
  // aerofoil section across x — points lie in the z,y plane
  const foil = (x, c, zc, th, y) => [[x, y, zc + 0.5 * c], [x, y + th, zc + 0.2 * c], [x, y + 0.8 * th, zc - 0.25 * c], [x, y + 0.1 * th, zc - 0.5 * c], [x, y - 0.3 * th, zc - 0.25 * c], [x, y - 0.45 * th, zc + 0.2 * c]];
  // fin section at height y, centred on xc — points lie in the z,x plane
  const finS = (y, xc, c, zc, th) => [[xc, y, zc + 0.5 * c], [xc + th, y, zc + 0.1 * c], [xc + th * 0.6, y, zc - 0.5 * c], [xc - th * 0.6, y, zc - 0.5 * c], [xc - th, y, zc + 0.1 * c]];

  if(bolt){
    loft([ell(6,.03,.03,0,6),ell(2,.85,.85,0,6),ell(-3,.75,.75,0,6),ell(-4,.6,.6,0,6)],[WHITE,PALE,RED]);
    for(const side of [-1,1]){
      loft([foil(side*.55,2.8,-2.4,.13,0),foil(side*1.9,1.2,-3.3,.07,0)],[RED]);
      loft([finS(side*.45,0,2.6,-2.4,.10),finS(side*1.65,0,1.2,-3.3,.06)],[WHITE]);
    }
    return {data:new Float32Array(out),solidEnd:out.length/10};
  }
  const spec=fleet[type], [span,rise,sweep]=spec.tip;
  const flanker=type==='su27'||type==='j16';
  const prop=type==='rv8a'||type==='sail',sail=type==='sail';
  function joint(part,side,a,b,reverse=false){
    const i=3*AirframeJoints.index(part,side);
    const d=sub(b,a),length=Math.hypot(...d);
    pivots.set(a,i);axes.set(d.map(v=>v*(reverse?-1:1)/length),i);
  }
  const mix=(a,b,t)=>a.map((v,i)=>v+(b[i]-v)*t);
  // Split the actual section at the hinge. Both skins and the moving panel retain
  // a vertex on its centreline, including on swept, dihedral and canted surfaces.
  function split(r){
    const upper=mix(r[1],r[2],.86),lower=mix(r[5],r[4],.86),pin=mix(upper,lower,.5);
    return {nose:[r[0],r[1],upper,pin,lower,r[5]],aft:[pin,upper,r[2],r[3],r[4],lower],pin};
  }
  function hingedBand(a,b,part,side,paint,vertical=false,splitBrake=false){
    const inner=split(a),outer=split(b);
    if(vertical){
      const cap=inner.nose.map((p,i)=>mix(p,outer.nose[i],.82));
      loft([inner.nose,cap,outer.nose],[paint,RED]);
    }else loft([inner.nose,outer.nose],[paint]);
    const reverse=vertical||side<0;
    if(splitBrake){
      const top=r=>[r[0],r[1],r[2],r[3],mix(r[3],r[0],.5)];
      const bottom=r=>[r[0],mix(r[3],r[0],.5),r[3],r[4],r[5]];
      for(const [id,skin,tint] of [[20,top,PALE],[21,bottom,SLATE]]){
        joint(id,side,inner.pin,outer.pin,reverse);loft([skin(inner.aft),skin(outer.aft)],[tint],id);
      }
    }else{
      joint(part,side,inner.pin,outer.pin,reverse);loft([inner.aft,outer.aft],[SLATE],part);
    }
  }
  // x, chord, longitudinal station, half-thickness, height. Each profile starts
  // inside the fuselage. Interpolated stations preserve the same planform at a cut.
  function profile(){
    const root=[.48,prop?3.5:type==='delta'?13:type==='manta'?11:8,-1.0,.30,.03];
    const knee=[Math.min(span*.54,4.2),4.4,sweep*.60,.19,rise*.40];
    const tip=[span,prop?(sail?1:2.4):2,sweep,.10,rise];
    if(prop){root[2]=.36;knee.splice(0,5,span*.68,sail?2.05:2.95,.38,.16,rise*.67);}
    if(type==='nocturne'){root.splice(0,5,.45,14,1.1,.36,.18);knee.splice(0,5,span*.52,7.6,-.85,.24,.27);}
    if(type==='cirrus'){root.splice(0,5,.48,14.6,.72,.43,.13);knee.splice(0,5,5.35,9,-1.65,.23,.26);tip[1]=1.35;}
    if(type==='ibis'){root.splice(0,5,.5,6.4,-3.3,.32,.12);knee.splice(0,5,3.55,4.1,-1.5,.21,.22);tip[1]=1.5;}
    if(type==='quill'){root.splice(0,5,.47,8.2,-2.4,.21,.12);knee.splice(0,5,2.8,4.2,-4,.15,.20);tip[1]=.95;}
    if(flanker){
      tip[1]=1.78;
      return [[.48,12.3,.82,.42,.21],[1.95,9.3,-.18,.31,.17],
        [3.1,5.7,-1.55,.23,.17],tip];
    }
    if(type==='j10'){root.splice(0,5,.43,9.9,-1.55,.34,.08);knee.splice(0,5,3.6,5.5,-2.95,.21,.13);tip[1]=1.15;}
    if(type==='j20'){
      tip[1]=1.9;
      return [[.52,11.4,-1.3,.40,.24],[2.2,9.1,-1.75,.33,.26],[4.25,5.8,-3,.22,.27],tip];
    }
    if(type==='f4')return [[.48,8.6,-1.15,.34,.06],[span*.69,4.1,-2.62,.21,.06],[span,1.55,sweep,.10,rise]];
    if(type==='f16')return [[.45,12,.8,.38,.18],[1.8,6.15,-1.24,.27,.13],[span,1.65,sweep,.1,rise]];
    if(type==='f22')return [[.45,12.6,-.55,.43,.22],[2.15,9.5,-.65,.34,.24],[span*.82,3.95,-2.2,.18,.23],[span,1.65,sweep,.1,rise]];
    if(type==='ogee'){
      tip[1]=1.4;
      return [[.48,15.6,.65,.44,.12],[1.65,12.9,-.15,.33,.17],
        [3.4,8.1,-2.15,.25,.23],[5.15,5.3,-3.42,.17,.26],tip];
    }
    if(type==='ember')root.splice(0,5,.45,10,-1.1,.32,.16);
    if(type==='opal')knee.splice(0,5,4.45,5.1,-.55,.24,.52);
    if(type==='heron')knee.splice(0,5,5.2,3.6,.72,.22,.38);
    return [root,knee,tip];
  }
  const wingStations=profile();
  function wingSection(x){
    x=Math.max(wingStations[0][0],Math.min(span,x));
    let i=1;while(wingStations[i][0]<x)i++;
    const a=wingStations[i-1],b=wingStations[i];
    return mix(a,b,(x-a[0])/(b[0]-a[0]));
  }
  function sectionAt(x,side){
    const section=wingSection(x);section[0]=x*side;return foil(...section);
  }
  function wing(side){
    const knee=wingStations[type==='ogee'?2:1];
    const equippedFlap=['tern','wisp','delta'].includes(type)||spec.landingFlaps;
    const outerStart=Math.max(span*.59,knee[0]);
    const outerEnd=span*(type==='nocturne'?.78:.95);
    const flapStart=Math.min(1.95,knee[0]-.6);
    const cuts=[...wingStations.map(station=>station[0]),outerStart,outerEnd];
    if(equippedFlap)cuts.push(flapStart);
    if(type==='nocturne')cuts.push(span*.96);
    const stations=[...new Set(cuts)].sort((a,b)=>a-b);
    for(let i=1;i<stations.length;i++){
      const x=stations[i-1],X=stations[i],a=sectionAt(x,side),b=sectionAt(X,side);
      component='main wing';
      if(equippedFlap && x===flapStart && X===knee[0])hingedBand(a,b,15,side,camo);
      else if(x===outerStart && X===outerEnd)hingedBand(a,b,8,side,camo);
      else if(type==='nocturne' && x===outerEnd)hingedBand(a,b,20,side,camo,false,true);
      else loft([a,b],[prop?(sail?GREY:WHITE):camo]);
    }
    component='tip lamp';
    loft([foil(side*(span-.22),.50,sweep+.15,.10,rise+.015),foil(side*(span+.06),.27,sweep+.13,.065,rise+.025)],[side===1?[.56,.92,.70]:[1,.43,.30]],4);
  }
  function fin(side,base,top){
    const upright=([x,y,z,c,t])=>[
      [x,y,z+.5*c],[x+t,y,z+.2*c],[x+.75*t,y,z-.25*c],
      [x,y,z-.5*c],[x-.75*t,y,z-.25*c],[x-t,y,z+.2*c]
    ];
    const a=upright(base),b=upright(top);
    component='fin and rudder';hingedBand(a,b,7,side,camo,true);
    if(base[0]===0 && top[0]===0){
      // A centre fin straddles the mesh centreline and uses one axis for both faces.
      pivots.copyWithin(6,9,12);axes.copyWithin(6,9,12);
    }
  }
  function stabilator(side,x,y,z,length,outerZ){
    component='tailplane';
    const a=foil(side*x,length,z,.18,y),b=foil(side*(prop?2.85:4.3),length*.49,outerZ,.09,y+(type==='f4'?-.82:.04));
    const pin=[side*x,y,z];
    joint(6,side,pin,[pin[0]+1,y,z]);loft([a,b],[prop?RED:camo],6);
  }
  function foreplane(side){
    if(!spec.canard)return;
    const {y,z}=spec.canard;
    const extent=type==='tandem'?7.45:type==='ember'||type==='wisp'?4.35:type==='j20'?4.45:type==='j10'?3.30:type==='ibis'?3.6:type==='kite'?3.8:2.95;
    const outerZ=type==='tandem'?z-.3:z-.85,rootX=type==='tandem'?.49:.54;
    component='foreplane bearing';
    loft([foil(side*.30,1.4,z,.21,y-.055),foil(side*(rootX+.19),.8,z,.14,y)],[GREY]);
    component='foreplane';
    loft([foil(side*rootX,type==='tandem'?3.5:2.9,z,.16,y),foil(side*extent,type==='tandem'?1.4:1.05,outerZ,.09,y+(type==='tandem'?.36:.12))],[type==='j20'?GREY:PALE],19);
  }
  // Wheel centres at full extension match the runway solver. The upper end of
  // each leg sits inside the belly or nacelle and stays put through the gear cycle.
  for(const [wx,wz,radius] of [[-(sail?.68:1.75),-1,.46],[sail?.68:1.75,-1,.46],[0,3.25,.35]]){
    const axle=-2.5+radius,rootX=wx*((prop||spec.singleEngine) ? .48 : .82);
    component='gear leg';
    loft([finS(-.18,rootX,.38,wz,.16),finS(axle,wx,.27,wz,.12)],[PALE],9);
    component='wheel';
    const rim=(x,r)=>Array.from({length:10},(_,i)=>[x,axle+r*Math.cos(i*Math.PI/5),wz+r*Math.sin(i*Math.PI/5)]);
    loft([rim(wx-.20,radius*.70),rim(wx-.14,radius),rim(wx+.14,radius),rim(wx+.20,radius*.70)],[DARK,NOZZLE,DARK],18);
    for(const sign of [-1,1]){
      const stripe=x=>[[x,axle,wz],[x,axle+.63*radius,wz],[x,axle+.20*radius,wz+.49*radius]];
      loft([stripe(wx+sign*.194),stripe(wx+sign*.202)],[PALE],18);
    }
  }
  component='fuselage';
  if(prop){
    loft([ell(5.5,.25,.25,0),ell(4.7,1,.9,0),ell(1,1.2,1.1,0),ell(-3.5,.75,.68,.15),ell(-6.8,.2,.24,.35)],[RED,WHITE,WHITE,RED]);
    component='canopy';loft([ell(2.5,.58,.40,.85),ell(.3,.84,.85,.90),ell(-1.8,.45,.4,.74)],[GLASS],3);
    component='spinner';loft([ell(5.34,.32,.32,0),ell(5.65,.18,.18,0)],[GREY]);
    for(const side of [-1,1]){
      wing(side);stabilator(side,.16,.28,-5.24,2.2,-5.8);
      component='propeller';loft([foil(side*.08,.24,5.48,.15,0),foil(side*.92,.31,5.50,.23,.02),foil(side*2.10,.13,5.46,.09,.10)],[DARK],10);
    }
    fin(1,[0,.27,-5.33,2.95,.14],[0,2.55,-6.29,1.65,.08]);
    return {data:new Float32Array(out),solidEnd:out.length/10,pivots,axes};
  }
  const tapered=type==='quill'||type==='ogee'||flanker;
  // The angular cross sections give the J-20 a wide shoulder below its canopy.
  const angular=type==='j20'||type==='f22';
  const skin=angular?(z,w,h,y)=>[[0,y+h,z],[-w*.73,y+h*.78,z],[-w*1.55,y+h*.20,z],
    [-w*1.35,y-h*.26,z],[-w*.66,y-h*.78,z],[0,y-h,z],[w*.66,y-h*.78,z],
    [w*1.35,y-h*.26,z],[w*1.55,y+h*.20,z],[w*.73,y+h*.78,z]]:ell;
  const nose=[skin(spec.noseLength??10.4,.05,.05,0)];
  if(tapered)nose.push(ell(spec.noseLength*.81,.30,.21,0));
  nose.push(skin(9.2,type==='j20'?.67:tapered?.57:.34,tapered?.46:.32,.02));
  loft([...nose,skin(7.6,.62,.58,.08),skin(5.6,.88,.82,.2),skin(3.2,1.02,.95,.3),skin(.5,1.05,.9,.3),skin(-3.5,1,.8,.25),skin(-7,.8,.6,.2),skin(-8.9,.32,.28,.2)],
    tapered?[RADOME,GREY,GREY,camo,camo,camo,camo,camo,camo]:[RADOME,RADOME,camo,camo,camo,camo,camo,camo]);
  for(const side of spec.singleEngine?[0]:[-1,1]){
    const cx=side*1.32;
    component='nacelle';
    if(spec.singleEngine){
      loft([ell(4.07,.63,.33,-.73,8),ell(4.0,.76,.50,-.7,8),ell(1,.85,.63,-.57,8),
        ell(-4,1,.85,-.29,8),ell(-8.4,.84,.78,-.12,8)],[DARK,camo,camo,camo]);
    }else if(angular){
      const intake=(z,x,w,h)=>[[side*(x-w),.44,z+.52],[side*(x+w*.55),.44,z+.32],
        [side*(x+w),.06,z],[side*(x+w*.84),-h,z-.54],[side*(x-w),-h,z-.32]];
      loft([intake(3.7,1.45,.63,.57),intake(3.55,1.46,.75,.65),intake(1.8,1.5,.80,.71),
        intake(-3.7,1.38,.82,.73),intake(-7.9,1.32,.68,.70)],[DARK,camo,camo,camo]);
    }else loft([ell(2.66,.50,.56,-.2,8,side*1.46),ell(2.6,.64,.70,-.2,8,side*1.46),ell(1.5,.80,.82,-.18,8,side*1.42),ell(-2,.90,.86,-.14,8,side*1.36),ell(-6.5,.86,.82,-.12,8,cx),ell(-8.4,.80,.78,-.12,8,cx)],[DARK,camo,camo,camo,camo]);
    component='nozzle';
    // The rectangular lip, exhaust disc and plume share the pitch hinge.
    const outlet=type==='f22'?(z,w,h,y,n,x)=>[[x-w,y-h*.51,z],[x-w,y+h*.51,z],[x+w,y+h*.51,z],[x+w,y-h*.51,z]]:ell;
    loft([outlet(-7.96,.64,.63,-.12,8,cx),outlet(-9.50,.60,.60,-.12,8,cx)],[NOZZLE],11);
    loft([outlet(-9.53,.51,.51,-.12,8,cx),outlet(-17.53,.025,.025,-.12,8,cx)],[GLOW],12,false);
    loft([outlet(-9.485,.50,.50,-.12,8,cx),outlet(-9.51,.50,.50,-.12,8,cx)],[GLOW],13);
  }
  if(flanker){
    component='tail fairing';
    loft([ell(-7.2,.54,.4,.28),ell(-9.5,.40,.33,.25),ell(-11.35,.12,.1,.22)],[GREY,SLATE]);
  }
  for(const side of [-1,1]){
    const cx=side*1.32;
    wing(side);foreplane(side);
    if(type==='gull'||type==='loom'){
      const high=type==='loom'?2.45:1.72;
      component='dorsal wing saddle';
      loft([foil(side*.21,3.4,-5.1,.55,.45),foil(side*1.02,2.6,-5.3,.40,high*.58),foil(side*1.6,2.2,-5.4,.25,high*.78)],[GREY,SLATE]);
      component='joined rear wing';
      loft([foil(side*1.38,2.4,-5.4,.21,high*.76),foil(side*(span*.55),1.65,(sweep-5.4)*.48,.14,high),foil(side*(span-.09),.91,sweep+.02,.12,rise+.025)],[PALE,GREY]);
    }
    if(type==='rook'){
      component='tail boom';
      loft([ell(1.4,.51,.57,.32,8,side*4.2),ell(-5,.40,.45,.53,8,side*4.2),ell(-9.75,.31,.34,.72,8,side*4.2)],[SLATE]);
      fin(side,[side*4.2,.60,-8.55,3.2,.18],[side*4.2,2.95,-9.15,1.9,.10]);
      component='boom tailplane';hingedBand(foil(0,1.9,-9.25,.14,1.98),foil(side*4.24,1.9,-9.25,.14,1.98),6,side,PALE);
    }else{
      if(!spec.elevon && type!=='tandem')stabilator(side,spec.singleEngine ? .58 : 1.46,.03,-7.22,3.35,-8.36);
      if(flanker){
        fin(side,[side*1.52,.37,-5.9,4.35,.22],[side*1.82,3.85,-7.2,1.7,.11]);
      }else if(angular){
        fin(side,[cx,.35,-6.2,4.3,.24],[side*3.9,3.05,-7.75,1.86,.12]);
      }else if(type==='cirrus'){
        fin(side,[cx,.32,-5.7,4.25,.21],[side*4.6,2.18,-7.92,1.62,.10]);
      }else if(['comet','pulse','aurora','skate','opal'].includes(type)){
        const wide=type==='skate'||type==='opal';
        fin(side,[cx,.34,-6.1,3.8,.21],[side*(wide?3.95:2.32),wide?2.75:3.55,-7.6,1.85,.10]);
      }else if(type!=='nocturne'&&side===1)fin(1,[0,.38,-6.15,4.1,.20],[0,3.95,-7.58,1.85,.09]);
    }
    if(type==='lance'||type==='spire'){
      component='ventral fin';loft([finS(-.49,cx,2.8,-5.9,.15),finS(-1.5,side*2.12,1.3,-6.7,.075)],[SLATE]);
    }
    if(type==='osprey'){
      component='winglet';loft([finS(rise-.04,side*(span-.12),1.8,sweep,.12),finS(rise+1.35,side*(span+.25),.93,sweep-.32,.07)],[GREY]);
      component='speed brake';
      const z=-3.42,y=.57,a=[side*.84,y,z],b=[side*1.60,y,z];
      joint(16,side,a,b,side<0);
      loft([foil(side*.84,1.5,z-.68,.095,y),foil(side*1.60,1.28,z-.57,.07,y-.02)],[SLATE],16);
    }
    if(type==='manta'){
      // Rotor strut and hub remain fixed inside the open circular rim.
      const x=side*3.35,cy=.66,cz=4.25;
      // Ahead of the wing leading edge: the rotor has an open inlet and outlet.
      component='fan pylon';
      loft([ell(3.32,.25,.20,.36,8,x),ell(1.95,.30,.23,.25,8,x),ell(-.12,.35,.23,.12,8,x)],[GREY,SLATE]);
      component='fan mount';
      loft([foil(x-side*1.07,.36,cz,.13,.40),foil(x,.42,cz,.14,.36),foil(x+side*1.07,.36,cz,.13,.40)],[SLATE]);
      const collar=(y,r)=>Array.from({length:10},(_,i)=>[x+r*Math.cos(i*Math.PI/5),y,cz+r*Math.sin(i*Math.PI/5)]);
      loft([collar(.13,.30),collar(.76,.16)],[NOZZLE]);
      for(let i=0;i<12;i++){
        const rim=t=>[[.99,.15],[1.17,.15],[1.17,.73],[.99,.73]].map(([r,y])=>[x+r*Math.cos(t),y,cz+r*Math.sin(t)]);
        loft([rim(i*Math.PI/6),rim((i+1)*Math.PI/6)],[SLATE],0,false);
      }
      component='rotor';
      for(let i=0;i<4;i++){
        const a=i*Math.PI/2,blade=(r,w,h)=>[x+r*Math.cos(a)-w*Math.sin(a),cy+h,cz+r*Math.sin(a)+w*Math.cos(a)];
        const at=r=>[blade(r,-.08,-.03),blade(r,.13,0),blade(r,.09,.045)];
        loft([at(.06),at(.93)],[PALE],17);
      }
    }
  }
  component='canopy';
  const can=(z,w,h,y)=>[[-w,y-.14,z],[-w*.86,y+.72*h,z],[-w*.36,y+h,z],[w*.36,y+h,z],[w*.86,y+.72*h,z],[w,y-.14,z]];
  if(type==='j16'||type==='f4'){
    loft([can(6.7,.29,.16,.75),can(5.6,.64,.85,.83),can(4.55,.69,.89,.89)],[GLASS],3);
    loft([can(4.55,.69,.89,.89),can(4.32,.72,.91,.91)],[GREY]);
    loft([can(4.32,.72,.91,.91),can(3.35,.72,1.02,.94),can(1.65,.50,.30,.91)],[GLASS],3);
  }else loft([can(6.5,.28,.10,.75),can(5.5,.60,.8,.80),can(4.1,.70,.98,.90),can(2.7,.5,.42,.91)],[GLASS],3);
  const solidEnd=out.length/10;
  // The cloud is scenery attached to the wing outline. Each ring samples the
  // same spanwise chord, sweep and height used to build the model above.
  function mistRing(width,height,chordFraction){
    return Array.from({length:20},(_,i)=>{
      const angle=i*Math.PI/10,x=width*span*Math.cos(angle);
      const [,chord,z,thickness,y]=wingSection(Math.abs(x));
      return [x,y+thickness+height*span*Math.sin(angle),z+chord*chordFraction];
    });
  }
  component='condensation';
  loft([mistRing(.19,.11,.48),mistRing(.79,.35,.10),mistRing(1.04,.42,-.32)],
    [PALE],14,false);
  return {data:new Float32Array(out),solidEnd,pivots,axes};
}
if(typeof module!=='undefined')module.exports={buildPlane,AirframeJoints,damageZones};
