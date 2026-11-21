// Club instrument fits. Each pair specifies a panel and a windscreen structure.
const CockpitLayouts = (() => {
  const fits = {
    tern:['six','hoop'],        swift:['sport','bubble'],     comet:['six','bow'],
    kite:['portrait','brace'], manta:['twin','hoop'],        osprey:['offset','bow'],
    pulse:['portrait','facet'],heron:['six','brace'],         gull:['sport','hoop'],
    rv8a:['six','bubble'],     needle:['offset','facet'],     sail:['pod','bubble'],
    delta:['offset','brace'],  petrel:['sport','brace'],      aurora:['twin','brace'],
    spire:['portrait','bow'],  rook:['pod','brace'],          skate:['twin','facet'],
    wisp:['portrait','bubble'],opal:['sport','facet'],        lance:['offset','hoop'],
    loom:['pod','hoop'],       nocturne:['wide','facet'],     ember:['sport','bow'],
    tandem:['pod','bow'],      cirrus:['wide','bubble'],      ibis:['pod','facet'],
    quill:['offset','bubble'], ogee:['twin','bow'],           su27:['six','facet'],
    j10:['portrait','hoop'],   j20:['wide','brace'],          j16:['twin','bubble'],
    f4:['six','split'],        f16:['offset','clear'],        f22:['wide','hoop'],
    f15:['twin','clear'],      m2000:['portrait','split'],    f5:['sport','split'],
    viggen:['offset','split'], hornet:['twin','split'],       mig21:['six','clear']
  };
  // Station coordinates are fractions of the available instrument bank.
  const banks = {
    sport:[['dialSpeed',-.61,.23],['attitude',0,.33],['dialAltitude',.61,.23]],
    pod:[['dialSpeed',-.64,.19],['dialClimb',0,.30],['air',.64,.24]],
    portrait:[['dialSpeed',-.68,.20],['attitude',0,.37],['engine',.67,.24]],
    offset:[['attitude',-.44,.44],['dialAltitude',.36,.23],['engine',.80,.13]],
    twin:[['attitude',-.53,.39],['air',.36,.43],['engine',.87,.08]],
    wide:[['panorama',0,.94]]
  };
  const shapes = {
    // height adjustment, coaming rise, flat centre width, instrument bank half-width
    six: [0,11,62,185], sport:[-13,7,41,142], pod:[-30,19,25,118],
    portrait:[-3,18,39,151], offset:[-9,10,72,173], twin:[-2,7,118,190], wide:[-12,4,142,196]
  };
  return {fits,banks,shapes};
})();

// ───────────────────────── cockpit ─────────────────────────
// Hand-plotted pixel panel and head-up display: every reading is driven by the flight state.
const Cockpit = (function (fleet,sight) {
  let steadyPanel=null,radarTime=-1,steadyOffset=NaN;
  const mapLines=[],mapPalette=[];
  let type='tern',bank='six',canopy='hoop',shape=CockpitLayouts.shapes.six,stations=[];
  let ready=false,lastOffset=NaN,crest=0,solid=0,dirtyLeft=0,dirtyRight=0;
  let bareGlass=false;
  let W = 0, H = 0, ctx = null, img = null, out = null, panel = null, frame = null, T = null, CL = null;
  let cx = 0, y0 = 0, PH = 0, wide = false, drawn = false;
  const C = (hex, a = 255) => { const n = parseInt(hex.slice(1), 16); return ((a << 24) | ((n & 255) << 16) | (n & 0xff00) | (n >> 16 & 255)) >>> 0; };
  const K = {
    ink: C('#15101e'), f0: C('#1b1f2e'), f1: C('#272e44'), f2: C('#3a4764'), fHi: C('#7088ac'),
    l0: C('#12101a'), l1: C('#1d1b29'), l2: C('#2b2a3b'), lHi: C('#4b4d68'),
    p0: C('#13212a'), p1: C('#1b2f38'), p2: C('#223b45'), plate: C('#284650'), plateHi: C('#3f6a72'), plateLo: C('#111d24'),
    b0: C('#2a3046'), b1: C('#535d78'), b2: C('#8f9bb4'), bHi: C('#edf2fa'),
    dial: C('#0e131b'), dial2: C('#18212d'), tick: C('#efe3c6'), dim: C('#8d897f'),
    needle: C('#ff6b3a'), needleDk: C('#9a2c1c'), white: C('#fff6e0'),
    sky: C('#58a6e4'), sky2: C('#3d82c6'), gnd: C('#b06c3c'), gnd2: C('#84492a'),
    a0: C('#170a04'), a1: C('#4d2409'), a2: C('#a45410'), a3: C('#ee9820'), a4: C('#ffdc7a'),
    green: C('#5fd884'), greenDk: C('#1f4a34'), red: C('#ff5440'), redDk: C('#4e1a1c'), amber: C('#ffb62e'), amberDk: C('#4e3414'),
    arcG: C('#58c878'), arcY: C('#f0c040'), arcR: C('#f04a3a'),
    hud: C('#8cffa6'), hudWarn: C('#ffd25a'), glass: C('#b8ffd8', 13), glassEdge: C('#d8fff0', 70),
  };
  const FONT = {
    '0': '111101101101111', '1': '010110010010111', '2': '111001111100111', '3': '111001111001111', '4': '101101111001001',
    '5': '111100111001111', '6': '111100111101111', '7': '111001010010010', '8': '111101111101111', '9': '111101111001111',
    'A': '010101111101101', 'B': '110101110101110', 'C': '011100100100011', 'D': '110101101101110', 'E': '111100110100111',
    'G': '011100101101011', 'L': '100100100100111', 'N': '110101101101101', 'O': '010101101101010', 'P': '110101110100100',
    'R': '110101110101101', 'S': '011100010001110', 'T': '111010010010010', 'U': '101101101101111', 'W': '101101111111101',
    'F': '111100110100100', 'M': '101111111101101', 'X': '101101010101101',
    'C':'111100100100111','K':'101110100110101','%':'101001010100101',
    '-': '000000111000000', '.': '000000000000010', ' ': '000000000000000',
  };

  // ── plotting ──
  function px(x, y, c) { x |= 0; y |= 0; if (x < 0 || y < 0 || x >= W || y >= H) return; if (CL && (x < CL[0] || y < CL[1] || x > CL[2] || y > CL[3])) return; T[y * W + x] = c; }
  function rect(x,y,w,h,c) {
    const left=Math.max(0,x,CL?CL[0]:0),right=Math.min(W,x+w,CL?CL[2]+1:W);
    if(right<=left)return;
    const end=Math.min(H,y+h,CL?CL[3]+1:H);
    for(let row=Math.max(0,y,CL?CL[1]:0);row<end;row++)T.fill(c,row*W+left,row*W+right);
  }
  function line(x0, y0_, x1, y1, c, dash = 0) {
    x0 = Math.round(x0); y0_ = Math.round(y0_); x1 = Math.round(x1); y1 = Math.round(y1);
    if(CL && (Math.max(x0,x1)<CL[0]||Math.min(x0,x1)>CL[2]||Math.max(y0_,y1)<CL[1]||Math.min(y0_,y1)>CL[3]))return;
    const dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0_), sx = x0 < x1 ? 1 : -1, sy = y0_ < y1 ? 1 : -1; let e = dx + dy;
    for (let n = 0; n < 600; n++) { if (!dash || (n % (dash * 2)) < dash) px(x0, y0_, c); if (x0 === x1 && y0_ === y1) break; const e2 = 2 * e; if (e2 >= dy) { e += dy; x0 += sx; } if (e2 <= dx) { e += dx; y0_ += sy; } }
  }
  function disc(x, y, r, c) { const rr = r * r + r * 0.8; for (let j = -r; j <= r; j++) for (let i = -r; i <= r; i++) if (i * i + j * j <= rr) px(x + i, y + j, c); }
  function glyph(ch, x, y, c) { const g = FONT[ch]; if (!g) return 4; for (let j = 0; j < 5; j++) for (let i = 0; i < 3; i++) if (g[j * 3 + i] === '1') px(x + i, y + j, c); return 4; }
  function text(s, x, y, c) { for (const ch of String(s)) x += glyph(ch, x, y, c); }
  const textW = s => String(s).length * 4 - 1;
  const pol = (x, y, a, r) => [x + Math.sin(a) * r, y - Math.cos(a) * r];
  const rad = d => d * Math.PI / 180;
  const hash = (x, y) => { let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // steel bezel + dark face
  function bezel(x, y, r, face = K.dial) {
    const R = r + 3;
    for (let j = -R - 1; j <= R + 1; j++) for (let i = -R - 1; i <= R + 1; i++) {
      const d = Math.sqrt(i * i + j * j);
      if (d > R + 0.9) continue;
      if (d > R - 0.1) { px(x + i, y + j, K.ink); continue; }
      const t = (-i - j) / (d * 1.4142 + 1e-6);
      if (d > r + 0.5) { px(x + i, y + j, t > 0.62 ? K.bHi : t > 0.05 ? K.b2 : t > -0.55 ? K.b1 : K.b0); continue; }
      px(x + i, y + j, d > r - 0.9 ? (t > 0.1 ? K.ink : K.dial2) : face);
    }
  }
  function ticks(x, y, r, a0, a1, n, len, c, every = 1, len2 = len) {
    for (let k = 0; k <= n; k++) {
      const a = a0 + (a1 - a0) * k / n, L = k % every === 0 ? len : len2;
      const [xa, ya] = pol(x, y, a, r - 1), [xb, yb] = pol(x, y, a, r - 1 - L);
      line(xa, ya, xb, yb, k % every === 0 ? c : K.dim);
    }
  }
  function arc(x, y, r, a0, a1, c) { for (let a = a0; a <= a1; a += 0.5 / r) { const [xa, ya] = pol(x, y, a, r); px(Math.round(xa), Math.round(ya), c); } }
  function needle(x, y, a, len, c = K.needle, tail = 0) {
    const [xb, yb] = pol(x, y, a, len), [xt, yt] = pol(x, y, a + Math.PI, tail);
    line(xt + 1, yt + 1, xb + 1, yb + 1, K.ink);
    line(xt, yt, xb, yb, c);
  }
  function cap(x, y) { disc(x, y, 2, K.b1); px(x - 1, y - 1, K.bHi); px(x, y, K.b2); }
  function plate(x, y, w, h) {
    rect(x, y, w, h, K.plate);
    rect(x, y, w, 1, K.plateHi); rect(x, y, 1, h, K.plateHi); rect(x, y + h - 1, w, 1, K.plateLo); rect(x + w - 1, y, 1, h, K.plateLo);
    px(x, y, K.p1); px(x + w - 1, y, K.p1); px(x, y + h - 1, K.p1); px(x + w - 1, y + h - 1, K.p1);
    for (let j = 2; j < h - 2; j++) for (let i = 2; i < w - 2; i++) { const r = hash(x + i, y + j); if (r > 0.965) px(x + i, y + j, K.plateHi); else if (r < 0.05) px(x + i, y + j, K.p2); }
    for (const [sx, sy] of [[4, 4], [w - 5, 4], [4, h - 5], [w - 5, h - 5]]) { px(x + sx, y + sy, K.b1); px(x + sx - 1, y + sy - 1, K.bHi); px(x + sx + 1, y + sy + 1, K.plateLo); }
  }

  // gauge positions (set in layout)
  let G = {};
  // Expanded high-speed sector; preserve extra needle travel for approach speeds.
  const asiA=v=>type==='rv8a'?rad(-140+280*Math.min(360,v)/360):rad(-140+Math.min(800,v)*.21+Math.max(0,Math.min(1600,v-800))*.07);
  const panelHeight=fit=>Math.min(Math.max(132,Math.min(158,Math.round(H*.43))),Math.max(66,H-167))+fit[0];
  function windscreenHeight(){
    const fit=CockpitLayouts.shapes[CockpitLayouts.fits[type][0]];
    return (H-panelHeight(fit)-fit[1])/H;
  }
  let glassFit,ringCache;
  function glassLayout(){
    if(glassFit)return glassFit;
    const bottom=Math.round(H*windscreenHeight())-3,top=Math.max(12,Math.round(bottom*.065));
    const half=Math.min(Math.floor(W*.38),Math.ceil(H*.32));
    const aimY=(top+bottom)/2+8;
    // Reserve the heading tape and lower readouts around the widest game ring.
    const widest=Math.max(sight.ring,sight.arc.ring);
    const focal=Math.max(1,Math.min(H/(2*Math.tan(.66)),(half-5)*.86/widest,(bottom-top-32)*.39/widest));
    glassFit={left:(W>>1)-half,right:(W>>1)+half,top,bottom,aimY,fov:2*Math.atan(H/(2*focal))};
    return glassFit;
  }
  const ringSteps=Array.from({length:40},(_,i)=>[Math.cos(i*Math.PI/20),Math.sin(i*Math.PI/20)]);
  function captureContour(cam,axes,slope,project){
    // Once seated, the camera rotates with the aircraft. Only a change of
    // lens, glass layout or selected item changes this projected outline.
    if(cam.wCockpit===1 && ringCache?.fov===cam.fov && ringCache.slope===slope)return ringCache.points;
    const {f,r,u}=axes;
    const points=ringSteps.map(([x,y])=>{
      const a=slope*x,b=slope*y;
      return project(f[0]+a*r[0]+b*u[0],f[1]+a*r[1]+b*u[1],f[2]+a*r[2]+b*u[2]);
    });
    ringCache=cam.wCockpit===1?{fov:cam.fov,slope,points}:null;
    return points;
  }
  function layout() {
    [bank,canopy]=CockpitLayouts.fits[type];
    shape=CockpitLayouts.shapes[bank];
    bareGlass=type==='rv8a'||type==='sail';
    const rgb=fleet[type].color;
    const metal=(level)=>C('#'+rgb.map((v,i)=>Math.round(level*(.52+.65*v)*[.82,1.04,1.13][i]).toString(16).padStart(2,'0')).join(''));
    K.p1=metal(39);K.p2=metal(46);K.plate=metal(53);K.plateHi=metal(83);
    cx = W >> 1; PH=panelHeight(shape); y0 = H - PH; wide = W >= 392;
    const span=Math.min(shape[3],cx-8);
    stations=(CockpitLayouts.banks[bank]||[]).map(([kind,offset,width])=>{
      const half=Math.round(width*span),x=cx+Math.round(offset*span);
      const y=y0+(bank==='pod'?14:18)+(bank==='portrait'&&offset!==0?13:0);
      const height=Math.min(PH-(y-y0)-18,bank==='pod'?58:82);
      return {kind,x,y,half,height,r:Math.min(half-5,(height>>1)-5,28)};
    });
    crest=Math.max(0,shieldY(cx));solid=Math.max(0,Math.min(H,shieldY(0)+1));
    dirtyLeft=Math.max(0,Math.min(cx-(bank==='six'?(wide?190:90):span),glassLayout().left)-3);dirtyRight=W-dirtyLeft;
    G = {
      asi: [cx - 60, y0 + 50, 21], ai: [cx, y0 + 50, 26], alt: [cx + 60, y0 + 50, 21],
      tc: [cx - 52, y0 + 106, 16], hi: [cx, y0 + 106, 18], vsi: [cx + 52, y0 + 106, 16],
      scope: [cx - 144, y0 + 62, 30], tach: [cx + 123, y0 + 42, 13], thr: [cx + 161, y0 + 42, 13], clock: [cx + 122, y0 + 84, 10],
      lamps: [cx + 146, y0 + 74], lever: [cx + 162, y0 + 90],
    };
  }
  const shieldY = x => { const t = (x - cx) / (W / 2), d = Math.abs(x - cx); const u=Math.min(1,Math.max(0,(d-shape[2])/46));return Math.round(y0+10*t*t-shape[1]*(1+Math.cos(u*Math.PI))*.5); };

  function buildFrame() {
    T = frame; frame.fill(0);
    // sheen on the canopy
    for (let y = 0; y < y0 + 12; y++) for (let x = 0; x < W; x++) {
      const d = (x + y * 0.62) / W;
      const band = (d > 0.20 && d < 0.235) || (d > 0.26 && d < 0.272) || (d > 1.02 && d < 1.07) || (d > 1.10 && d < 1.118);
      if (band) frame[y * W + x] = C('#fff2d0', 26);
    }
    // canopy bow
    for (let x = 0; x < W; x++) {
      const t = Math.abs((x - cx) / (W / 2));
      const yb = Math.round(canopy==='clear'?2+3*t**6:canopy==='split'?5+13*t*t:canopy==='bubble'?2+7*t**4:canopy==='facet'?4+Math.max(0,t-.54)*58:canopy==='hoop'?7+36*t**3:canopy==='brace'?5+12*t:9+17*t*t);
      for (let y = 0; y <= yb; y++) px(x, y, y < 3 ? K.f0 : y > yb - 1 ? K.ink : y > yb - 2 ? K.fHi : y > yb - 4 ? K.f2 : K.f1);
      if ((x - cx) % 26 === 0) { px(x, yb - 6, K.fHi); px(x, yb - 5, K.f0); }
    }
    // side rails
    for (let y = 0; y < H; y++) {
      const k = Math.min(1, y / Math.max(1,y0)), w = Math.round(canopy==='bubble'?3+13*k*k:canopy==='facet'?6+29*k:canopy==='brace'?5+20*k:9+30*Math.pow(k,1.25));
      for (let i = 0; i <= w; i++) {
        const c = i > w - 1 ? K.ink : i > w - 2 ? K.fHi : i > w - 5 ? K.f2 : i < 3 ? K.f0 : K.f1;
        px(i, y, c); px(W - 1 - i, y, i > w - 1 ? K.ink : i > w - 2 ? K.f2 : i > w - 5 ? K.f1 : K.f0);
      }
      if (y % 22 === 11) { px(w - 8, y, K.fHi); px(w - 8, y + 1, K.f0); px(W - 1 - w + 8, y, K.f2); px(W - 1 - w + 8, y + 1, K.ink); }
    }
    if(canopy==='brace'||canopy==='facet'||canopy==='split'){
      for(const side of [-1,1]){
        const a=cx+side*Math.round(cx*(canopy==='split'?.28:canopy==='brace'?.55:.77)),b=cx+side*(cx-11);
        const end=canopy==='brace'?y0+2:Math.round(y0*.52);
        for(let i=-2;i<=2;i++)line(a+i,4,b+i,end,i===-2?K.fHi:i===2?K.ink:K.f1);
      }
    }
  }

  function buildPanel() {
    T = panel; panel.fill(0);
    for (let x = 0; x < W; x++) {
      const ys = shieldY(x);
      for (let y = ys; y < H; y++) {
        const d = y - ys; let c;
        if (d === 0) c = K.lHi;
        else if (d === 1) c = K.l2;
        else if (d < 8) c = (d === 4 && x % 6 === 0) ? K.l2 : K.l1;
        else if (d === 8) c = K.l0;
        else if (d === 9) c = K.ink;
        else if (d < 13) c = K.p0;
        else { const r = hash(x, y); c = r > 0.975 ? K.p2 : r < 0.04 ? K.p0 : K.p1; if (y > H - 10 && ((x + y) & 1)) c = K.p0; }
        px(x, y, c);
      }
    }
    const stencil=({viggen:'SAAB 37',hornet:'F/A-18C',mig21:'MIG-21',f15:'F-15C',m2000:'2000C',f5:'F-5E',f4:'F-4C',f16:'F-16A',f22:'F-22A',su27:'SU-27',j10:'J-10',j16:'J-16',j20:'J-20',rv8a:'RV-8A'})[type]||type.toUpperCase();
    const tagW=textW(stencil)+9,tagY=y0+6;
    rect(cx-(tagW>>1),tagY-1,tagW,8,K.plateLo);text(stencil,cx-(textW(stencil)>>1),tagY,K.tick);
    if(bank!=='six'){buildBank();return;}
    // centre plate with the six flight instruments
    plate(cx - 90, y0 + 16, 181, PH - 20);
    let [x, y, r] = G.asi; bezel(x, y, r);
    const civil=type==='rv8a';
    arc(x,y,r-1,asiA(civil?100:300),asiA(civil?240:800),K.arcG);
    arc(x,y,r-1,asiA(civil?240:800),asiA(civil?300:1100),K.arcY);
    arc(x,y,r-1,asiA(civil?320:2100),asiA(civil?356:2380),K.arcR);
    for(let v=0;v<=(civil?360:2400);v+=civil?20:v<800?100:200){
      const a=asiA(v),edge=pol(x,y,a,r-1),inner=pol(x,y,a,r-(v%400===0?5:3));line(...edge,...inner,K.tick);
    }
    for (const v of civil?[0,90,180,270,360]:[0,400,800,1600,2400]) { const lab = String(v/(civil?10:100)), [tx, ty] = pol(x, y, asiA(v), r - 10); text(lab, Math.round(tx) - (textW(lab) >> 1), Math.round(ty) - 2, K.tick); }
    [x, y, r] = G.alt; bezel(x, y, r);
    ticks(x, y, r, 0, Math.PI * 2, 50, 4, K.tick, 5, 1);
    for (let k = 0; k < 10; k++) { const [tx, ty] = pol(x, y, k / 10 * Math.PI * 2, r - 8); text(k, Math.round(tx) - 1, Math.round(ty) - 2, k % 5 === 0 ? K.tick : K.dim); }
    [x, y, r] = G.ai; bezel(x, y, r);
    for (const d of [-60, -30, -20, -10, 0, 10, 20, 30, 60]) { const [xa, ya] = pol(x, y, rad(d), r - 1), [xb, yb] = pol(x, y, rad(d), r - (d % 30 === 0 ? 4 : 3)); line(xa, ya, xb, yb, d === 0 ? K.needle : K.tick); }
    [x, y, r] = G.tc; bezel(x, y, r);
    for (const d of [-90, -70, 70, 90]) { const [xa, ya] = pol(x, y, rad(d), r - 1), [xb, yb] = pol(x, y, rad(d), r - 4); line(xa, ya, xb, yb, K.tick); }
    rect(x - 9, y + 8, 19, 5, K.ink); rect(x - 8, y + 9, 17, 3, K.dial2); rect(x - 2, y + 8, 1, 5, K.dim); rect(x + 2, y + 8, 1, 5, K.dim);
    [x, y, r] = G.hi; bezel(x, y, r);
    [x, y, r] = G.vsi; bezel(x, y, r);
    ticks(x, y, r, rad(-90 - 120), rad(-90 + 120), 12, 4, K.tick, 3, 2);
    arc(x, y, r - 1, rad(-90 + 80), rad(-90 + 120), K.arcG); arc(x, y, r - 1, rad(-90 - 120), rad(-90 - 80), K.arcY);
    text('0', x - 10, y - 2, K.tick);
    if (wide) {
      plate(cx - 190, y0 + 22, 93, PH - 30);
      [x, y, r] = G.scope; bezel(x, y, r, K.a0);
      for (const kx of [cx - 164, cx - 124]) { disc(kx, y0 + 112, 5, K.ink); disc(kx, y0 + 112, 4, K.f2); disc(kx - 1, y0 + 111, 2, K.fHi); px(kx, y0 + 108, K.white); }
      rect(cx - 152, y0 + 108, 17, 9, K.ink); rect(cx - 151, y0 + 109, 15, 7, K.a0);
      plate(cx + 98, y0 + 22, 93, PH - 30);
      [x, y, r] = G.tach; bezel(x, y, r); ticks(x, y, r, rad(-130), rad(130), 8, 3, K.tick, 2, 2); arc(x, y, r - 1, rad(95), rad(130), K.arcR);
      [x, y, r] = G.thr; bezel(x, y, r); ticks(x, y, r, rad(-130), rad(130), 8, 3, K.tick, 4, 2); arc(x, y, r - 1, rad(40), rad(130), K.arcY);
      [x, y, r] = G.clock; bezel(x, y, r, C('#efe3c6')); for (let k = 0; k < 12; k++) { const [tx, ty] = pol(x, y, k / 12 * Math.PI * 2, r - 2); px(Math.round(tx), Math.round(ty), K.ink); }
      // throttle slot
      const [lx, ly] = G.lever; rect(lx - 4, ly - 2, 9, 40, K.ink); rect(lx - 3, ly - 1, 7, 38, K.p0); rect(lx - 1, ly + 1, 3, 34, K.dial);
      for (let k = 0; k < 5; k++) { px(lx - 6, ly + 3 + k * 7, K.dim); px(lx + 6, ly + 3 + k * 7, K.dim); }
      // lamp sockets
      const [mx, my] = G.lamps; for (let k = 0; k < 3; k++) disc(mx + k * 11 - 16, my + 34, 4, K.ink);
    }
  }

  const panelInk=C('#0e1b23'),screenInk=C('#112a31'),phosphor=C('#a2e5cd'),muted=C('#528b88');
  const dialLabels={dialSpeed:'SPD',dialClimb:'V/S',dialAltitude:'ALT'};
  FONT['/']='001001010100100';FONT['I']='111010010010111';FONT['V']='101101101101010';
  FONT['+']='000010111010000';FONT['H']='101101111101101';
  Object.assign(FONT,{J:'001001001101111',K:'101110100110101',Y:'101101010010010',Q:'111101101111001',Z:'111001010100111'});
  function buildBank(){
    for(const {kind,x,y,half,height,r} of stations){
      const left=x-half,width=2*half+1,mid=y+(height>>1);
      plate(left,y,width,height);
      if(dialLabels[kind]){
        bezel(x,mid,r);ticks(x,mid,r,rad(-135),rad(135),18,4,K.tick,3,2);
        text(dialLabels[kind],x-5,mid+(r>>1),K.dim);
      }else{
        rect(left+3,y+3,width-6,height-6,panelInk);
        rect(left+6,y+6,width-12,height-12,screenInk);
        if(kind==='engine'&&width<34)text('P',x-1,y+9,phosphor);
        else text(({attitude:'ATT',air:'AIR DATA',engine:'PWR',panorama:'FLIGHT'})[kind],left+9,y+9,phosphor);
        for(let i=left+12;i<x+half-6;i+=14)rect(i,y+height-4,5,2,K.b1);
      }
    }
    const span=Math.min(shape[3],cx-8),left=cx-span+5,right=cx+span-5;
    for(const side of [-1,1]){
      const width=Math.min(47,cx-span-13);
      if(width<18)continue;
      const x=side<0?cx-span-width-5:cx+span+5,y=y0+29;
      plate(x,y,width,49);rect(x+4,y+5,width-8,19,K.p0);
      for(let row=y+7;row<y+23;row+=3)rect(x+6,row,width-12,1,K.plateHi);
      const knob=x+(width>>1);disc(knob,y+35,7,K.ink);disc(knob,y+35,5,K.b1);
      line(knob,y+35,knob+side*2,y+31,K.bHi);
    }
    // Embossed sill, annunciators, and unit legend below the instrument bank.
    const y=H-13;
    rect(left,y-2,right-left+1,1,K.lHi);text('SPD KM/H',left+3,y+2,K.tick);
    text('ALT M',right-22,y+2,K.tick);
    text('GEAR',cx-32,y+2,K.dim);text('STALL',cx+5,y+2,K.dim);
  }
  function attitude(x,y,w,h,S){
    const midX=x+(w>>1),midY=y+(h>>1),cs=Math.cos(S.roll),sn=Math.sin(S.roll);
    const pitch=Math.max(-2*h,Math.min(2*h,S.pitch*h));
    rect(x,y,w,h,K.gnd2);
    for(let row=0;row<h;row++){
      const level=pitch-(y+row-midY)*cs;
      if(Math.abs(sn)<.0001){if(level>0)T.fill(K.sky2,(y+row)*W+x,(y+row)*W+x+w);continue;}
      const cut=Math.max(0,Math.min(w,Math.ceil(midX-x+level/sn)));
      const start=sn>0?0:cut,end=sn>0?cut:w;
      T.fill(K.sky2,(y+row)*W+x+start,(y+row)*W+x+end);
    }
    CL=[x,y,x+w-1,y+h-1];
    const len=w+h,ax=midX+pitch*sn,ay=midY+pitch*cs;
    line(ax-len*cs,ay+len*sn,ax+len*cs,ay-len*sn,K.white);
    for(let step=-3;step<=3;step++){
      if(!step)continue;
      const d=step*h*.18,u=ax+d*sn,v=ay+d*cs,bar=step%2?4:8;
      line(u-bar*cs,v+bar*sn,u+bar*cs,v-bar*sn,K.tick,step>0?2:0);
    }
    for(const deg of [-45,-30,0,30,45]){
      const a=rad(deg);line(midX+Math.sin(a)*15,y+16-Math.cos(a)*15,midX+Math.sin(a)*12,y+16-Math.cos(a)*12,K.tick);
    }
    rect(midX-10,midY,8,2,K.amber);rect(midX+3,midY,8,2,K.amber);px(midX,midY+2,K.amber);
    CL=null;
  }
  function drawBank(S,oy){
    for(const {kind,x,y:base,half,height,r} of stations){
      const y=base+oy,left=x-half+9,right=x+half-8,mid=y+(height>>1);
      if(y>H-1)continue;
      if(dialLabels[kind]){
        const angle=kind==='dialSpeed'?Math.min(1,S.speed*3.6/(type==='sail'?260:1600))*270-135:
          kind==='dialClimb'?Math.max(-1,Math.min(1,S.vs/(type==='sail'?12:100)))*130:(S.pos[1]%1000)*.36;
        needle(x,mid,rad(angle),r-4,K.needle,3);cap(x,mid);continue;
      }
      if(kind==='attitude'||kind==='panorama'){
        const pad=kind==='panorama'?Math.round((right-left)*.22):0;
        const top=y+19,bottom=Math.min(H,y+height-10);
        if(bottom>top)attitude(left+pad,top,right-left-2*pad+1,bottom-top,S);
        if(kind==='panorama'){
          const labels=[['SPD',Math.round(S.speed*3.6)],['ALT',Math.round(S.pos[1])]];
          for(let i=0;i<2;i++){const sx=i?right-pad+5:left;
            text(labels[i][0],sx,top+3,muted);text(labels[i][1],sx,mid,phosphor);
            const tape=Math.round((i?S.pos[1]*.1:S.speed*3.6))%6;
            for(let d=-2;d<=2;d++)rect(i?sx+pad-12:sx,mid+6*d-tape+3,i?4:3,1,muted);
          }
          const hdg=String((Math.round(S.yaw*180/Math.PI)+360)%360).padStart(3,'0');
          text('HDG '+hdg,x-13,y+9,phosphor);
        }
      }else if(kind==='air'){
        const rows=[['SPD',Math.round(S.speed*3.6)],['ALT',Math.round(S.pos[1])],['V/S',Math.round(S.vs)]];
        const gap=Math.floor((height-25)/3);
        rows.forEach(([label,value],i)=>{const yy=y+19+i*gap;
          if(right-left>35)text(label,left,yy,muted);text(value,right-textW(value),yy,phosphor);});
      }else{
        const h=height-36,bar=Math.max(1,Math.min(7,Math.floor((2*half-10)/2))),baseY=y+height-10;
        for(const [i,v] of [S.engine,S.throttle].entries()){
          const sx=x-bar-1+i*(bar+2),n=Math.round(h*Math.max(0,Math.min(1,v)));
          rect(sx,baseY-h,bar,h,K.greenDk);rect(sx,baseY-n,bar,n,i?muted:phosphor);
        }
      }
    }
    const y=H-10+oy;
    rect(cx-13,y,5,3,S.gear>.95?K.green:K.greenDk);rect(cx+28,y,5,3,S.stalled?K.red:K.redDk);
  }
  function resize(canvas,w,h){
    W=w;H=h;ctx=canvas.getContext('2d');ready=false;drawn=false;glassFit=ringCache=null;
  }
  function select(next){
    if(type!==next){type=next;ready=false;glassFit=ringCache=null;}
  }
  function prepare(){
    if(ready)return;
    if(!img||img.width!==W||img.height!==H){
      img=ctx.createImageData(W,H);out=new Uint32Array(img.data.buffer);
      panel=new Uint32Array(W*H);frame=new Uint32Array(W*H);steadyPanel=new Uint32Array(W*H);
    }
    layout();buildFrame();buildPanel();
    radarTime=-1;lastOffset=steadyOffset=NaN;ready=true;
    if(bank==='six'&&wide&&!mapLines.length){
      const r=G.scope[2]-1;
      mapPalette.push(K.a0,K.a1,K.a2,K.a3,K.a4);
      for(let j=-r;j<=r;j++){
        const edge=Math.floor(Math.sqrt(r*r+r*.8-j*j)),size=2*edge+1;
        const angle=new Float32Array(size),ring=new Uint8Array(size);
        for(let n=0;n<size;n++){
          const i=n-edge,d=Math.hypot(i,j);
          angle[n]=Math.atan2(i,-j)/(2*Math.PI);
          ring[n]=Math.abs(d-10)<.5||Math.abs(d-20)<.5;
        }
        mapLines.push({j,edge,angle,ring,pixels:new Uint32Array(size)});
      }
    }
  }

  // ── head-up display: collimated, so the ladder sits on the real horizon ──
  function hud(S, env, oy, glass) {
    const room=env.room,combat=room?.combat && room.self;
    if(bareGlass){
      if(!glass){
        const y=y0+5+oy,left=cx-64,right=cx+26;
        text('SPD '+Math.round(S.speed*3.6),left,y,K.tick);text('ALT '+Math.round(S.pos[1]),right,y,K.tick);
        if(S.stalled||S.agl<60&&S.vs< -4)text(S.stalled?'STALL':'PULL UP',cx-13,y-9,K.hudWarn);
      }
      if(glass || !combat)return;
    }
    const fit=glassLayout(),hx0=fit.left,hx1=fit.right,hy1=fit.bottom+oy,hy0=fit.top+oy;
    if(glass){
      for(let y=Math.max(0,hy0);y<=Math.min(H-1,hy1);y++)for(let x=hx0;x<=hx1;x++){
        const pixel=y*W+x;if(!T[pixel])T[pixel]=K.glass;
      }
      rect(hx0,hy0,hx1-hx0+1,1,K.glassEdge);
      for(const xx of [hx0-2,hx1+1]){
        rect(xx,hy0+6,2,hy1-hy0-4,K.f0);rect(xx+(xx<cx?1:0),hy0+6,1,hy1-hy0-4,K.f2);
        px(xx,hy0+5,K.fHi);px(xx+1,hy0+5,K.fHi);
      }
      return;
    }
    const cam = env.cam, B = cam.B, tanF = Math.tan(cam.fov / 2), sc = H / 2 / tanF, g = K.hud;
    const projectDirection = (d0,d1,d2) => {
      const zc = d0 * B.f[0] + d1 * B.f[1] + d2 * B.f[2]; if (zc < 0.25) return null;
      return [W / 2 + (d0 * B.r[0] + d1 * B.r[1] + d2 * B.r[2]) / zc * sc, H / 2 - (d0 * B.u[0] + d1 * B.u[1] + d2 * B.u[2]) / zc * sc];
    };
    const proj=(az,el)=>{const ce=Math.cos(el);return projectDirection(Math.sin(az)*ce,Math.sin(el),-Math.cos(az)*ce);};
    CL = [hx0 + 2, hy0 + 16, hx1 - 2, hy1 - 2];
    function drawAim(){
      CL=[hx0+2,hy0+16,hx1-2,hy1-2];
      const axes=env.basis;
      const n=axes?projectDirection(...axes.f):proj(S.yaw,S.pitch);
      if(n){
        const nx=Math.round(n[0]),ny=Math.round(n[1]);
        arc(nx,ny,3,0,Math.PI*2,g);rect(nx-9,ny,5,1,g);rect(nx+5,ny,5,1,g);rect(nx,ny-6,1,3,g);
      }
      const ring=combat && sight.reticle(room.weapon);
      if(axes && ring){
        const charge=(room.weapon==='laser'||room.weapon==='arc')?Math.floor(room.self.lock*100):room.marks.get(room.target)||0;
        const point=room.weapon==='arc' && room.peers.get(room.target)?.displayPos;
        const aligned=room.weapon==='arc' && point && sight.inRing({pos:S.pos,basis:axes},point,ring.ring,ring.reach);
        const color=charge>=100?K.hudWarn:charge||aligned?K.hud:K.tick;
        const points=captureContour(cam,axes,ring.ring,projectDirection);
        for(const offset of [1,0]){
          let previous=points[points.length-1];
          for(const point of points){
            if(point && previous)line(previous[0],previous[1]+offset,point[0],point[1]+offset,offset?K.plateLo:color);
            previous=point;
          }
        }
        if(charge){const label=charge>=100?'LOCK':charge+'%';text(label,cx-(textW(label)>>1),hy1-9,color);}
      }
    }
    if(bareGlass){drawAim();CL=null;return;}
    // pitch ladder
    for (let e = -80; e <= 80; e += 10) {
      const el = rad(e), a0 = rad(e === 0 ? 3.2 : 2.6), a1 = rad(e === 0 ? 17 : 8.5);
      for (const sgn of [-1, 1]) {
        const p = proj(S.yaw + sgn * a0, el), q = proj(S.yaw + sgn * a1, el);
        if (!p || !q) continue;
        line(p[0], p[1], q[0], q[1], g, e < 0 ? 2 : 0);
        if (e !== 0) { const t = proj(S.yaw + sgn * a1, el - Math.sign(e) * rad(1.6)); if (t) line(q[0], q[1], t[0], t[1], g); }
        if (e !== 0 && sgn > 0) text(Math.abs(e), Math.round(q[0]) + 3, Math.round(q[1]) - 2, g);
      }
    }
    CL = [hx0 + 1, hy0 + 1, hx1 - 1, hy1 - 1];
    // heading tape
    let hd = (S.yaw * 180 / Math.PI) % 360; if (hd < 0) hd += 360;
    const names = ['N', '03', '06', 'E', '12', '15', 'S', '21', '24', 'W', '30', '33'];
    for (let b = 0; b < 360; b += 10) {
      const d = ((b - hd + 540) % 360) - 180, xx = Math.round(cx + d * 1.3);
      if (xx < hx0 + 6 || xx > hx1 - 6) continue;
      if (b % 30 === 0) { const nm = names[b / 30]; text(nm, xx - (textW(nm) >> 1), hy0 + 3, g); rect(xx, hy0 + 10, 1, 3, g); } else rect(xx, hy0 + 11, 1, 2, g);
    }
    px(cx, hy0 + 14, g); rect(cx - 1, hy0 + 15, 3, 1, g); rect(cx - 2, hy0 + 16, 5, 1, g);
    // speed, height and the small print
    const my = W<H || hx1-hx0<155?hy1-24:Math.round((hy0+hy1)/2)+6;
    const box = (x, s, label) => { const w = 23; rect(x, my - 3, w, 1, g); rect(x, my + 7, w, 1, g); rect(x, my - 3, 1, 11, g); rect(x + w - 1, my - 3, 1, 11, g); text(s, x + w - 3 - textW(s), my, g); text(label, x + 1, my - 10, g); };
    box(hx0 + 4, String(Math.round(S.speed * 3.6)), 'SPD');
    box(hx1 - 26, String(Math.round(S.pos[1] / 10) * 10), 'ALT');
    text('G ' + S.g.toFixed(1), hx0 + 5, hy1 - 9, g);
    const ragl = Math.round(S.agl / 10) * 10; if (ragl < 2000) { const s = 'R ' + ragl; text(s, hx1 - 4 - textW(s), hy1 - 9, g); }
    if (S.boost > 0.3) text('AB', hx0 + 5, my + 11, K.hudWarn);
    if (S.agl < 60 && S.vs < -4 && (S.time * 3 % 1) < 0.6) { const s = 'PULL UP'; text(s, cx - (textW(s) >> 1), hy1-19, K.hudWarn); }
    else if(S.stalled)text('STALL',cx-10,hy1-19,K.hudWarn);
    drawAim();CL = null;
  }

  function draw(k, S, inp, env) {
    if (!ctx) return;
    if (k <= 0.001) { if (drawn) { ctx.clearRect(0, 0, W, H); drawn = false;lastOffset=NaN; } return; }
    prepare();
    drawn = true;
    const e = k * k * (3 - 2 * k), slide = Math.max(0, Math.min(1, (e - 0.35) / 0.65));
    const jolt = Math.round(Math.max(-2, Math.min(3, (S.g - 1) * 2.2)) + (S.shake > 0.3 ? Math.sin(S.time * 57) * 0.9 * S.shake : 0));
    const oy = Math.round((1 - slide * slide * (3 - 2 * slide)) * (PH + 16)) + (slide >= 1 ? jolt : 0);
    const fy = Math.round((1 - slide) * 34);
    const seated=k===1,partial=seated&&lastOffset===oy;
    if(!seated||steadyOffset!==oy){
      out.fill(0);out.set(frame.subarray(fy*W));
      // Only the coaming has transparent gaps. Copy the solid rows in one block.
      const start=Math.max(0,crest,-oy),end=Math.min(solid,H-oy);
      for(let y=start;y<end;y++)for(let x=0;x<W;x++){
        const c=panel[y*W+x];if(c)out[(y+oy)*W+x]=c;
      }
      const first=Math.max(solid,-oy),last=Math.min(H,H-oy);
      if(last>first)out.set(panel.subarray(first*W,last*W),(first+oy)*W);
      // Under negative g the bottom edge of the translated panel is still cockpit.
      if(oy<0)out.fill(K.p0,(H+oy)*W);
      T=out;if(slide>.5)hud(S,env,oy,true);
      if(seated){steadyPanel.set(out);steadyOffset=oy;}
    }else out.set(steadyPanel);
    T=out;
    if(k>.985)hud(S,env,oy,false);
    if(bank==='six')drawSix(S,env,oy);
    else drawBank(S,oy);
    if(partial){
      const top=Math.max(0,glassLayout().top+oy);
      ctx.putImageData(img,0,0,dirtyLeft,top,dirtyRight-dirtyLeft,H-top);
    }else ctx.putImageData(img,0,0);
    lastOffset=seated?oy:NaN;
  }
  function drawSix(S,env,oy){
    const roll = S.roll;

    // ── airspeed ──
    let [x, y, r] = G.asi; y += oy;
    needle(x, y, asiA(S.speed * 3.6), r - 4, K.needle, 4); cap(x, y);
    // ── altimeter ──
    [x, y, r] = G.alt; y += oy;
    const altM = Math.max(0, S.pos[1]);
    rect(x - 9, y + 6, 19, 7, K.ink); text(String(Math.round(altM / 10) * 10).padStart(4, '0'), x - 7, y + 7, K.a3);
    needle(x, y, altM / 10000 * Math.PI * 2, r - 11, K.white, 2);
    needle(x, y, (altM % 1000) / 1000 * Math.PI * 2, r - 4, K.needle, 4); cap(x, y);
    // ── artificial horizon ──
    [x, y, r] = G.ai; y += oy;
    {
      const rb = r - 5, c = Math.cos(roll), s = Math.sin(roll), pp = S.pitch * rb / 0.62, rr = rb * rb + rb * 0.8;
      for (let j = -rb; j <= rb; j++) for (let i = -rb; i <= rb; i++) {
        if (i * i + j * j > rr) continue;
        const el = -i * s - j * c + pp, al = i * c - j * s;
        let col = el > 0 ? (el > rb * 0.75 ? K.sky2 : K.sky) : (el < -rb * 0.75 ? K.gnd2 : K.gnd);
        if (Math.abs(el) < 0.62) col = K.white;
        else { const q = el / 6.3, n = Math.round(q); if (n !== 0 && Math.abs(n) <= 3 && Math.abs(q - n) < 0.09 && Math.abs(al) < (n % 2 ? 4 : 7)) col = K.white; }
        px(x + i, y + j, col);
      }
      // sky pointer on the bank scale
      const [tx, ty] = pol(x, y, -roll, rb - 1); px(Math.round(tx), Math.round(ty), K.needle);
      const [ux, uy] = pol(x, y, -roll, rb - 2); px(Math.round(ux), Math.round(uy), K.needle);
      const [vx, vy] = pol(x, y, -roll, rb - 3); px(Math.round(vx), Math.round(vy), K.white);
      // fixed aircraft symbol
      rect(x - 12, y + 1, 8, 1, K.ink); rect(x + 5, y + 1, 8, 1, K.ink);
      rect(x - 12, y, 8, 1, K.amber); rect(x + 5, y, 8, 1, K.amber); rect(x - 5, y, 1, 3, K.amber); rect(x + 5, y, 1, 3, K.amber);
      rect(x - 1, y - 1, 3, 3, K.ink); px(x, y, K.amber);
    }
    // ── turn and slip ──
    [x, y, r] = G.tc; y += oy;
    {
      const a = Math.max(-1, Math.min(1, S.omega / 1.3)) * rad(34), c = Math.cos(a), s = Math.sin(a);
      line(x - c * 11, y - 2 - s * 11, x + c * 11, y - 2 + s * 11, K.white);
      line(x - c * 4, y - 3 - s * 4, x + c * 4, y - 3 + s * 4, K.white);
      line(x, y - 2, x + s * 5, y - 2 - c * 5, K.white); disc(x, y - 2, 1, K.white);
      const slip = Math.max(-1, Math.min(1, S.slip * 3));
      disc(Math.round(x + slip * 6), y + 10, 1, K.tick);
    }
    // ── heading ──
    [x, y, r] = G.hi; y += oy;
    {
      const names = { 0: 'N', 90: 'E', 180: 'S', 270: 'W' };
      for (let b = 0; b < 360; b += 30) {
        const a = rad(b) - S.yaw;
        const [xa, ya] = pol(x, y, a, r - 1), [xb, yb] = pol(x, y, a, r - (b % 90 === 0 ? 4 : 3));
        line(xa, ya, xb, yb, b % 90 === 0 ? K.tick : K.dim);
        if (names[b]) { const [tx, ty] = pol(x, y, a, r - 9); glyph(names[b], Math.round(tx) - 1, Math.round(ty) - 2, b === 0 ? K.needle : K.tick); }
      }
      px(x, y - r + 1, K.needle); px(x - 1, y - r, K.needle); px(x + 1, y - r, K.needle); px(x, y - r, K.needle);
      rect(x, y - 4, 1, 8, K.amber); rect(x - 4, y - 1, 9, 1, K.amber); rect(x - 2, y + 3, 5, 1, K.amber);
    }
    // ── vertical speed ──
    [x, y, r] = G.vsi; y += oy;
    needle(x, y, rad(-90) + Math.max(-1, Math.min(1, S.vs / 140)) * rad(118), r - 3, K.needle, 3); cap(x, y);

    if (wide) {
      // ── ground-mapping radar ──
      [x, y, r] = G.scope; y += oy;
      {
        const sw=S.time*1.9/(2*Math.PI)%1,dx=30*Math.cos(S.yaw),dz=30*Math.sin(S.yaw);
        const refresh=S.time>=radarTime||S.time<radarTime-.12;
        if(refresh)radarTime=S.time+.09;
        for(const {j,edge,angle,ring,pixels} of mapLines){
          if(refresh){
            let wx=S.pos[0]-dx*edge-dz*j,wz=S.pos[2]-dz*edge+dx*j;
            for(let n=0;n<pixels.length;n++,wx+=dx,wz+=dz){
              const h=env.groundAt(wx,wz),a=sw-angle[n],phase=a-Math.floor(a);
              let lvl=h<0?0:h<60?1.2:h<150?2:2.9;
              lvl+=phase<.03?1.4:phase<.3?.5:phase>.7?-.6:0;
              if(ring[n])lvl+=h<0?.8:-.8;
              lvl+=((n-edge+j)&1)?.25:-.25;
              pixels[n]=mapPalette[Math.max(0,Math.min(4,Math.round(lvl)))];
            }
          }
          if(y+j>=0&&y+j<H)out.set(pixels,(y+j)*W+x-edge);
        }
        px(x, y - 2, K.white); px(x, y - 1, K.white); rect(x - 2, y, 5, 1, K.white); px(x, y + 1, K.white); rect(x - 1, y + 2, 3, 1, K.white);
        text(String(Math.min(9999, Math.round(S.agl))).padStart(4, '0'), cx - 151, y0 + oy + 110, K.a3);
      }
      // ── engines ──
      [x, y, r] = G.tach; y += oy;
      needle(x, y, rad(-130 + 260 * (0.18 + 0.78 * S.engine + Math.sin(S.time * 23) * 0.006)), r - 3, K.needle, 2); cap(x, y);
      [x, y, r] = G.thr; y += oy;
      needle(x, y, rad(-130 + 260 * S.throttle), r - 3, K.needle, 2); cap(x, y);
      [x, y, r] = G.clock; y += oy;
      { const d = new Date(), hh = (d.getHours() % 12 + d.getMinutes() / 60) / 12 * Math.PI * 2, mm = d.getMinutes() / 60 * Math.PI * 2;
        const [hx, hy] = pol(x, y, hh, r - 5), [mx2, my2] = pol(x, y, mm, r - 3); line(x, y, hx, hy, K.ink); line(x, y, mx2, my2, K.ink); px(x, y, K.needle); }
      // throttle lever follows the afterburner
      const [lx, ly0] = G.lever; const ly = ly0 + oy + Math.round(28 - 26 * S.throttle);
      rect(lx - 1, ly, 3, 36 - (ly - ly0 - oy), K.dim); rect(lx - 5, ly - 2, 11, 7, K.ink); rect(lx - 4, ly - 1, 9, 5, K.red); rect(lx - 4, ly - 1, 9, 1, C('#ff9a7a')); rect(lx - 4, ly + 3, 9, 1, K.needleDk);
      // lamps: systems, low height, afterburner
      const [mx, my0] = G.lamps; const my = my0 + oy + 34;
      const lamp = (xx, on, cOn, cOff) => { disc(xx, my, 3, on ? cOn : cOff); if (on) { px(xx - 1, my - 1, K.white); for (const [a, b] of [[-5, 0], [5, 0], [0, -5], [0, 5]]) px(xx + a, my + b, cOn); } };
      lamp(mx - 16, true, K.green, K.greenDk);
      lamp(mx - 5, S.agl < 55 && (S.time * 4 % 1) < 0.6, K.amber, K.amberDk);
      lamp(mx + 6, S.boost > 0.3, K.red, K.redDk);
    }
  }

  // Four rows cover the largest positive panel jolt. Transitions use the whole view.
  function view(fovBoost){
    const fit=glassLayout(),fov=fit.fov+.08*fovBoost;
    const tanDown=(1-2*fit.aimY/H)*Math.tan(fov/2);
    return {fov,tanDown};
  }
  return {resize,select,draw,view,windscreenHeight,coveredRows:()=>ready?Math.max(0,H-solid-4):0};
})(typeof module==='undefined'?Flight.fleet:require('./flight.js').fleet,typeof module==='undefined'?Sight:require('./sight.js'));
if(typeof module==='undefined')window.Cockpit=Cockpit;else module.exports=Cockpit;
