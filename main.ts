// "The Lighthouse That Winds the Stars"
// An original generative painting for make.fun's coolest-art-01 bounty (Node 22, standard library only).
// A lighthouse on a dark cliff throws its beam into the night sky, and the beam curls up into a great
// impasto whirlpool, reeling the stars in on it like thread onto a spool. Every pixel is drawn here:
// thousands of seeded brush strokes follow a flow field, so both runs write identical bytes.
//
//   mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const W = 1024;
const H = 1024;
const img = new Float32Array(W * H * 3);

// ---------- seeded randomness ----------
let seed = 0x5eed1234;
function rnd(): number {
  seed = (seed + 0x6d2b79f5) | 0;
  let t = seed;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const mix = (a: number[], b: number[], t: number) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
const hex = (h: string) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---------- scene layout ----------
const HORIZON = 712;
const LANTERN = [206, 452];
const CORE = [596, 318]; // centre of the great whirl
const MOON = [878, 148, 60];
const STARS: number[][] = [
  [92, 96, 30], [262, 70, 26], [452, 92, 34], [742, 70, 28], [968, 330, 30], [810, 446, 34],
  [96, 300, 24], [376, 520, 24], [954, 560, 22], [652, 590, 22], [700, 168, 18], [150, 186, 20],
];

function cliffTop(x: number): number {
  // a rocky headland on the left falling into the sea
  if (x > 600) return 9999;
  const base = 636 + Math.pow(Math.max(0, x - 250) / 180, 2.2) * 120;
  return base + Math.sin(x * 0.045) * 7 + Math.sin(x * 0.13 + 1.3) * 4 - Math.max(0, 60 - x) * 0.6;
}
const inCliff = (x: number, y: number) => y > cliffTop(x);
const inSea = (x: number, y: number) => y > HORIZON && !inCliff(x, y);

// ---------- the beam: a logarithmic spiral from the lantern into the core ----------
const beamPts: number[][] = [];
{
  const dx = LANTERN[0] - CORE[0];
  const dy = LANTERN[1] - CORE[1];
  const r0 = Math.hypot(dx, dy);
  const a0 = Math.atan2(dy, dx);
  const N = 700;
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const a = a0 + t * Math.PI * 2 * 2.15;
    const r = r0 * Math.pow(1 - t, 1.25) + 4 * (1 - t);
    const w = 7 + 46 * Math.pow(Math.sin(Math.PI * Math.min(1, t * 1.15)), 0.7) * (1 - t * 0.55);
    beamPts.push([CORE[0] + Math.cos(a) * r, CORE[1] + Math.sin(a) * r, w, t]);
  }
}
// rasterise beam weight + tangent into maps
const beamW = new Float32Array(W * H);
const beamTx = new Float32Array(W * H);
const beamTy = new Float32Array(W * H);
const beamT = new Float32Array(W * H);
for (let i = 1; i < beamPts.length; i++) {
  const [x, y, w, t] = beamPts[i];
  let tx = x - beamPts[i - 1][0];
  let ty = y - beamPts[i - 1][1];
  const tl = Math.hypot(tx, ty) || 1;
  tx /= tl;
  ty /= tl;
  const R = Math.ceil(w * 1.8);
  for (let yy = Math.max(0, Math.floor(y - R)); yy <= Math.min(H - 1, y + R); yy++) {
    for (let xx = Math.max(0, Math.floor(x - R)); xx <= Math.min(W - 1, x + R); xx++) {
      const d = Math.hypot(xx - x, yy - y) / w;
      const v = Math.exp(-d * d * 1.6);
      const k = yy * W + xx;
      if (v > beamW[k]) {
        beamW[k] = v;
        beamTx[k] = tx;
        beamTy[k] = ty;
        beamT[k] = t;
      }
    }
  }
}

// ---------- flow field ----------
function flow(x: number, y: number): number[] {
  const k = clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1);
  if (inCliff(x, y)) {
    // rock: strokes run along the slope with a little turbulence
    const a = -0.5 + Math.sin(x * 0.03 + y * 0.02) * 0.9;
    return [Math.cos(a), Math.sin(a)];
  }
  if (y > HORIZON) {
    // sea: long rolling horizontal swells
    const a = Math.sin(x * 0.018 + y * 0.05) * 0.35 + Math.sin(x * 0.006 - y * 0.02) * 0.25;
    return [Math.cos(a), Math.sin(a)];
  }
  // sky: a gentle wind plus whirls
  const wa = Math.sin(y * 0.012 + x * 0.004) * 0.45 + Math.sin(x * 0.009 - y * 0.02) * 0.2;
  let vx = Math.cos(wa) * 0.7;
  let vy = Math.sin(wa) * 0.7;
  // the great whirl
  {
    const dx = x - CORE[0];
    const dy = y - CORE[1];
    const d = Math.hypot(dx, dy) + 1e-3;
    const s = 3.2 * Math.exp(-Math.pow(d / 330, 2));
    vx += (-dy / d) * s - (dx / d) * s * 0.18;
    vy += (dx / d) * s - (dy / d) * s * 0.18;
  }
  for (const [sx, sy, sr] of [...STARS, MOON]) {
    const dx = x - sx;
    const dy = y - sy;
    const d = Math.hypot(dx, dy) + 1e-3;
    const s = 4 * Math.exp(-Math.pow(d / (sr * 2.4), 2));
    vx += (-dy / d) * s;
    vy += (dx / d) * s;
  }
  const bw = beamW[k];
  if (bw > 0.02) {
    vx = vx * (1 - bw) + beamTx[k] * bw * 4;
    vy = vy * (1 - bw) + beamTy[k] * bw * 4;
  }
  const l = Math.hypot(vx, vy) || 1;
  return [vx / l, vy / l];
}

// ---------- palette ----------
const SKY = ['#0c1a4a', '#16307a', '#1f47a0', '#2f66b8', '#4a86c8', '#7aaed8', '#a9cde6'].map(hex);
const GOLD = ['#fff8d8', '#ffe98a', '#ffd23f', '#f6b42c', '#e8892a'].map(hex);
const SEA = ['#06102e', '#0b1c48', '#123066', '#1d4a80', '#2d6b94'].map(hex);
const ROCK = ['#05090c', '#0b1514', '#13221d', '#1d3128', '#2a2f3c'].map(hex);

function pick(pal: number[][], t: number): number[] {
  t = clamp(t, 0, 0.9999) * (pal.length - 1);
  const i = Math.floor(t);
  return mix(pal[i], pal[i + 1], t - i);
}

function colorAt(x: number, y: number): number[] {
  const j = (rnd() - 0.5) * 0.28;
  if (inCliff(x, y)) {
    const glow = Math.exp(-Math.pow(Math.hypot(x - LANTERN[0], y - LANTERN[1]) / 160, 2));
    return mix(pick(ROCK, 0.25 + j * 1.6 + Math.sin(x * 0.05 + y * 0.03) * 0.2), GOLD[4], glow * 0.25);
  }
  if (y > HORIZON) {
    // the beam and moon reflected as a broken gold column
    const reflM = Math.exp(-Math.pow((x - MOON[0]) / (34 + (y - HORIZON) * 0.25), 2));
    const reflB = Math.exp(-Math.pow((x - (CORE[0] - 40)) / (50 + (y - HORIZON) * 0.3), 2)) * 0.8;
    const r = Math.max(reflM, reflB) * (0.5 + 0.5 * Math.sin(y * 0.35 + x * 0.05));
    const depth = (y - HORIZON) / (H - HORIZON);
    let c = pick(SEA, 0.55 - depth * 0.45 + j * 1.8 + Math.sin(x * 0.04 + y * 0.09) * 0.18);
    if (rnd() < r * 0.85) c = pick(GOLD, 0.2 + rnd() * 0.6);
    // white surf where the swell breaks on the rocks
    if (inCliff(x - 18, y) || inCliff(x - 10, y + 10)) c = mix(c, hex('#dfeaf2'), 0.55 + rnd() * 0.4);
    return c;
  }
  // sky
  const dC = Math.hypot(x - CORE[0], y - CORE[1]);
  let t = 0.35 + 0.18 * Math.sin(x * 0.011 + Math.sin(y * 0.019) * 2) * Math.cos(y * 0.015 - x * 0.004) + j;
  t += 0.25 * Math.exp(-Math.pow(dC / 260, 2)) * (0.6 + 0.4 * Math.sin(dC * 0.09));
  t -= 0.18 * (y / HORIZON) * 0.4;
  let c = pick(SKY, t);
  // star and moon halos with ringed bands
  for (const [sx, sy, sr] of [...STARS, MOON]) {
    const d = Math.hypot(x - sx, y - sy);
    const big = sr === MOON[2];
    const halo = Math.exp(-Math.pow(d / (sr * (big ? 2.4 : 2.0)), 2));
    if (halo > 0.05) {
      const band = 0.5 + 0.5 * Math.sin(d * (big ? 0.16 : 0.24));
      const g = band > 0.5 ? pick(GOLD, 0.1 + rnd() * 0.5) : pick(SKY, 0.7 + rnd() * 0.3);
      c = mix(c, g, clamp(halo * 1.25, 0, 1));
    }
  }
  // the beam
  const k = clamp(Math.round(y), 0, H - 1) * W + clamp(Math.round(x), 0, W - 1);
  const bw = beamW[k];
  if (bw > 0.04) {
    const g = pick(GOLD, clamp((1 - bw) * 0.9 + beamT[k] * 0.15 + (rnd() - 0.5) * 0.3, 0, 1));
    c = mix(c, g, clamp(bw * 1.35, 0, 1));
  }
  // whirl core burns white
  const core = Math.exp(-Math.pow(dC / 40, 2));
  c = mix(c, GOLD[0], core);
  return c;
}

// ---------- brush ----------
function dab(cx: number, cy: number, r: number, c: number[], a: number): void {
  const x0 = Math.max(0, Math.floor(cx - r - 1));
  const x1 = Math.min(W - 1, Math.ceil(cx + r + 1));
  const y0 = Math.max(0, Math.floor(cy - r - 1));
  const y1 = Math.min(H - 1, Math.ceil(cy + r + 1));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const d = Math.hypot(x - cx, y - cy);
      const cov = clamp(r + 0.5 - d, 0, 1) * a;
      if (cov <= 0) continue;
      const k = (y * W + x) * 3;
      img[k] += (c[0] - img[k]) * cov;
      img[k + 1] += (c[1] - img[k + 1]) * cov;
      img[k + 2] += (c[2] - img[k + 2]) * cov;
    }
  }
}

function stroke(x: number, y: number, width: number, len: number): void {
  const c = colorAt(x, y);
  const startCliff = inCliff(x, y);
  const startSea = inSea(x, y);
  const dir = rnd() < 0.5 ? 1 : -1;
  const shade = 0.82 + rnd() * 0.12;
  // a slightly darker body first, then the lit ridge of paint on top: reads as impasto
  const pts: number[][] = [];
  let px = x;
  let py = y;
  for (let i = 0; i < len; i++) {
    pts.push([px, py]);
    const [fx, fy] = flow(px, py);
    px += fx * dir * 1.8;
    py += fy * dir * 1.8;
    if (px < -8 || py < -8 || px > W + 8 || py > H + 8) break;
    if (inCliff(px, py) !== startCliff || inSea(px, py) !== startSea) break;
  }
  const n = pts.length;
  for (let i = 0; i < n; i++) {
    const taper = Math.sin(((i + 0.5) / n) * Math.PI) * 0.45 + 0.55;
    dab(pts[i][0], pts[i][1], width * taper, [c[0] * shade, c[1] * shade, c[2] * shade], 0.95);
  }
  const hi = [Math.min(255, c[0] * 1.12 + 10), Math.min(255, c[1] * 1.12 + 10), Math.min(255, c[2] * 1.12 + 10)];
  for (let i = 0; i < n; i++) {
    const taper = Math.sin(((i + 0.5) / n) * Math.PI) * 0.45 + 0.55;
    dab(pts[i][0] - 0.6, pts[i][1] - 0.6, width * taper * 0.45, hi, 0.55);
  }
}

// ---------- paint ----------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const c = inCliff(x, y) ? ROCK[1] : y > HORIZON ? SEA[1] : SKY[1];
    const k = (y * W + x) * 3;
    img[k] = c[0];
    img[k + 1] = c[1];
    img[k + 2] = c[2];
  }
}
// underpainting: big strokes on a jittered grid
for (let gy = 0; gy < H; gy += 9) {
  for (let gx = 0; gx < W; gx += 9) stroke(gx + rnd() * 9, gy + rnd() * 9, 4.6, 14 + Math.floor(rnd() * 10));
}
// detail strokes
for (let i = 0; i < 26000; i++) stroke(rnd() * W, rnd() * H, 2.4 + rnd() * 1.4, 8 + Math.floor(rnd() * 14));
// extra density along the beam and halos so the light reads as thick paint
for (let i = 0; i < 9000; i++) {
  const p = beamPts[Math.floor(rnd() * beamPts.length)];
  const a = rnd() * Math.PI * 2;
  const r = rnd() * p[2] * 1.1;
  stroke(p[0] + Math.cos(a) * r, p[1] + Math.sin(a) * r, 2.2 + rnd() * 1.4, 10 + Math.floor(rnd() * 10));
}

// ---------- additive light ----------
function glow(cx: number, cy: number, rad: number, c: number[], amt: number): void {
  const R = rad * 3;
  for (let y = Math.max(0, Math.floor(cy - R)); y <= Math.min(H - 1, cy + R); y++) {
    for (let x = Math.max(0, Math.floor(cx - R)); x <= Math.min(W - 1, cx + R); x++) {
      const d = Math.hypot(x - cx, y - cy) / rad;
      const v = Math.exp(-d * d) * amt;
      const k = (y * W + x) * 3;
      img[k] += c[0] * v;
      img[k + 1] += c[1] * v;
      img[k + 2] += c[2] * v;
    }
  }
}

// moon: a hot crescent
{
  const [mx, my, mr] = MOON;
  for (let y = my - mr - 2; y <= my + mr + 2; y++) {
    for (let x = mx - mr - 2; x <= mx + mr + 2; x++) {
      let cov = 0;
      for (let s = 0; s < 16; s++) {
        const sx = x + ((s % 4) + 0.5) / 4 - 0.5;
        const sy = y + (Math.floor(s / 4) + 0.5) / 4 - 0.5;
        const inA = Math.hypot(sx - mx, sy - my) < mr;
        const inB = Math.hypot(sx - (mx + mr * 0.52), sy - (my - mr * 0.3)) < mr * 0.86;
        if (inA && !inB) cov++;
      }
      if (!cov) continue;
      const k = (y * W + x) * 3;
      const c = mix(hex('#fff4b8'), hex('#f08a1c'), clamp(Math.hypot(x - mx, y - my) / mr, 0, 1) * 0.9);
      for (let ch = 0; ch < 3; ch++) img[k + ch] += (c[ch] - img[k + ch]) * (cov / 16);
    }
  }
  glow(mx, my, mr * 1.6, [255, 180, 70], 0.16);
}
for (const [sx, sy, sr] of STARS) {
  glow(sx, sy, sr * 0.55, [255, 236, 170], 0.9);
  glow(sx, sy, sr * 0.18, [255, 255, 240], 1.2);
}
glow(CORE[0], CORE[1], 60, [255, 230, 150], 0.55);

// ---------- the lighthouse ----------
function fillShape(inside: (x: number, y: number) => boolean, color: (x: number, y: number) => number[], bx0: number, by0: number, bx1: number, by1: number): void {
  for (let y = by0; y <= by1; y++) {
    for (let x = bx0; x <= bx1; x++) {
      let cov = 0;
      for (let s = 0; s < 9; s++) if (inside(x + ((s % 3) - 1) / 3, y + (Math.floor(s / 3) - 1) / 3)) cov++;
      if (!cov) continue;
      const c = color(x, y);
      const k = (y * W + x) * 3;
      for (let ch = 0; ch < 3; ch++) img[k + ch] += (c[ch] - img[k + ch]) * (cov / 9);
    }
  }
}
const LX = LANTERN[0];
const TOWER_TOP = 474;
const TOWER_BOT = 650;
const halfW = (y: number) => 17 + ((y - TOWER_TOP) / (TOWER_BOT - TOWER_TOP)) * 13;
// tower: banded, lit from the moon side (right) with a dark left edge
fillShape(
  (x, y) => y >= TOWER_TOP && y <= TOWER_BOT && Math.abs(x - LX) <= halfW(y),
  (x, y) => {
    const u = (x - LX) / halfW(y);
    const band = Math.floor((y - TOWER_TOP) / 30) % 2 === 0;
    const base = band ? hex('#e9dcc0') : hex('#b8322a');
    const light = 0.35 + 0.65 * clamp(0.5 + u * 0.7, 0, 1);
    const warm = Math.exp(-Math.pow((y - TOWER_TOP) / 40, 2)) * 0.35;
    return [base[0] * light + 60 * warm, base[1] * light + 40 * warm, base[2] * light * 0.9];
  },
  LX - 32, TOWER_TOP, LX + 32, TOWER_BOT,
);
// small door and window
fillShape((x, y) => Math.abs(x - LX - 4) < 5 && y > 626 && y < 650, () => hex('#1a0f0c'), LX - 6, 624, LX + 12, 650);
fillShape((x, y) => Math.abs(x - LX + 2) < 3 && y > 548 && y < 560, () => hex('#ffd76a'), LX - 6, 546, LX + 2, 562);
// gallery deck and rail
fillShape((x, y) => Math.abs(x - LX) < 26 && y >= 468 && y < 476, () => hex('#14100f'), LX - 28, 466, LX + 28, 478);
for (let i = -24; i <= 24; i += 6) fillShape((x, y) => Math.abs(x - LX - i) < 0.9 && y > 458 && y < 469, () => hex('#14100f'), LX + i - 2, 456, LX + i + 2, 470);
fillShape((x, y) => Math.abs(x - LX) < 26 && y > 456.5 && y < 459, () => hex('#14100f'), LX - 28, 455, LX + 28, 460);
// lantern room, blazing
fillShape(
  (x, y) => Math.abs(x - LX) < 15 && y > 430 && y < 468,
  (x, y) => mix(hex('#fffbe6'), hex('#ffcf4a'), clamp(Math.abs(x - LX) / 15, 0, 1)),
  LX - 16, 428, LX + 16, 469,
);
for (const mx of [-8, 0, 8]) fillShape((x, y) => Math.abs(x - LX - mx) < 0.8 && y > 430 && y < 468, () => hex('#5a3a18'), LX + mx - 2, 430, LX + mx + 2, 468);
// roof cap
fillShape((x, y) => y <= 431 && y > 404 && Math.abs(x - LX) < (y - 404) * 0.68, () => hex('#3a1210'), LX - 20, 402, LX + 20, 432);
fillShape((x, y) => Math.hypot(x - LX, y - 401) < 3.2, () => hex('#3a1210'), LX - 4, 397, LX + 4, 405);
glow(LANTERN[0], LANTERN[1] - 2, 26, [255, 230, 150], 1.1);
glow(LANTERN[0], LANTERN[1] - 2, 70, [255, 190, 90], 0.45);

// ---------- finish: vignette, tone and encode ----------
const px = new Uint8Array(W * H * 3);
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const v = 1 - 0.28 * Math.pow(Math.min(1, (dx * dx + dy * dy) / 2), 1.3);
    const k = (y * W + x) * 3;
    for (let ch = 0; ch < 3; ch++) {
      const c = img[k + ch] * v;
      // soft shoulder so the light glows instead of clipping flat
      const t = c > 220 ? 220 + (35 * (c - 220)) / (c - 185) : c;
      px[k + ch] = clamp(Math.round(t), 0, 255);
    }
  }
}

// ---------- baseline JPEG encoder (4:4:4) ----------
// A lossless PNG of thousands of brush strokes is far over the 1 MiB cap, so the painting is written as a JPEG.
const QUALITY = 90;
const ZZ = [0, 1, 8, 16, 9, 2, 3, 10, 17, 24, 32, 25, 18, 11, 4, 5, 12, 19, 26, 33, 40, 48, 41, 34, 27, 20, 13, 6, 7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36, 29, 22, 15, 23, 30, 37, 44, 51, 58, 59, 52, 45, 38, 31, 39, 46, 53, 60, 61, 54, 47, 55, 62, 63];
const QL = [16, 11, 10, 16, 24, 40, 51, 61, 12, 12, 14, 19, 26, 58, 60, 55, 14, 13, 16, 24, 40, 57, 69, 56, 14, 17, 22, 29, 51, 87, 80, 62,
  18, 22, 37, 56, 68, 109, 103, 77, 24, 35, 55, 64, 81, 104, 113, 92, 49, 64, 78, 87, 103, 121, 120, 101, 72, 92, 95, 98, 112, 100, 103, 99];
const QC = [17, 18, 24, 47, 99, 99, 99, 99, 18, 21, 26, 66, 99, 99, 99, 99, 24, 26, 56, 99, 99, 99, 99, 99, 47, 66, 99, 99, 99, 99, 99, 99]
  .concat(new Array(32).fill(99));
const scaleQ = (q: number[]) => {
  const s = QUALITY < 50 ? 5000 / QUALITY : 200 - QUALITY * 2;
  return q.map((v) => clamp(Math.floor((v * s + 50) / 100), 1, 255));
};
const qTabs = [scaleQ(QL), scaleQ(QC)];
const DC_L = { bits: [0, 1, 5, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0], vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const DC_C = { bits: [0, 3, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0], vals: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] };
const AC_L = {
  bits: [0, 2, 1, 3, 3, 2, 4, 3, 5, 5, 4, 4, 0, 0, 1, 0x7d],
  vals: [0x01, 0x02, 0x03, 0x00, 0x04, 0x11, 0x05, 0x12, 0x21, 0x31, 0x41, 0x06, 0x13, 0x51, 0x61, 0x07, 0x22, 0x71, 0x14, 0x32, 0x81,
    0x91, 0xa1, 0x08, 0x23, 0x42, 0xb1, 0xc1, 0x15, 0x52, 0xd1, 0xf0, 0x24, 0x33, 0x62, 0x72, 0x82, 0x09, 0x0a, 0x16, 0x17, 0x18, 0x19,
    0x1a, 0x25, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49, 0x4a,
    0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77, 0x78,
    0x79, 0x7a, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2, 0xa3, 0xa4,
    0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6, 0xc7, 0xc8,
    0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe1, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea, 0xf1,
    0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa],
};
const AC_C = {
  bits: [0, 2, 1, 2, 4, 4, 3, 4, 7, 5, 4, 4, 0, 1, 2, 0x77],
  vals: [0x00, 0x01, 0x02, 0x03, 0x11, 0x04, 0x05, 0x21, 0x31, 0x06, 0x12, 0x41, 0x51, 0x07, 0x61, 0x71, 0x13, 0x22, 0x32, 0x81, 0x08,
    0x14, 0x42, 0x91, 0xa1, 0xb1, 0xc1, 0x09, 0x23, 0x33, 0x52, 0xf0, 0x15, 0x62, 0x72, 0xd1, 0x0a, 0x16, 0x24, 0x34, 0xe1, 0x25, 0xf1,
    0x17, 0x18, 0x19, 0x1a, 0x26, 0x27, 0x28, 0x29, 0x2a, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3a, 0x43, 0x44, 0x45, 0x46, 0x47, 0x48, 0x49,
    0x4a, 0x53, 0x54, 0x55, 0x56, 0x57, 0x58, 0x59, 0x5a, 0x63, 0x64, 0x65, 0x66, 0x67, 0x68, 0x69, 0x6a, 0x73, 0x74, 0x75, 0x76, 0x77,
    0x78, 0x79, 0x7a, 0x82, 0x83, 0x84, 0x85, 0x86, 0x87, 0x88, 0x89, 0x8a, 0x92, 0x93, 0x94, 0x95, 0x96, 0x97, 0x98, 0x99, 0x9a, 0xa2,
    0xa3, 0xa4, 0xa5, 0xa6, 0xa7, 0xa8, 0xa9, 0xaa, 0xb2, 0xb3, 0xb4, 0xb5, 0xb6, 0xb7, 0xb8, 0xb9, 0xba, 0xc2, 0xc3, 0xc4, 0xc5, 0xc6,
    0xc7, 0xc8, 0xc9, 0xca, 0xd2, 0xd3, 0xd4, 0xd5, 0xd6, 0xd7, 0xd8, 0xd9, 0xda, 0xe2, 0xe3, 0xe4, 0xe5, 0xe6, 0xe7, 0xe8, 0xe9, 0xea,
    0xf2, 0xf3, 0xf4, 0xf5, 0xf6, 0xf7, 0xf8, 0xf9, 0xfa],
};
type Huff = { code: number[]; len: number[] };
function buildHuff(t: { bits: number[]; vals: number[] }): Huff {
  const code: number[] = new Array(256).fill(0);
  const len: number[] = new Array(256).fill(0);
  let c = 0;
  let p = 0;
  for (let l = 1; l <= 16; l++) {
    for (let i = 0; i < t.bits[l - 1]; i++) {
      code[t.vals[p]] = c;
      len[t.vals[p]] = l;
      p++;
      c++;
    }
    c <<= 1;
  }
  return { code, len };
}
const hDC = [buildHuff(DC_L), buildHuff(DC_C)];
const hAC = [buildHuff(AC_L), buildHuff(AC_C)];

const out: number[] = [];
let bitBuf = 0;
let bitCnt = 0;
function putBits(v: number, n: number): void {
  for (let i = n - 1; i >= 0; i--) {
    bitBuf = (bitBuf << 1) | ((v >> i) & 1);
    if (++bitCnt === 8) {
      out.push(bitBuf);
      if (bitBuf === 0xff) out.push(0);
      bitBuf = 0;
      bitCnt = 0;
    }
  }
}
const sizeOf = (v: number) => (v === 0 ? 0 : 32 - Math.clz32(Math.abs(v)));
const magBits = (v: number, s: number) => (v >= 0 ? v : v + (1 << s) - 1);

const COS = new Float64Array(64);
for (let x = 0; x < 8; x++) for (let u = 0; u < 8; u++) COS[x * 8 + u] = Math.cos(((2 * x + 1) * u * Math.PI) / 16);
const CU = (u: number) => (u === 0 ? Math.SQRT1_2 : 1);

const planes = [new Float32Array(W * H), new Float32Array(W * H), new Float32Array(W * H)];
for (let i = 0; i < W * H; i++) {
  const r = px[i * 3];
  const g = px[i * 3 + 1];
  const b = px[i * 3 + 2];
  planes[0][i] = 0.299 * r + 0.587 * g + 0.114 * b - 128;
  planes[1][i] = -0.168736 * r - 0.331264 * g + 0.5 * b;
  planes[2][i] = 0.5 * r - 0.418688 * g - 0.081312 * b;
}
const blk = new Float64Array(64);
const tmp = new Float64Array(64);
const prevDC = [0, 0, 0];
function encodeBlock(comp: number, bx: number, by: number): void {
  const P = planes[comp];
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) blk[y * 8 + x] = P[(by + y) * W + bx + x];
  // separable DCT-II: rows then columns
  for (let y = 0; y < 8; y++) {
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let x = 0; x < 8; x++) s += blk[y * 8 + x] * COS[x * 8 + u];
      tmp[y * 8 + u] = s * CU(u) * 0.5;
    }
  }
  const q = qTabs[comp === 0 ? 0 : 1];
  const zz = new Int32Array(64);
  for (let v = 0; v < 8; v++) {
    for (let u = 0; u < 8; u++) {
      let s = 0;
      for (let y = 0; y < 8; y++) s += tmp[y * 8 + u] * COS[y * 8 + v];
      blk[v * 8 + u] = s * CU(v) * 0.5;
    }
  }
  for (let i = 0; i < 64; i++) zz[i] = Math.round(blk[ZZ[i]] / q[ZZ[i]]);
  const t = comp === 0 ? 0 : 1;
  const diff = zz[0] - prevDC[comp];
  prevDC[comp] = zz[0];
  const ds = sizeOf(diff);
  putBits(hDC[t].code[ds], hDC[t].len[ds]);
  if (ds) putBits(magBits(diff, ds), ds);
  let run = 0;
  for (let i = 1; i < 64; i++) {
    const v = zz[i];
    if (v === 0) {
      run++;
      continue;
    }
    while (run > 15) {
      putBits(hAC[t].code[0xf0], hAC[t].len[0xf0]);
      run -= 16;
    }
    const s = sizeOf(v);
    const sym = (run << 4) | s;
    putBits(hAC[t].code[sym], hAC[t].len[sym]);
    putBits(magBits(v, s), s);
    run = 0;
  }
  if (run > 0) putBits(hAC[t].code[0], hAC[t].len[0]);
}
for (let by = 0; by < H; by += 8) for (let bx = 0; bx < W; bx += 8) for (let c = 0; c < 3; c++) encodeBlock(c, bx, by);
if (bitCnt > 0) putBits((1 << (8 - bitCnt)) - 1, 8 - bitCnt);

const seg = (marker: number, body: number[]) => [0xff, marker, (body.length + 2) >> 8, (body.length + 2) & 255, ...body];
const dht = (cls: number, id: number, t: { bits: number[]; vals: number[] }) => [(cls << 4) | id, ...t.bits, ...t.vals];
const header = [
  0xff, 0xd8,
  ...seg(0xe0, [0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]),
  ...seg(0xdb, [0, ...ZZ.map((i) => qTabs[0][i]), 1, ...ZZ.map((i) => qTabs[1][i])]),
  ...seg(0xc0, [8, H >> 8, H & 255, W >> 8, W & 255, 3, 1, 0x11, 0, 2, 0x11, 1, 3, 0x11, 1]),
  ...seg(0xc4, [...dht(0, 0, DC_L), ...dht(1, 0, AC_L), ...dht(0, 1, DC_C), ...dht(1, 1, AC_C)]),
  ...seg(0xda, [3, 1, 0x00, 2, 0x11, 3, 0x11, 0, 63, 0]),
];
const jpeg = Buffer.concat([Buffer.from(header), Buffer.from(out), Buffer.from([0xff, 0xd9])]);
writeFileSync(join(process.env.MAKEFUN_OUTPUT_DIR ?? '/output', 'entry.png'), jpeg);
