function createLakeTerrain() {
const WORLD = {
  N: 2048,          // height texels per side
  CELL: 40,          // world units per texel
  L: 2048 * 40,      // tile size in world units
  HMIN: -96, HSPAN: 512,   // height encoding range
  CN: 512,          // cloud map texels per side
  // horizontal direction the sunlight travels (x east, z south): from north-west
  E1: [0.7474, 0.6644],
  SUN_TAN: Math.tan(27 * Math.PI / 180),
};
WORLD.LC = 5120;                      // cloud tile, commensurate with the land tile
WORLD.E2 = [-WORLD.E1[1], WORLD.E1[0]];

function hash2i(ix, iy, s) {
  let h = Math.imul(ix, 0x27d4eb2d) ^ Math.imul(iy, 0x165667b1) ^ s;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

const GX = new Float32Array(16), GY = new Float32Array(16);
for (let i = 0; i < 16; i++) { GX[i] = Math.cos(i / 16 * Math.PI * 2); GY[i] = Math.sin(i / 16 * Math.PI * 2); }

// periodic gradient noise, x,y in lattice units, period P (integer)
function pnoise(x, y, P, s) {
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const fx = x - x0, fy = y - y0;
  const xa = ((x0 % P) + P) % P, ya = ((y0 % P) + P) % P;
  const xb = xa + 1 === P ? 0 : xa + 1, yb = ya + 1 === P ? 0 : ya + 1;
  const u = fx * fx * fx * (fx * (fx * 6 - 15) + 10), v = fy * fy * fy * (fy * (fy * 6 - 15) + 10);
  const g00 = hash2i(xa, ya, s) & 15, g10 = hash2i(xb, ya, s) & 15;
  const g01 = hash2i(xa, yb, s) & 15, g11 = hash2i(xb, yb, s) & 15;
  const n00 = GX[g00] * fx + GY[g00] * fy;
  const n10 = GX[g10] * (fx - 1) + GY[g10] * fy;
  const n01 = GX[g01] * fx + GY[g01] * (fy - 1);
  const n11 = GX[g11] * (fx - 1) + GY[g11] * (fy - 1);
  const a = n00 + (n10 - n00) * u, b = n01 + (n11 - n01) * u;
  return (a + (b - a) * v) * 1.5;
}

function fbm(u, v, P, oct, gain, s) {
  let a = 1, sum = 0, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += a * pnoise(u * P, v * P, P, s + o * 131);
    norm += a; a *= gain; P *= 2;
  }
  return sum / norm;
}

function ridged(u, v, P, oct, s) {
  let a = 1, sum = 0, norm = 0, w = 1;
  for (let o = 0; o < oct; o++) {
    let n = 1 - Math.abs(pnoise(u * P, v * P, P, s + o * 71));
    n *= n; n *= w; w = Math.min(1, Math.max(0, n * 1.6));
    sum += a * n; norm += a; a *= 0.5; P *= 2;
  }
  return sum / norm;
}

// periodic cellular noise: 1 at feature points, falling to 0 between them
function worley(u, v, P, s) {
  const x = u * P, y = v * P, x0 = Math.floor(x), y0 = Math.floor(y);
  let best = 9;
  for (let j = -1; j <= 1; j++) for (let i = -1; i <= 1; i++) {
    const cx = x0 + i, cy = y0 + j;
    const h = hash2i(((cx % P) + P) % P, ((cy % P) + P) % P, s);
    const px = cx + (h & 1023) / 1023, py = cy + ((h >>> 10) & 1023) / 1023;
    const d = (px - x) * (px - x) + (py - y) * (py - y);
    if (d < best) best = d;
  }
  return Math.max(0, 1 - Math.sqrt(best));
}

const sstep = (a, b, x) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

function relief(u, v) {
  const wx = fbm(u, v, 3, 3, 0.5, 11), wy = fbm(u, v, 3, 3, 0.5, 47);
  const uu = u + 0.045 * wx, vv = v + 0.045 * wy;
  const c = fbm(uu, vv, 6, 8, 0.52, 901);                   // continents, lakes and islands
  const m = sstep(-0.30, 0.16, fbm(uu + 0.37, vv + 0.11, 3, 3, 0.5, 333)); // where the ranges are
  const r = ridged(uu, vv, 12, 5, 5150);
  let h = (c + 0.035) * 185;
  if (h > 0) {
    const inland = sstep(4, 55, h);
    h += inland * m * (r * r * 225 + r * 48);
    h += inland * (1 - m) * r * 32;
    if (h < 9) h = 9 * Math.pow(h / 9, 1.7);                 // flatten the beaches
  } else {
    h *= 0.9;
  }
  return h;
}

// Preserve the original central lake. Outside the basin, a separate, longer-wavelength
// coastline and a second ridge field fill the periodic 40.96 km survey square.
function innerBasin(u,v){
  const du=u-Math.round(u),dv=v-Math.round(v);
  const outer=sstep(.103,.160,Math.max(Math.abs(du),Math.abs(dv)));
  // Match the sample centers of the former 5 m central grid.
  const align=(WORLD.CELL-5)/(2*10240);
  if(!outer)return relief(4*u+align,4*v+align);
  const shelf=relief(u+.27,v+.47);
  const hills=ridged(du*3+.27,dv*3+.47,9,3,2360);
  const rim=Math.min(401,shelf*(shelf>0?1.32:1)+sstep(0,45,shelf)*hills*65);
  return outer===1?rim:(1-outer)*relief(4*u+align,4*v+align)+outer*rim;
}

// Blend a new outer archipelago into the original basin in world coordinates.
function heightAtUV(u,v){
  const du=u-Math.round(u),dv=v-Math.round(v);
  const band=sstep(.19,.255,Math.max(Math.abs(du),Math.abs(dv)));
  if(!band)return innerBasin(2*u,2*v);
  const coast=relief(u+.57,v+.18),fold=ridged(u,v,8,4,671);
  const high=Math.min(402,coast*.92-14+sstep(-5,55,coast)*fold*144);
  return band===1?high:innerBasin(2*u,2*v)*(1-band)+high*band;
}

// rows j0..j1 of the height field and the biome noise
function genBand(j0, j1) {
  const N = WORLD.N, h = new Float32Array((j1 - j0) * N), b = new Uint8Array((j1 - j0) * N);
  for (let j = j0; j < j1; j++) {
    const v = j / N, o = (j - j0) * N;
    for (let i = 0; i < N; i++) {
      const u = i / N;
      h[o + i] = heightAtUV(u, v);
      const q = fbm(u, v, 28, 3, 0.55, 7007) * 0.5 + 0.5;
      b[o + i] = Math.max(0, Math.min(255, Math.round(q * 255)));
    }
  }
  return { h, b };
}

// pack height (16 bit in R,G), baked low-sun shadow (B) and biome (A)
function bakeTex(height, biome) {
  const { N, CELL } = WORLD, tex = new Uint8Array(N * N * 4);
  const drop = WORLD.SUN_TAN * CELL, soft = 7;
  for (let j = 0; j < N; j++) {
    let sh = -1e9;
    const o = j * N;
    for (let k = 0; k < 2 * N; k++) {               // sweep along +u, the way the light travels
      const i = k >= N ? k - N : k;
      const s = Math.max(height[o + i], 0);
      sh = Math.max(sh - drop, s);
      if (k >= N) tex[(o + i) * 4 + 2] = Math.round(Math.min(1, (sh - s) / soft) * 255);
    }
  }
  for (let k = 0; k < N * N; k++) {
    let q = (height[k] - WORLD.HMIN) / WORLD.HSPAN;
    q = Math.max(0, Math.min(65535, Math.round(q * 65535)));
    tex[k * 4] = q >> 8; tex[k * 4 + 1] = q & 255; tex[k * 4 + 3] = biome[k];
  }
  return tex;
}

function genCloud() {
  const CN = WORLD.CN, cloud = new Uint8Array(CN * CN);
  for (let j = 0; j < CN; j++) {
    const v = j / CN;
    for (let i = 0; i < CN; i++) {
      const u = i / CN;
      const wx = fbm(u, v, 5, 3, 0.5, 21), wy = fbm(u, v, 5, 3, 0.5, 22);
      const uu = u + 0.012 * wx, vv = v + 0.012 * wy;
      const cov = sstep(0.40, 0.66, fbm(u, v, 3, 4, 0.5, 4242) * 0.5 + 0.5);   // where the cloud fields are
      const big = worley(uu, vv, 38, 77);                                        // the puffs themselves
      const mid = worley(uu + 0.013, vv + 0.031, 64, 78);
      const small = worley(uu + 0.4, vv + 0.7, 112, 79);
      const lone = sstep(0.55, 0.9, worley(u, v, 11, 80));                         // a few strays in the clear air
      const n = (0.16 + 0.84 * Math.max(cov, lone * 0.8)) * (0.62 * big + 0.26 * mid + 0.16 * small);
      cloud[j * CN + i] = Math.max(0, Math.min(255, Math.round(n * 255)));
    }
  }
  return cloud;
}

// bilinear height lookup in world coordinates (wraps)
function makeHeightSampler(height) {
  const { N, L, E1, E2 } = WORLD;
  // A server evaluates only nearby texels, using the same grid and precision as the client.
  const keys = height ? null : new Int32Array(4096).fill(-1);
  const values = height ? null : new Float32Array(4096);
  function texel(i,j) {
    const key=j*N+i;
    if(height) return height[key];
    const slot=(Math.imul(j,83)+i)&4095;
    if(keys[slot]!==key){values[slot]=heightAtUV(i/N,j/N);keys[slot]=key;}
    return values[slot];
  }
  return function (x, z) {
    let u = (x * E1[0] + z * E1[1]) / L * N - 0.5, v = (x * E2[0] + z * E2[1]) / L * N - 0.5;
    const i0 = Math.floor(u), j0 = Math.floor(v), fu = u - i0, fv = v - j0;
    const ia = ((i0 % N) + N) % N, ja = ((j0 % N) + N) % N;
    const ib = ia + 1 === N ? 0 : ia + 1, jb = ja + 1 === N ? 0 : ja + 1;
    const a = texel(ia,ja), b = texel(ib,ja), c = texel(ia,jb), d = texel(ib,jb);
    return a + (b - a) * fu + (c - a) * fv + (a - b - c + d) * fu * fv;
  };
}
return {WORLD, genBand, bakeTex, genCloud, makeHeightSampler};
}
const LakeTerrain = createLakeTerrain();
if(typeof module!=="undefined")module.exports=LakeTerrain;
