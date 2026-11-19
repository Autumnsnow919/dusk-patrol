function buildPlane(type = 'comet', cells = null) {
  const fleet=typeof module==='undefined'?Flight.fleet:require('./flight.js').fleet;
  const bolt=type==='bolt'||type==='ribbonBolt';
  const GREY=bolt?[.85,.84,.75]:fleet[type].color, SLATE=GREY.map((channel,index)=>channel*(index===2?.75:.54)), PALE=[.84,.86,.90];
  const RADOME = [0.25, 0.27, 0.36], DARK = [0.13, 0.11, 0.18], NOZZLE = [0.34, 0.29, 0.33];
  const RED = type==='ribbonBolt'?[.13,.75,.72]:[0.92, 0.31, 0.16], WHITE = type==='ribbonBolt'?[.58,.86,1.]:[0.95, 0.93, 0.88], GLASS = [0.99, 0.74, 0.27], GLOW = [1.0, 0.60, 0.24];
  const out = [];
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
    for (const p of [a, b, c]) out.push(p[0], p[1], p[2], n[0], n[1], n[2], cc[0], cc[1], cc[2], mat);
  }
  // rings: arrays of points, all the same length; cols: one colour (or fn) per segment
  function loft(rings, cols, mat = 0, caps = true) {
    const K = rings[0].length;
    for (let s = 0; s < rings.length - 1; s++) {
      const A = rings[s], B = rings[s + 1];
      if(cells)cells.push([A,B]);
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
  const prop=type==='rv8a'||type==='sail';
  const sail=type==='sail';
  // Wheels and struts are baked into the airframe buffer and articulated in the vertex shader.
  for(const [wx,wz,radius] of [[-1.75,-1,.46],[1.75,-1,.46],[0,3.25,.35]]){
    const axle=-2.5+radius;
    loft([finS(-.48,wx,.22,wz,.12),finS(axle,wx,.24,wz,.12)],[PALE],9);
    const rim=(x,r)=>Array.from({length:10},(_,i)=>[x,axle+r*Math.cos(i*Math.PI/5),wz+r*Math.sin(i*Math.PI/5)]);
    loft([rim(wx-.20,radius*.70),rim(wx-.14,radius),rim(wx+.14,radius),rim(wx+.20,radius*.70)],[DARK,NOZZLE,DARK],18);
    for(const sign of [-1,1]){
      const x=wx+sign*.207;
      tri([x,axle,wz],[x,axle+.65*radius,wz],[x,axle+.2*radius,wz+.52*radius],PALE,18,[wx,axle,wz]);
    }
  }
  const wing=fleet[type].tip;
  for(const s of [-1,1]){
    const hinge=wing[2]-(prop?1.35:1.0);
    loft([foil(s*wing[0]*.66,1.15,hinge-.46,.10,wing[1]*.68),foil(s*wing[0]*.99,.72,hinge-.28,.07,wing[1])],[SLATE],8);
  }
  if(prop){
    loft([ell(5.5,.25,.25,0),ell(4.7,1,.9,0),ell(1,1.2,1.1,0),ell(-3.5,.75,.68,.15),ell(-6.8,.2,.24,.35)],[RED,WHITE,WHITE,RED]);
    loft([ell(2.5,.58,.40,1),ell(.3,.84,.85,.99),ell(-1.8,.45,.4,.8)],[GLASS],3);
    for(const side of [-1,1]){
      loft([foil(side*.85,3.2,.4,.23,0),foil(side*(sail?11.8:7.3),sail?1.6:3.1,.4,.12,sail?.75:.48),foil(side*wing[0],sail?1:2.7,wing[2],.08,wing[1])],[sail?GREY:WHITE,RED]);
      loft([foil(side*.2,2,-5.2,.1,.25),foil(side*2.8,1.4,-5.8,.1,.27)],[RED],6);
      loft([foil(side*.15,.16,5.45,.10,0),foil(side*2.1,.15,5.45,.13,0)],[DARK],10);
    }
    loft([finS(.2,0,2.8,-5.4,.13),finS(2.5,0,1.4,-6.3,.08)],[RED]);
    loft([finS(.45,0,1,-6.7,.1),finS(2.4,0,.7,-7.03,.07)],[SLATE],7);
    return {data:new Float32Array(out),solidEnd:out.length/10};
  }
  // fuselage: dark radome, then camouflage back to the tail cone
  loft([ell(type==='spire'?16:type==='needle'?14.5:10.4, 0.05, 0.05, 0.0), ell(9.2, 0.34, 0.32, 0.02), ell(7.6, 0.62, 0.58, 0.08), ell(5.6, 0.88, 0.82, 0.2), ell(3.2, 1.02, 0.95, 0.3), ell(0.5, 1.05, 0.9, 0.3), ell(-3.5, 1.0, 0.8, 0.25), ell(-7.0, 0.8, 0.6, 0.2), ell(-8.9, 0.32, 0.28, 0.2)],
    [RADOME, RADOME, camo, camo, camo, camo, camo, camo]);
  for (const sgn of [1, -1]) {
    // engine: dark intake mouth, long nacelle, burnt nozzle
    loft([ell(2.66, 0.50, 0.56, -0.2, 8, sgn * 1.46), ell(2.6, 0.64, 0.70, -0.2, 8, sgn * 1.46), ell(1.5, 0.80, 0.82, -0.18, 8, sgn * 1.42), ell(-2.0, 0.90, 0.86, -0.14, 8, sgn * 1.36), ell(-6.5, 0.86, 0.82, -0.12, 8, sgn * 1.32), ell(-8.4, 0.80, 0.78, -0.12, 8, sgn * 1.32)],
      [DARK, camo, camo, camo, camo]);
    loft([ell(-8.4,.80,.78,-.12,8,sgn*1.32),ell(-9.5,.60,.60,-.12,8,sgn*1.32)],[NOZZLE],11);
    loft([ell(-9.53,.51,.51,-.12,8,sgn*1.32),ell(-17.53,.025,.025,-.12,8,sgn*1.32)],[GLOW],12,false);
    // the fire inside the nozzle
    { const cx = sgn * 1.32, cy = -0.12, z = -9.52, r = 0.5, N = 8; for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, b = (i + 1) / N * Math.PI * 2; for (const p of [[cx, cy, z], [cx + Math.cos(a) * r, cy + Math.sin(a) * r, z], [cx + Math.cos(b) * r, cy + Math.sin(b) * r, z]]) out.push(p[0], p[1], p[2], 0, 0, -1, GLOW[0], GLOW[1], GLOW[2], 13); } }
    // Nacelle cooling slots, canopy sill and contrasting wingtip position lights.
    for(const z of [.8,-.05,-.9])
      loft([foil(sgn*1.53,.31,z,.035,.65),foil(sgn*1.87,.28,z-.15,.03,.55)],[NOZZLE]);
    loft([foil(sgn*.66,3.4,4.45,.07,.87),foil(sgn*.84,3.15,4.4,.05,.78)],[SLATE]);
    // leading-edge extension, wing, stabilator
    loft([foil(sgn * 0.8, 5.2, 4.5, 0.10, 0.26), foil(sgn * 1.75, 0.5, 2.5, 0.08, 0.14)], [camo]);
    const [span,rise,sweep]=fleet[type].tip;
    loft([foil(sgn*1.7, type==='delta'?15:type==='manta'?12:7.6,-1.3,.26,.05), foil(sgn*4.2,4.4,sweep*.65,.16,rise*.4),foil(sgn*span,2,sweep,.09,rise)], [camo,camo]);
    loft([foil(sgn*(span-.38),.76,sweep+.12,.14,rise+.08),foil(sgn*(span+.10),.52,sweep+.08,.09,rise+.09)],[sgn===1?[.56,.92,.70]:[1,.43,.30]],4);
    if(type==='nocturne'){
      loft([foil(sgn*.72,13.8,1.1,.34,.24),foil(sgn*4.4,7.9,-.65,.22,.32),foil(sgn*7.8,2.6,-4.4,.11,.18)],[GREY,SLATE]);
      for(const skin of [-1,1])loft([foil(sgn*6.7,1.35,-5.4,.06,.2+.07*skin),foil(sgn*8.9,1.0,-5.6,.04,.2+.07*skin)],[skin>0?PALE:SLATE],skin>0?20:21);
    }
    if(type==='ember'){
      loft([foil(sgn*.85,3.3,4.7,.18,.42),foil(sgn*4.35,1.0,3.7,.08,.62)],[PALE],19);
      loft([foil(sgn*.85,9.3,-1.1,.24,.25),foil(sgn*4.8,3.9,-2.9,.11,.20)],[SLATE]);
    }
    if(type==='tandem')loft([foil(sgn*.7,3.5,3.6,.18,.85),foil(sgn*5.9,2.1,3.65,.12,1.05),foil(sgn*7.5,1.2,3.32,.08,1.3)],[GREY,PALE],19);
    if(type==='opal'){
      loft([foil(sgn*.8,7,1.7,.28,.30),foil(sgn*4.6,4.2,-.3,.18,.48),foil(sgn*7.1,1.3,-2.4,.08,.92)],[GREY,SLATE]);
      loft([finS(.4,sgn*3.2,4.1,-4.1,.16),finS(2.35,sgn*5.2,1.2,-5.9,.05)],[PALE]);
    }
    if(type==='lance'){
      loft([foil(sgn*.85,3.1,5.5,.16,.38),foil(sgn*2.75,1.2,4.9,.08,.48)],[PALE],19);
      loft([finS(-.45,sgn*1.8,3.2,-6.3,.14),finS(-1.6,sgn*2.6,1.3,-7.2,.08)],[SLATE]);
    }
    if(type==='loom'){
      loft([foil(sgn*1.4,3.8,-6.3,.19,2.0),foil(sgn*6.1,1.8,-4.0,.12,2.5),foil(sgn*10.6,.8,-.5,.08,1.3)],[PALE,GREY]);
    }
    if(type==='rook'){
      loft([ell(1.4,.55,.62,.4,8,sgn*4.2),ell(-9.7,.32,.36,.75,8,sgn*4.2)],[SLATE]);
      loft([finS(.6,sgn*4.2,3,-8.3,.18),finS(3,sgn*4.2,1.4,-9.3,.08)],[GREY]);
      loft([foil(0,1.6,-9.5,.11,2.3),foil(sgn*4.2,1.4,-9.45,.11,2.3)],[PALE]);
    }
    if(type==='skate')loft([finS(.2,sgn*3.2,4,-4.7,.20),finS(2.5,sgn*5.4,1.8,-6.4,.09)],[GREY]);
    if(type==='wisp')loft([foil(sgn*.85,3.2,4.3,.18,.50),foil(sgn*4.35,1.3,3.15,.09,.74)],[PALE],19);
    if(type==='spire')loft([finS(-.5,sgn*1.4,3,-5.6,.11),finS(-1.55,sgn*1.9,1.6,-6.5,.07)],[SLATE]);
    if(type==='heron')loft([foil(sgn*2.2,3,.4,.16,.2),foil(sgn*6.8,1.35,1.1,.09,1.3),foil(sgn*10.6,.55,-1.2,.06,.9)],[PALE,SLATE]);
    if(type==='gull')loft([foil(sgn*1.2,4,-6,.16,1.6),foil(sgn*4,1.7,-4.2,.1,2.1),foil(sgn*6.1,.7,-2.2,.06,1.12)],[SLATE,PALE]);
    if(type==='tern'||type==='delta'||type==='wisp')loft([foil(sgn*1.9,1.4,-3.35,.11,.25),foil(sgn*4.6,1.2,-3.35,.1,.3)],[SLATE],15);
    if(type==='osprey')loft([foil(sgn*.56,2,-4.4,.13,1),foil(sgn*1.65,1.7,-4.3,.1,.65)],[SLATE],16);
    if(type==='manta'){
      for(let blade=0;blade<4;blade++){
        const a=blade*Math.PI/2,point=(r,w)=>[sgn*3.3+r*Math.cos(a)-w*Math.sin(a),.75,r*Math.sin(a)+w*Math.cos(a)];
        tri(point(.06,-.09),point(1.05,-.14),point(.97,.24),PALE,17,[sgn*3.3,.4,0]);
      }
    }
    if(type==='manta')loft([ell(1.8,.86,.42,.12,12,sgn*3.3),ell(-1.5,1.05,.52,.13,12,sgn*3.3)],[SLATE]);
    if(type==='osprey')loft([finS(rise,sgn*span,1.9,sweep,.10),finS(2.7,sgn*(span+.45),1,sweep-.4,.08)],[GREY]);
    if(type==='kite'||type==='pulse'||type==='petrel'||type==='aurora')loft([foil(sgn*.9,2.4,4.7,.13,.22),foil(sgn*(type==='kite'?3.8:2.9),.75,3.9,.06,.35)],[GREY],19);
    if(!fleet[type].elevon && type!=='tandem')loft([foil(sgn * 1.9, 3.0, -7.4, 0.14, 0.0), foil(sgn * 4.3, 1.2, -8.5, 0.07, -0.02)], [camo],6);
    const twin=type==='comet'||type==='pulse'||type==='aurora'||type==='skate';
    if(type!=='nocturne' && (twin||sgn===1))loft([finS(.7,twin?sgn*1.4:0,1.2,-7.95,.1),finS(twin?3.3:3.9,twin?sgn*2.3:0,.7,-8.45,.06)],[SLATE],7);
    // canted fin with a red cap
    if (twin) loft([finS(.55,sgn*1.35,3.6,-6.3,.14),finS(2.8,sgn*2.12,2,-7.37,.09),finS(3.5,sgn*2.35,1.5,-7.7,.07)],[camo,RED]);
    else if (sgn === 1 && type!=='nocturne') loft([finS(.55,0,4,-6.2,.18),finS(3.3,0,2.2,-7.2,.12),finS(4.1,0,1.5,-7.7,.07)],[camo,RED]);
  }
  // gold-tinted bubble canopy
  const can = (z, w, h, yb) => [[-w, yb - 0.1, z], [-w * 0.86, yb + 0.72 * h, z], [-w * 0.36, yb + h, z], [w * 0.36, yb + h, z], [w * 0.86, yb + 0.72 * h, z], [w, yb - 0.1, z]];
  loft([can(6.5, 0.28, 0.10, 0.78), can(5.5, 0.60, 0.80, 0.84), can(4.1, 0.70, 0.98, 0.96), can(2.7, 0.50, 0.42, 1.08)], [GLASS], 3);
  loft([ell(3,1.3,1.2,0,16),ell(-6.4,11,6.4,0,16),ell(-8.2,10.7,6.1,0,16)],[PALE],14,false);
  const solidEnd = out.length / 10;

  return {data:new Float32Array(out),solidEnd};
}

if(typeof module!=='undefined')module.exports={buildPlane};
