export interface Vec2 {
  x: number;
  z: number;
}

export interface TrackSample {
  pos: Vec2;
  tangent: Vec2;
  right: Vec2;
  curvature: number;
  signedCurvature: number;
  s: number;
}

export interface TrackProp {
  kind: 'building' | 'tree' | 'mesa' | 'stand' | 'lamp' | 'traffic';
  x: number;
  z: number;
  s: number;
  lateral: number;
  w: number;
  h: number;
  color: string;
  accent?: string;
}

export interface TrackWorldData {
  def: any;
  samples: TrackSample[];
  sampleCount: number;
  totalLength: number;
  halfW: number;
  shoulder: number;
  pitS: number;
  isRain: boolean;
  weather: string;
  props: TrackProp[];
  sampleProps: TrackProp[][];
}

export interface SkidSegment {
  x1: number;
  z1: number;
  x2: number;
  z2: number;
  alpha: number;
}

export type QualityMode = 'ultra' | 'high' | 'perf';

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function damp(a: number, b: number, lambda: number, dt: number): number {
  return lerp(a, b, 1 - Math.exp(-lambda * dt));
}

function dampAngle(a: number, b: number, lambda: number, dt: number): number {
  let diff = b - a;
  while (diff > Math.PI) diff -= Math.PI * 2;
  while (diff < -Math.PI) diff += Math.PI * 2;
  return a + diff * (1 - Math.exp(-lambda * dt));
}

function catmullRom(p0: Vec2, p1: Vec2, p2: Vec2, p3: Vec2, t: number): Vec2 {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x: 0.5 * ((2 * p1.x) + (-p0.x + p2.x) * t + (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 + (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    z: 0.5 * ((2 * p1.z) + (-p0.z + p2.z) * t + (2 * p0.z - 5 * p1.z + 4 * p2.z - p3.z) * t2 + (-p0.z + 3 * p1.z - 3 * p2.z + p3.z) * t3)
  };
}

export function buildSplineTrack(points: number[][], sampleCount = 600): { samples: TrackSample[]; totalLength: number } {
  const pts: Vec2[] = points.map((p) => ({ x: p[0], z: p[1] }));
  const n = pts.length;
  const denseCount = n * 40;
  const dense: Vec2[] = [];
  const cumLen: number[] = [0];

  for (let i = 0; i < denseCount; i++) {
    const u = (i / denseCount) * n;
    const seg = Math.floor(u) % n;
    const t = u - Math.floor(u);
    const p0 = pts[(seg - 1 + n) % n];
    const p1 = pts[seg];
    const p2 = pts[(seg + 1) % n];
    const p3 = pts[(seg + 2) % n];
    const pt = catmullRom(p0, p1, p2, p3, t);
    dense.push(pt);
    if (i > 0) {
      const prev = dense[i - 1];
      cumLen.push(cumLen[i - 1] + Math.hypot(pt.x - prev.x, pt.z - prev.z));
    }
  }
  const closeDist = Math.hypot(dense[0].x - dense[denseCount - 1].x, dense[0].z - dense[denseCount - 1].z);
  const totalLength = cumLen[denseCount - 1] + closeDist;
  dense.push(dense[0]);
  cumLen.push(totalLength);

  const spaced: Vec2[] = [];
  let cursor = 0;
  for (let i = 0; i < sampleCount; i++) {
    const target = (i / sampleCount) * totalLength;
    while (cursor < denseCount - 1 && cumLen[cursor + 1] < target) cursor++;
    const segLen = Math.max(1e-6, cumLen[cursor + 1] - cumLen[cursor]);
    const frac = clamp((target - cumLen[cursor]) / segLen, 0, 1);
    spaced.push({
      x: lerp(dense[cursor].x, dense[cursor + 1].x, frac),
      z: lerp(dense[cursor].z, dense[cursor + 1].z, frac)
    });
  }

  const samples: TrackSample[] = [];
  for (let i = 0; i < sampleCount; i++) {
    const pPrev = spaced[(i - 1 + sampleCount) % sampleCount];
    const pCurr = spaced[i];
    const pNext = spaced[(i + 1) % sampleCount];
    const tx = pNext.x - pPrev.x;
    const tz = pNext.z - pPrev.z;
    const tLen = Math.hypot(tx, tz) || 1;
    const tan = { x: tx / tLen, z: tz / tLen };
    const right = { x: -tan.z, z: tan.x };

    const d1x = pCurr.x - pPrev.x;
    const d1z = pCurr.z - pPrev.z;
    const d1Len = Math.hypot(d1x, d1z) || 1;
    const d2x = pNext.x - pCurr.x;
    const d2z = pNext.z - pCurr.z;
    const d2Len = Math.hypot(d2x, d2z) || 1;
    const crossY = (d1x / d1Len) * (d2z / d2Len) - (d1z / d1Len) * (d2x / d2Len);

    samples.push({
      pos: { x: pCurr.x, z: pCurr.z },
      tangent: tan,
      right,
      curvature: Math.abs(crossY) * 18,
      signedCurvature: crossY * 18,
      s: i / sampleCount
    });
  }
  return { samples, totalLength };
}

function seededRand(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

export function buildTrackWorldData(trackDef: any, weather: string): TrackWorldData {
  const SAMPLE_COUNT = 600;
  const { samples, totalLength } = buildSplineTrack(trackDef.points, SAMPLE_COUNT);
  const halfW = trackDef.roadWidth * 0.5;
  const shoulder = 3.2;
  const isRain = weather === 'rain';
  const props: TrackProp[] = [];
  const sampleProps: TrackProp[][] = Array.from({ length: SAMPLE_COUNT }, () => []);
  const rng = seededRand(
    trackDef.id === 'city' ? 101 : trackDef.id === 'desert' ? 202 : trackDef.id === 'mountain' ? 303 : 404
  );

  const findNearest = (x: number, z: number) => {
    let best = 0;
    let bestD2 = Infinity;
    for (let i = 0; i < SAMPLE_COUNT; i += 2) {
      const dx = x - samples[i].pos.x;
      const dz = z - samples[i].pos.z;
      const d2 = dx * dx + dz * dz;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    }
    const s = samples[best];
    const lat = (x - s.pos.x) * s.right.x + (z - s.pos.z) * s.right.z;
    return { idx: best, d2: bestD2, lateral: lat };
  };

  const addProp = (p: TrackProp, idx: number) => {
    props.push(p);
    if (Math.abs(p.lateral) < 68) {
      sampleProps[(idx + SAMPLE_COUNT) % SAMPLE_COUNT].push(p);
    }
  };

  // Streetlamps
  const lampStep = 24;
  for (let i = 0; i < SAMPLE_COUNT; i += lampStep) {
    const samp = samples[i];
    const side = (i / lampStep) % 2 === 0 ? 1 : -1;
    const lat = side * (halfW + 4.2);
    addProp({
      kind: 'lamp',
      x: samp.pos.x + samp.right.x * lat,
      z: samp.pos.z + samp.right.z * lat,
      s: i / SAMPLE_COUNT,
      lateral: lat,
      w: 0.7,
      h: 7.5,
      color: '#475569',
      accent: weather === 'night' || weather === 'sunset' ? '#fde68a' : '#94a3b8'
    }, i);
  }

  if (trackDef.theme === 'city') {
    [45, 160, 290, 420].forEach((idx, k) => {
      const samp = samples[idx % SAMPLE_COUNT];
      const lat = halfW + 2.6;
      addProp({
        kind: 'traffic',
        x: samp.pos.x + samp.right.x * lat,
        z: samp.pos.z + samp.right.z * lat,
        s: idx / SAMPLE_COUNT,
        lateral: lat,
        w: 1.2,
        h: 6.8,
        color: '#1e293b',
        accent: k % 2 === 0 ? '#22c55e' : '#f59e0b'
      }, idx);
    });

    let placed = 0;
    for (let a = 0; a < 420 && placed < 95; a++) {
      const x = (rng() - 0.5) * 760;
      const z = (rng() - 0.5) * 760;
      const n = findNearest(x, z);
      if (n.d2 < (halfW + 17) ** 2) continue;
      const w = 16 + rng() * 20;
      const h = 24 + rng() * 64;
      const shade = Math.round(28 + rng() * 24);
      addProp({
        kind: 'building',
        x,
        z,
        s: n.idx / SAMPLE_COUNT,
        lateral: n.lateral,
        w,
        h,
        color: `rgb(${shade}, ${shade + 7}, ${shade + 18})`
      }, n.idx);
      placed++;
    }
  }

  if (trackDef.theme === 'mountain' || trackDef.theme === 'coastal') {
    let placed = 0;
    for (let a = 0; a < 700 && placed < 160; a++) {
      const x = (rng() - 0.5) * 880;
      const z = (rng() - 0.5) * 880;
      if (trackDef.theme === 'coastal' && z < -440) continue;
      const n = findNearest(x, z);
      if (n.d2 < (halfW + 8.5) ** 2) continue;
      const sc = 0.85 + rng() * 0.65;
      addProp({
        kind: 'tree',
        x,
        z,
        s: n.idx / SAMPLE_COUNT,
        lateral: n.lateral,
        w: 4.8 * sc,
        h: 9.5 * sc,
        color: trackDef.theme === 'coastal' ? '#1e5631' : '#1b4332'
      }, n.idx);
      placed++;
    }
  }

  if (trackDef.theme === 'desert') {
    let placed = 0;
    for (let a = 0; a < 280 && placed < 32; a++) {
      const x = (rng() - 0.5) * 960;
      const z = (rng() - 0.5) * 960;
      const n = findNearest(x, z);
      if (n.d2 < (halfW + 30) ** 2) continue;
      const sc = 0.8 + rng() * 1.2;
      addProp({
        kind: 'mesa',
        x,
        z,
        s: n.idx / SAMPLE_COUNT,
        lateral: n.lateral,
        w: 32 * sc,
        h: 26 * sc,
        color: '#8f4426'
      }, n.idx);
      placed++;
    }
  }

  if (trackDef.theme === 'coastal') {
    for (let g = 0; g < 3; g++) {
      const x = -40 + g * 65;
      const z = -346;
      const n = findNearest(x, z);
      addProp({
        kind: 'stand',
        x,
        z,
        s: n.idx / SAMPLE_COUNT,
        lateral: n.lateral,
        w: 42,
        h: 10,
        color: '#334155'
      }, n.idx);
    }
  }

  return {
    def: trackDef,
    samples,
    sampleCount: SAMPLE_COUNT,
    totalLength,
    halfW,
    shoulder,
    pitS: 0.92,
    isRain,
    weather,
    props,
    sampleProps
  };
}

const IMAGE_URLS = {
  bg_city: '/src/assets/images/bg_city_streets_1795015212726.jpg',
  bg_desert: '/src/assets/images/bg_desert_highway_1795015213465.jpg',
  bg_mountain: '/src/assets/images/bg_mountain_pass_1795015213670.jpg',
  bg_coastal: '/src/assets/images/bg_coastal_raceway_1795015213884.jpg',
  studio_gt: '/src/assets/images/car_studio_gt_1795015214339.jpg',
  studio_muscle: '/src/assets/images/car_studio_muscle_1795015216206.jpg',
  studio_hyper: '/src/assets/images/car_studio_hyper_1795015214608.jpg',
  chase_raw: '/src/assets/images/car_chase_rear_1795015216397.jpg',
  top_raw: '/src/assets/images/car_topdown_real_1795015215132.jpg',
  cockpit_raw: '/src/assets/images/cockpit_interior_1795015216001.jpg'
} as const;

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean.padEnd(6, '0');
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function createCanvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  return [c, ctx];
}

// Fast 3x3 Unsharp-Mask + Micro-Clarity pass executed once per photographic asset
function applyUnsharpClarity(imgData: ImageData, amount = 0.42, microContrast = 0.06): void {
  const w = imgData.width;
  const h = imgData.height;
  const d = imgData.data;
  const src = new Uint8ClampedArray(d);
  const rowStride = w * 4;

  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const idx = (y * w + x) * 4;
      if (src[idx + 3] < 12) continue;
      for (let ch = 0; ch < 3; ch++) {
        const c = src[idx + ch];
        const blur = (
          src[idx - 4 + ch] +
          src[idx + 4 + ch] +
          src[idx - rowStride + ch] +
          src[idx + rowStride + ch]
        ) * 0.25;
        let v = c + (c - blur) * amount;
        // Subtle S-curve micro-clarity for rich 4K dynamic punch
        const norm = v / 255;
        v += Math.sin(norm * Math.PI * 2) * (-microContrast * 255 * 0.25);
        d[idx + ch] = v < 0 ? 0 : v > 255 ? 255 : v | 0;
      }
    }
  }
}

function sharpenImageToCanvas(img: HTMLImageElement, amount = 0.36): HTMLCanvasElement {
  const w = img.naturalWidth || 1376;
  const h = img.naturalHeight || 768;
  const [c, ctx] = createCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  applyUnsharpClarity(imgData, amount, 0.05);
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function extractChaseCarCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth || 1200;
  const h = img.naturalHeight || 896;
  const [c, ctx] = createCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const isBgPixel = (idx: number, x: number, y: number, refR: number, refG: number, refB: number): boolean => {
    const r = d[idx];
    const g = d[idx + 1];
    const b = d[idx + 2];
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    if (maxc >= 82 || maxc - minc > 20) return false;
    if (y >= h * 0.56 && x >= w * 0.197 && x <= w * 0.803 && maxc < 26) return false;
    const nDist = Math.abs(r - refR) + Math.abs(g - refG) + Math.abs(b - refB);
    return nDist < 36;
  };

  const seedPixel = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const idx = p * 4;
    const maxc = Math.max(d[idx], d[idx + 1], d[idx + 2]);
    if (maxc < 85) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < w; x += 2) {
    seedPixel(x, 0);
    seedPixel(x, h - 1);
  }
  for (let y = 0; y < h; y += 2) {
    seedPixel(0, y);
    seedPixel(w - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p / w) | 0;
    const idx = p * 4;
    const r = d[idx], g = d[idx + 1], b = d[idx + 2];
    d[idx + 3] = 0;

    const tryPush = (nx: number, ny: number) => {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) return;
      const np = ny * w + nx;
      if (visited[np]) return;
      if (isBgPixel(np * 4, nx, ny, r, g, b)) {
        visited[np] = 1;
        queue[tail++] = np;
      }
    };

    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  const leftTireX = Math.floor(w * 0.196);
  const rightTireX = Math.floor(w * 0.804);
  const bottomCutY = Math.floor(h * 0.766);
  const diffX1 = Math.floor(w * 0.305);
  const diffX2 = Math.floor(w * 0.695);

  for (let y = Math.floor(h * 0.60); y < h; y++) {
    for (let x = 0; x < w; x++) {
      const idx = (y * w + x) * 4;
      if (d[idx + 3] === 0) continue;
      if (y > bottomCutY || x < leftTireX || x > rightTireX) {
        d[idx + 3] = 0;
      } else if (y > Math.floor(h * 0.715) && x >= diffX1 && x <= diffX2) {
        const lum = (d[idx] + d[idx + 1] + d[idx + 2]) / 3;
        if (lum > 24) d[idx + 3] = 0;
      } else if (y > Math.floor(h * 0.742)) {
        const t = (y - h * 0.742) / (bottomCutY - h * 0.742);
        d[idx + 3] = Math.round(d[idx + 3] * clamp(1 - t * 0.85, 0, 1));
      }
    }
  }

  applyUnsharpClarity(imgData, 0.48, 0.06);
  ctx.putImageData(imgData, 0, 0);

  const cropX = Math.floor(w * 0.185);
  const cropY = Math.floor(h * 0.22);
  const cropW = Math.floor(w * 0.63);
  const cropH = Math.floor(h * 0.55);
  const [out, octx] = createCanvas(cropW, cropH);
  octx.drawImage(c, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return out;
}

function extractTopDownCarCanvas(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth || 1024;
  const h = img.naturalHeight || 1024;
  const [c, ctx] = createCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const seedBg = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const idx = p * 4;
    if (Math.max(d[idx], d[idx + 1], d[idx + 2]) < 95) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  };

  for (let x = 0; x < w; x++) {
    seedBg(x, 0);
    seedBg(x, h - 1);
  }
  for (let y = 0; y < h; y++) {
    seedBg(0, y);
    seedBg(w - 1, y);
  }

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p / w) | 0;
    const idx = p * 4;
    const r = d[idx], g = d[idx + 1], b = d[idx + 2];
    d[idx + 3] = 0;

    const tryPush = (nx: number, ny: number) => {
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) return;
      const np = ny * w + nx;
      if (visited[np]) return;
      const ni = np * 4;
      const nr = d[ni], ng = d[ni + 1], nb = d[ni + 2];
      const maxc = Math.max(nr, ng, nb);
      const minc = Math.min(nr, ng, nb);
      if (maxc < 86 && maxc > 24 && (maxc - minc) < 16) {
        const diff = Math.abs(nr - r) + Math.abs(ng - g) + Math.abs(nb - b);
        if (diff < 32) {
          visited[np] = 1;
          queue[tail++] = np;
        }
      }
    };

    tryPush(x + 1, y);
    tryPush(x - 1, y);
    tryPush(x, y + 1);
    tryPush(x, y - 1);
  }

  applyUnsharpClarity(imgData, 0.45, 0.06);
  ctx.putImageData(imgData, 0, 0);

  const cropX = Math.floor(w * 0.25);
  const cropY = Math.floor(h * 0.04);
  const cropW = Math.floor(w * 0.50);
  const cropH = Math.floor(h * 0.91);
  const [out, octx] = createCanvas(cropW, cropH);
  octx.drawImage(c, cropX, cropY, cropW, cropH, 0, 0, cropW, cropH);
  return out;
}

function extractCockpitOverlay(img: HTMLImageElement): HTMLCanvasElement {
  const w = img.naturalWidth || 1376;
  const h = img.naturalHeight || 768;
  const [c, ctx] = createCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const visited = new Uint8Array(w * h);
  const queue = new Int32Array(w * h);
  let head = 0;
  let tail = 0;

  const pushIfWhite = (x: number, y: number) => {
    if (x < 0 || x >= w || y < 0 || y >= h) return;
    const p = y * w + x;
    if (visited[p]) return;
    const idx = p * 4;
    const r = d[idx], g = d[idx + 1], b = d[idx + 2];
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    if (minc > 190 && maxc - minc < 32) {
      visited[p] = 1;
      queue[tail++] = p;
    }
  };

  pushIfWhite(Math.floor(w * 0.5), 4);
  pushIfWhite(Math.floor(w * 0.35), Math.floor(h * 0.25));
  pushIfWhite(4, Math.floor(h * 0.52));
  pushIfWhite(15, Math.floor(h * 0.70));

  while (head < tail) {
    const p = queue[head++];
    const x = p % w;
    const y = (p / w) | 0;
    const idx = p * 4;
    const lum = (d[idx] + d[idx + 1] + d[idx + 2]) / 3;
    d[idx + 3] = lum > 224 ? 0 : Math.round(((224 - lum) / 34) * 185);
    pushIfWhite(x + 1, y);
    pushIfWhite(x - 1, y);
    pushIfWhite(x, y + 1);
    pushIfWhite(x, y - 1);
  }

  applyUnsharpClarity(imgData, 0.38, 0.05);
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function buildTintedSprite(base: HTMLCanvasElement, hexColor: string, isGhost = false): HTMLCanvasElement {
  const w = base.width;
  const h = base.height;
  const [c, ctx] = createCanvas(w, h);
  ctx.drawImage(base, 0, 0);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  if (isGhost) {
    for (let i = 0; i < d.length; i += 4) {
      if (d[i + 3] === 0) continue;
      const lum = (d[i] * 0.3 + d[i + 1] * 0.59 + d[i + 2] * 0.11) / 255;
      d[i] = Math.round(34 + lum * 45);
      d[i + 1] = Math.round(185 + lum * 65);
      d[i + 2] = Math.round(230 + lum * 25);
      d[i + 3] = Math.round(d[i + 3] * 0.52);
    }
    ctx.putImageData(imgData, 0, 0);
    return c;
  }

  const [tr, tg, tb] = hexToRgb(hexColor);
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] === 0) continue;
    const r = d[i], g = d[i + 1], b = d[i + 2];
    const maxc = Math.max(r, g, b);
    const minc = Math.min(r, g, b);
    const sat = maxc > 0 ? (maxc - minc) / maxc : 0;
    if (maxc > 76 && sat < 0.24) {
      const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
      const shade = Math.pow(lum, 0.88);
      // Clearcoat metallic specular glint
      const spec = lum > 0.82 ? (lum - 0.82) * 210 : 0;
      const mix = clamp((maxc - 76) / 60, 0, 1);
      const nr = clamp(tr * shade * 1.16 + spec, 0, 255);
      const ng = clamp(tg * shade * 1.16 + spec, 0, 255);
      const nb = clamp(tb * shade * 1.16 + spec, 0, 255);
      d[i] = Math.round(lerp(r, nr, mix));
      d[i + 1] = Math.round(lerp(g, ng, mix));
      d[i + 2] = Math.round(lerp(b, nb, mix));
    }
  }
  ctx.putImageData(imgData, 0, 0);
  return c;
}

function buildTintedStudioCanvas(img: HTMLImageElement, studioKey: string, hexColor: string): HTMLCanvasElement {
  const w = img.naturalWidth || 1376;
  const h = img.naturalHeight || 768;
  const [c, ctx] = createCanvas(w, h);
  ctx.drawImage(img, 0, 0, w, h);
  const imgData = ctx.getImageData(0, 0, w, h);
  const d = imgData.data;

  const [tr, tg, tb] = hexToRgb(hexColor);
  const cx = studioKey === 'studio_hyper' ? 0.50 : 0.52;
  const cy = studioKey === 'studio_hyper' ? 0.54 : 0.49;
  const rx = 0.37;
  const ry = studioKey === 'studio_hyper' ? 0.21 : 0.23;

  for (let y = Math.floor(h * 0.26); y < Math.floor(h * 0.77); y++) {
    const yn = (y / h - cy) / ry;
    const yn2 = yn * yn;
    if (yn2 > 1.2) continue;

    for (let x = Math.floor(w * 0.13); x < Math.floor(w * 0.90); x++) {
      const xn = (x / w - cx) / rx;
      const dist2 = xn * xn + yn2;
      if (dist2 > 1.0) continue;

      const idx = (y * w + x) * 4;
      const r = d[idx], g = d[idx + 1], b = d[idx + 2];
      const maxc = Math.max(r, g, b);
      const minc = Math.min(r, g, b);
      const sat = maxc > 0 ? (maxc - minc) / maxc : 0;

      if (maxc > 78 && sat < 0.20) {
        const mask = clamp((1.0 - dist2) * 3.5, 0, 1);
        const lum = (r * 0.299 + g * 0.587 + b * 0.114) / 255;
        const shade = Math.pow(lum, 0.88);
        const spec = lum > 0.82 ? (lum - 0.82) * 215 : 0;
        const mix = clamp((maxc - 78) / 56, 0, 1) * mask;
        const nr = clamp(tr * shade * 1.16 + spec, 0, 255);
        const ng = clamp(tg * shade * 1.16 + spec, 0, 255);
        const nb = clamp(tb * shade * 1.16 + spec, 0, 255);
        d[idx] = Math.round(lerp(r, nr, mix));
        d[idx + 1] = Math.round(lerp(g, ng, mix));
        d[idx + 2] = Math.round(lerp(b, nb, mix));
      }
    }
  }

  applyUnsharpClarity(imgData, 0.42, 0.06);
  ctx.putImageData(imgData, 0, 0);
  return c;
}

interface CamPt3 {
  x: number;
  z: number;
}

function clipPolygonNearZ(poly: CamPt3[], zNear: number): CamPt3[] {
  const out: CamPt3[] = [];
  const len = poly.length;
  for (let i = 0; i < len; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % len];
    const aIn = a.z >= zNear;
    const bIn = b.z >= zNear;
    if (aIn && bIn) {
      out.push(b);
    } else if (aIn && !bIn) {
      const t = (zNear - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, z: zNear });
    } else if (!aIn && bIn) {
      const t = (zNear - a.z) / (b.z - a.z);
      out.push({ x: a.x + (b.x - a.x) * t, z: zNear });
      out.push(b);
    }
  }
  return out;
}

export class RealLifeRenderer {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  width = window.innerWidth;
  height = window.innerHeight;
  dpr = 1;
  quality: QualityMode = 'ultra';

  rawImages: Record<string, HTMLImageElement> = {};
  bgSharpened: Record<string, HTMLCanvasElement> = {};
  chaseBase: HTMLCanvasElement | null = null;
  topBase: HTMLCanvasElement | null = null;
  cockpitOverlay: HTMLCanvasElement | null = null;
  spriteCache = new Map<string, HTMLCanvasElement>();
  studioCache = new Map<string, HTMLCanvasElement>();

  rainDrops: Array<{ x: number; y: number; len: number; spd: number; depth: number }> = [];
  windshieldDrops: Array<{ x: number; y: number; r: number; vy: number }> = [];
  smoothCamYaw: number | null = null;

  constructor(container: HTMLElement, initialQuality: QualityMode = 'ultra') {
    this.quality = initialQuality;
    this.canvas = document.createElement('canvas');
    this.canvas.style.display = 'block';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    container.appendChild(this.canvas);
    this.ctx = this.canvas.getContext('2d', { alpha: false })!;
    this.resize();
    this.initRain();
    this.preloadAssets();
  }

  setQuality(q: QualityMode) {
    this.quality = q;
    this.resize();
  }

  initRain() {
    this.rainDrops = Array.from({ length: 240 }, () => {
      const depth = 0.5 + Math.random() * 0.9;
      return {
        x: Math.random(),
        y: Math.random(),
        len: (12 + Math.random() * 24) * depth,
        spd: (1.3 + Math.random() * 0.9) * depth,
        depth
      };
    });
    this.windshieldDrops = Array.from({ length: 58 }, () => ({
      x: 0.08 + Math.random() * 0.84,
      y: Math.random() * 0.58,
      r: 1.5 + Math.random() * 3.0,
      vy: 0.07 + Math.random() * 0.15
    }));
  }

  preloadAssets() {
    (Object.entries(IMAGE_URLS) as Array<[string, string]>).forEach(([key, url]) => {
      const img = new Image();
      img.decoding = 'async';
      img.onload = () => {
        this.rawImages[key] = img;
        if (key === 'chase_raw') {
          this.chaseBase = extractChaseCarCanvas(img);
          this.spriteCache.clear();
        } else if (key === 'top_raw') {
          this.topBase = extractTopDownCarCanvas(img);
          this.spriteCache.clear();
        } else if (key === 'cockpit_raw') {
          this.cockpitOverlay = extractCockpitOverlay(img);
        } else if (key.startsWith('bg_')) {
          this.bgSharpened[key] = sharpenImageToCanvas(img, 0.34);
        } else if (key.startsWith('studio_')) {
          this.studioCache.clear();
        }
      };
      img.src = url;
    });
  }

  resize() {
    const nativeDpr = window.devicePixelRatio || 1;
    let targetDpr = 1;
    if (this.quality === 'ultra') {
      // Render at full native 4K/Retina DPR or 1.6x supersampling on 1080p screens (capped at 3840w)
      const maxWidthCap = 3840 / Math.max(1, window.innerWidth);
      targetDpr = clamp(Math.max(nativeDpr, 1.6), 1.0, Math.min(3.0, maxWidthCap));
    } else if (this.quality === 'high') {
      targetDpr = Math.min(nativeDpr, 2);
    } else {
      targetDpr = 1;
    }

    this.dpr = targetDpr;
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.canvas.width = Math.max(1, Math.floor(this.width * this.dpr));
    this.canvas.height = Math.max(1, Math.floor(this.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.imageSmoothingQuality = this.quality === 'perf' ? 'medium' : 'high';
  }

  getCarSprite(kind: 'chase' | 'top', colorHex: string, isGhost = false): HTMLCanvasElement | null {
    const base = kind === 'chase' ? this.chaseBase : this.topBase;
    if (!base) return null;
    const key = `${kind}:${isGhost ? 'ghost' : colorHex}`;
    let cached = this.spriteCache.get(key);
    if (!cached) {
      cached = buildTintedSprite(base, colorHex, isGhost);
      this.spriteCache.set(key, cached);
    }
    return cached;
  }

  getStudioShowcaseImage(studioKey: string, colorHex: string): HTMLCanvasElement | HTMLImageElement | null {
    const img = this.rawImages[studioKey];
    if (!img || !img.complete || img.naturalWidth === 0) return null;
    const key = `${studioKey}:${colorHex}`;
    let cached = this.studioCache.get(key);
    if (!cached) {
      cached = buildTintedStudioCanvas(img, studioKey, colorHex);
      if (this.studioCache.size > 24) this.studioCache.clear();
      this.studioCache.set(key, cached);
    }
    return cached;
  }

  updateRain(dt: number, isRain: boolean) {
    if (!isRain) return;
    for (let i = 0; i < this.rainDrops.length; i++) {
      const d = this.rainDrops[i];
      d.y += d.spd * dt;
      d.x -= d.spd * 0.14 * dt;
      if (d.y > 1.05) {
        d.y = -0.05;
        d.x = Math.random();
      }
      if (d.x < -0.05) d.x += 1.1;
    }
    for (let i = 0; i < this.windshieldDrops.length; i++) {
      const w = this.windshieldDrops[i];
      w.y += w.vy * dt;
      if (w.y > 0.62) {
        w.y = 0.02 + Math.random() * 0.1;
        w.x = 0.10 + Math.random() * 0.80;
      }
    }
  }

  drawStudioShowcase(
    carDef: any,
    custom: any,
    weather: string,
    orbitYaw: number,
    orbitDist: number,
    isMenu: boolean,
    nowSec: number,
    orbitPitch = 0.28
  ) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    ctx.fillStyle = '#07080c';
    ctx.fillRect(0, 0, W, H);

    const studioKey =
      carDef.bodyType === 'muscle' || carDef.bodyType === 'viper'
        ? 'studio_muscle'
        : carDef.bodyType === 'super' || carDef.bodyType === 'hyper'
          ? 'studio_hyper'
          : 'studio_gt';

    const color = (custom && custom.color) || carDef.defaultColor;
    const spoiler = (custom && custom.spoiler) || 'street';
    const wheels = (custom && custom.wheels) || '5spoke';
    const studioImg = this.getStudioShowcaseImage(studioKey, color);

    const yawDelta = Math.atan2(Math.sin(orbitYaw - 0.8), Math.cos(orbitYaw - 0.8));
    const rearBlend = !isMenu ? clamp((Math.abs(yawDelta) - 0.75) / 0.45, 0, 1) : 0;

    if (studioImg && rearBlend < 0.99) {
      const iw = studioImg.width;
      const ih = studioImg.height;
      const baseScale = Math.max(W / iw, H / ih);
      const minZoom = isMenu ? 1.04 + Math.sin(nowSec * 0.35) * 0.025 : 1.14;
      const zoom = isMenu ? minZoom : clamp(1.52 - (orbitDist - 4.2) * 0.055, minZoom, 1.52);
      const dw = iw * baseScale * zoom;
      const dh = ih * baseScale * zoom;
      const maxPanX = Math.max(0, (dw - W) * 0.48);
      const maxPanY = Math.max(0, (dh - H) * 0.48);
      const panX = isMenu
        ? Math.sin(nowSec * 0.25) * Math.min(28, maxPanX)
        : clamp(Math.sin(yawDelta) * maxPanX * 1.4, -maxPanX, maxPanX);
      const panY = isMenu
        ? 0
        : clamp((orbitPitch - 0.28) * maxPanY * 1.6, -maxPanY, maxPanY);
      const dx = (W - dw) * 0.5 + panX + (isMenu ? W * 0.08 : 0);
      const dy = (H - dh) * 0.5 - panY;

      ctx.save();
      ctx.globalAlpha = 1 - rearBlend;
      ctx.drawImage(studioImg, dx, dy, dw, dh);

      // Subtle animated studio softbox sweep reflection across bodywork
      const sweepPos = ((nowSec * 0.18) % 1.6) - 0.3;
      const swGrad = ctx.createLinearGradient(W * (sweepPos - 0.14), H * 0.2, W * (sweepPos + 0.14), H * 0.8);
      swGrad.addColorStop(0, 'rgba(255,255,255,0)');
      swGrad.addColorStop(0.5, 'rgba(255,255,255,0.055)');
      swGrad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = swGrad;
      ctx.fillRect(0, 0, W, H);
      ctx.restore();
    } else if (!studioImg) {
      const g = ctx.createLinearGradient(0, 0, 0, H);
      g.addColorStop(0, '#18181b');
      g.addColorStop(1, '#09090b');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }

    // Rear Garage Angle Showcase (displays painted Rear Widebody + Floor Reflection + Spoiler & Wheel accents)
    if (rearBlend > 0.01) {
      ctx.save();
      ctx.globalAlpha = rearBlend;
      const bg = ctx.createLinearGradient(0, 0, 0, H);
      bg.addColorStop(0, '#090b10');
      bg.addColorStop(0.55, '#131823');
      bg.addColorStop(0.58, '#1a1f2b');
      bg.addColorStop(1, '#07090e');
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, W, H);

      // Studio cyclorama horizon glow
      const rim = ctx.createRadialGradient(W * 0.5, H * 0.56, 20, W * 0.5, H * 0.56, W * 0.42);
      rim.addColorStop(0, 'rgba(148, 163, 184, 0.18)');
      rim.addColorStop(1, 'rgba(15, 23, 42, 0)');
      ctx.fillStyle = rim;
      ctx.fillRect(0, H * 0.2, W, H * 0.6);

      // Overhead studio light reflection strip
      const lg = ctx.createLinearGradient(0, H * 0.08, 0, H * 0.15);
      lg.addColorStop(0, 'rgba(255,255,255,0)');
      lg.addColorStop(0.5, 'rgba(248,250,252,0.85)');
      lg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = lg;
      ctx.fillRect(W * 0.24, H * 0.09, W * 0.52, H * 0.04);

      const scaleZoom = clamp(1.35 - (orbitDist - 4.2) * 0.06, 0.75, 1.45);
      const unitScale = H * 0.17 * scaleZoom;
      const baseY = H * 0.71;

      // Glossy studio floor reflection beneath rear car
      const sprite = this.getCarSprite('chase', color, false);
      if (sprite) {
        const carW = clamp(unitScale * 2.35, 10, 580);
        const carH = carW * (sprite.height / sprite.width);
        ctx.save();
        ctx.translate(W * 0.5, baseY);
        ctx.scale(1, -0.34);
        ctx.globalAlpha = rearBlend * 0.24;
        ctx.drawImage(sprite, -carW * 0.5, -carH, carW, carH);
        ctx.restore();
      }

      this.drawRearCarSprite(
        W * 0.5,
        baseY,
        unitScale,
        color,
        false,
        true,
        false,
        '',
        0,
        0,
        spoiler,
        wheels,
        weather
      );
      ctx.restore();
    }

    if (!isMenu) {
      const wheelLabel = wheels === '5spoke' ? '5-Spoke' : wheels === 'mesh' ? 'Mesh' : wheels === 'deep' ? 'Deep Dish' : 'Carbon Aero';
      const wingLabel = spoiler === 'none' ? 'Stock Lip' : spoiler === 'street' ? 'Street Wing' : spoiler === 'gt' ? 'GT Carbon Wing' : 'Ducktail';
      const angleLabel = rearBlend > 0.5 ? 'Rear Widebody View' : 'Studio 3/4 View';
      ctx.save();
      ctx.fillStyle = 'rgba(8, 9, 12, 0.80)';
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.20)';
      ctx.lineWidth = 1;
      const bw = 360;
      const bx = W * 0.5 - bw * 0.5;
      const by = H - 96;
      ctx.fillRect(bx, by, bw, 32);
      ctx.strokeRect(bx, by, bw, 32);
      ctx.fillStyle = '#f1f5f9';
      ctx.font = '600 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`${angleLabel} · ${wingLabel} · ${wheelLabel}`, W * 0.5, by + 16);
      ctx.restore();
    }

    if (weather === 'sunset') {
      const sGrad = ctx.createLinearGradient(0, 0, W, H);
      sGrad.addColorStop(0, 'rgba(249, 115, 22, 0.16)');
      sGrad.addColorStop(1, 'rgba(15, 23, 42, 0.24)');
      ctx.fillStyle = sGrad;
      ctx.fillRect(0, 0, W, H);
    } else if (weather === 'night') {
      ctx.fillStyle = 'rgba(2, 6, 23, 0.34)';
      ctx.fillRect(0, 0, W, H);
    } else if (weather === 'rain') {
      ctx.fillStyle = 'rgba(30, 41, 59, 0.26)';
      ctx.fillRect(0, 0, W, H);
      this.drawScreenRain(0.36);
    }

    const vig = ctx.createLinearGradient(0, 0, W, 0);
    vig.addColorStop(0, isMenu ? 'rgba(6, 7, 10, 0.86)' : 'rgba(6, 7, 10, 0.54)');
    vig.addColorStop(0.42, 'rgba(6, 7, 10, 0.06)');
    vig.addColorStop(1, 'rgba(6, 7, 10, 0.54)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, W, H);
  }

  drawScreenRain(alpha = 0.45) {
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    ctx.save();
    ctx.strokeStyle = `rgba(215, 226, 240, ${alpha})`;
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let i = 0; i < this.rainDrops.length; i++) {
      const r = this.rainDrops[i];
      const x = r.x * W;
      const y = r.y * H;
      ctx.moveTo(x, y);
      ctx.lineTo(x - r.len * 0.15, y + r.len);
    }
    ctx.stroke();
    ctx.restore();
  }

  renderRaceScene(params: {
    track: TrackWorldData;
    player: any;
    cars: any[];
    remotes: Map<string, any>;
    ghostCar: { x: number; z: number; h: number; color: string } | null;
    smokeData: any[];
    skidMarks?: SkidSegment[];
    countdownStep?: number;
    raceActive?: boolean;
    cameraMode: number;
    isPhoto: boolean;
    photoFov: number;
    photoTilt: number;
    orbitYaw: number;
    orbitPitch?: number;
    orbitDist: number;
    keys: { brake: boolean; drift: boolean; left: boolean; right: boolean };
  }) {
    const { track, player } = params;
    if (!track || !player) return;

    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;

    ctx.save();
    ctx.fillStyle = '#07090e';
    ctx.fillRect(0, 0, W, H);

    if (params.isPhoto && params.photoTilt !== 0) {
      ctx.translate(W * 0.5, H * 0.5);
      ctx.rotate((params.photoTilt * Math.PI) / 180);
      ctx.translate(-W * 0.5, -H * 0.5);
    }

    if (params.cameraMode === 2) {
      this.renderTopDownDrone(params);
    } else {
      this.renderRealRoadPerspective(params);
    }

    if (track.isRain) {
      this.drawScreenRain(params.cameraMode === 1 ? 0.26 : 0.46);
      if (params.cameraMode === 1) {
        ctx.save();
        for (let i = 0; i < this.windshieldDrops.length; i++) {
          const d = this.windshieldDrops[i];
          const dx = d.x * W;
          const dy = d.y * H;
          ctx.fillStyle = 'rgba(226, 232, 240, 0.34)';
          ctx.beginPath();
          ctx.ellipse(dx, dy, d.r, d.r * 1.45, 0, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
          ctx.beginPath();
          ctx.arc(dx - d.r * 0.25, dy - d.r * 0.35, Math.max(0.6, d.r * 0.3), 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }
    }

    // Peripheral high-speed & nitro motion sense
    const mph = player.speed * 2.55;
    if (!params.isPhoto && params.cameraMode !== 2 && (mph > 118 || player.nitroActive)) {
      const intensity = clamp((mph - 118) / 95 + (player.nitroActive ? 0.42 : 0), 0, 0.72);
      ctx.save();
      const rad = ctx.createRadialGradient(W * 0.5, H * 0.52, Math.min(W, H) * 0.30, W * 0.5, H * 0.52, Math.max(W, H) * 0.72);
      rad.addColorStop(0, 'rgba(0,0,0,0)');
      rad.addColorStop(1, player.nitroActive ? `rgba(14, 165, 233, ${intensity * 0.22})` : `rgba(8, 10, 16, ${intensity * 0.34})`);
      ctx.fillStyle = rad;
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = player.nitroActive
        ? `rgba(125, 211, 252, ${intensity * 0.34})`
        : `rgba(241, 245, 249, ${intensity * 0.20})`;
      ctx.lineWidth = 1.4;
      const cx = W * 0.5;
      const cy = H * 0.45;
      const tNow = performance.now() * 0.012;
      ctx.beginPath();
      for (let i = 0; i < 22; i++) {
        const ang = (i / 22) * Math.PI * 2 + (i % 2 === 0 ? 0.04 : -0.04);
        const r0 = Math.max(W, H) * (0.40 + ((i * 7 + Math.floor(tNow)) % 5) * 0.03);
        const r1 = r0 + 55 + intensity * 65;
        ctx.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0);
        ctx.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1);
      }
      ctx.stroke();
      ctx.restore();
    }

    // Crisp cinematic optical edge vignette
    const edgeVig = ctx.createRadialGradient(W * 0.5, H * 0.5, Math.min(W, H) * 0.42, W * 0.5, H * 0.5, Math.max(W, H) * 0.78);
    edgeVig.addColorStop(0, 'rgba(0,0,0,0)');
    edgeVig.addColorStop(1, 'rgba(4, 6, 10, 0.38)');
    ctx.fillStyle = edgeVig;
    ctx.fillRect(0, 0, W, H);

    ctx.restore();
  }

  private renderRealRoadPerspective(params: {
    track: TrackWorldData;
    player: any;
    cars: any[];
    remotes: Map<string, any>;
    ghostCar: { x: number; z: number; h: number; color: string } | null;
    smokeData: any[];
    skidMarks?: SkidSegment[];
    countdownStep?: number;
    raceActive?: boolean;
    cameraMode: number;
    isPhoto: boolean;
    photoFov: number;
    orbitYaw: number;
    orbitPitch?: number;
    orbitDist: number;
    keys: { brake: boolean; drift: boolean; left: boolean; right: boolean };
  }) {
    const { track, player, cars, remotes, ghostCar, smokeData, cameraMode } = params;
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const weather = track.weather;
    const isNight = weather === 'night';
    const isRain = weather === 'rain';
    const isSunset = weather === 'sunset';
    const isCockpit = cameraMode === 1 && !params.isPhoto;

    // 1. TRUE 3D CAMERA POSE
    const currentYaw = this.smoothCamYaw ?? player.heading;
    const nextYaw = dampAngle(currentYaw, player.heading, 16, 1 / 60);
    this.smoothCamYaw = nextYaw;

    let camX: number;
    let camZ: number;
    let camHeight: number;
    let camYaw: number;
    let horizonY: number;
    let fovScale: number;
    let focalY: number;

    const photoZoom = params.isPhoto ? clamp(52 / Math.max(25, params.photoFov), 0.58, 2.05) : 1.0;

    if (params.isPhoto) {
      const pitch = clamp(params.orbitPitch ?? 0.25, 0.06, 0.95);
      const dist = clamp(params.orbitDist, 4.2, 14);
      camYaw = params.orbitYaw;
      const horiz = Math.cos(pitch) * dist;
      camHeight = 0.85 + Math.sin(pitch) * dist;
      camX = player.x - Math.sin(camYaw) * horiz;
      camZ = player.z - Math.cos(camYaw) * horiz;
      horizonY = H * (0.43 + (pitch - 0.25) * 0.24);
      fovScale = W * 0.80 * photoZoom;
      focalY = H * 1.18 * photoZoom;
    } else if (isCockpit) {
      camYaw = player.heading;
      camX = player.x + Math.sin(camYaw) * 0.35;
      camZ = player.z + Math.cos(camYaw) * 0.35;
      camHeight = 1.38;
      horizonY = H * 0.41;
      const nitroKick = player.nitroActive ? 1.06 : 1.0;
      fovScale = W * 0.88 * nitroKick;
      focalY = H * 1.24 * nitroKick;
    } else {
      const driftOffset = clamp((player.latSpeedVisual || 0) * 1.4, -0.07, 0.07);
      camYaw = nextYaw + driftOffset;
      const camDist = player.nitroActive ? 6.9 : 6.35;
      camX = player.x - Math.sin(camYaw) * camDist;
      camZ = player.z - Math.cos(camYaw) * camDist;
      camHeight = 2.62;
      horizonY = H * 0.42;
      const nitroKick = player.nitroActive ? 1.07 : 1.0;
      fovScale = W * 0.80 * nitroKick;
      focalY = H * 1.18 * nitroKick;
    }

    const camFwdX = Math.sin(camYaw);
    const camFwdZ = Math.cos(camYaw);
    const camRightX = -Math.cos(camYaw);
    const camRightZ = Math.sin(camYaw);

    const toCam = (wx: number, wz: number): CamPt3 => {
      const dx = wx - camX;
      const dz = wz - camZ;
      return {
        x: dx * camRightX + dz * camRightZ,
        z: dx * camFwdX + dz * camFwdZ
      };
    };

    const projectPt = (cx: number, cy: number, cz: number) => ({
      sx: W * 0.5 + (cx / cz) * fovScale,
      sy: horizonY + ((camHeight - cy) / cz) * focalY
    });

    // 2. SHARPENED REAL-LIFE PHOTOGRAPHIC HORIZON BACKDROP (Seam-free 360° pan)
    const bgKey =
      track.def.theme === 'desert' ? 'bg_desert'
        : track.def.theme === 'mountain' ? 'bg_mountain'
          : track.def.theme === 'coastal' ? 'bg_coastal' : 'bg_city';
    const bgImg: HTMLCanvasElement | HTMLImageElement | undefined = this.bgSharpened[bgKey] || this.rawImages[bgKey];

    const skyGrad = ctx.createLinearGradient(0, 0, 0, horizonY + 12);
    if (isNight) {
      skyGrad.addColorStop(0, '#02050f');
      skyGrad.addColorStop(1, '#0c1528');
    } else if (isRain) {
      skyGrad.addColorStop(0, '#1a2433');
      skyGrad.addColorStop(1, '#475569');
    } else if (isSunset) {
      skyGrad.addColorStop(0, '#17153b');
      skyGrad.addColorStop(0.55, '#9d174d');
      skyGrad.addColorStop(1, '#fb923c');
    } else {
      skyGrad.addColorStop(0, '#1d4ed8');
      skyGrad.addColorStop(1, '#bae6fd');
    }
    ctx.fillStyle = skyGrad;
    ctx.fillRect(0, 0, W, horizonY + 14);

    if (bgImg) {
      const bw = bgImg instanceof HTMLImageElement ? bgImg.naturalWidth : bgImg.width;
      const bh = bgImg instanceof HTMLImageElement ? bgImg.naturalHeight : bgImg.height;
      if (bw > 0 && bh > 0) {
        const skyH = Math.max(80, horizonY + 32);
        const scale = Math.max(W / bw, skyH / (bh * 0.62));
        const tileW = bw * scale;
        const tileH = bh * scale;
        const doubleW = tileW * 2;
        const panRatio = (((-camYaw / (Math.PI * 2)) % 1) + 1) % 1;
        const offsetX = -panRatio * doubleW;
        const drawY = horizonY + 18 - tileH * 0.56;

        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, W, horizonY + 16);
        ctx.clip();
        ctx.globalAlpha = isNight ? 0.42 : isRain ? 0.72 : 0.98;

        for (let x = offsetX; x < W; x += doubleW) {
          ctx.drawImage(bgImg, x, drawY, tileW, tileH);
          ctx.save();
          ctx.translate(x + doubleW, 0);
          ctx.scale(-1, 1);
          ctx.drawImage(bgImg, 0, drawY, tileW, tileH);
          ctx.restore();
        }
        ctx.restore();
      }
    }

    // Directional Sun Disk & Anamorphic Solar Flare (Day / Sunset)
    const sunAzimuth = 0.72;
    let sunDiff = sunAzimuth - camYaw;
    while (sunDiff > Math.PI) sunDiff -= Math.PI * 2;
    while (sunDiff < -Math.PI) sunDiff += Math.PI * 2;
    if (!isNight && !isRain && Math.abs(sunDiff) < 1.15) {
      const sunX = W * 0.5 + Math.tan(sunDiff) * fovScale * 0.75;
      const sunY = horizonY - (isSunset ? 34 : 118);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const sunGlow = ctx.createRadialGradient(sunX, sunY, 4, sunX, sunY, W * 0.28);
      sunGlow.addColorStop(0, isSunset ? 'rgba(255, 237, 213, 0.78)' : 'rgba(255, 255, 255, 0.55)');
      sunGlow.addColorStop(0.22, isSunset ? 'rgba(251, 146, 60, 0.36)' : 'rgba(186, 230, 253, 0.22)');
      sunGlow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = sunGlow;
      ctx.fillRect(0, 0, W, horizonY + 80);

      if (isSunset) {
        const streak = ctx.createLinearGradient(sunX - W * 0.32, sunY, sunX + W * 0.32, sunY);
        streak.addColorStop(0, 'rgba(251, 146, 60, 0)');
        streak.addColorStop(0.5, 'rgba(254, 215, 170, 0.28)');
        streak.addColorStop(1, 'rgba(251, 146, 60, 0)');
        ctx.fillStyle = streak;
        ctx.fillRect(sunX - W * 0.32, sunY - 2, W * 0.64, 4);
      }
      ctx.restore();
    }

    // Horizon atmospheric haze
    const hazeGrad = ctx.createLinearGradient(0, horizonY - 45, 0, horizonY + 22);
    hazeGrad.addColorStop(0, 'rgba(0,0,0,0)');
    hazeGrad.addColorStop(
      1,
      isNight ? 'rgba(11, 18, 32, 0.92)' : isRain ? 'rgba(71, 85, 105, 0.84)' : isSunset ? 'rgba(194, 106, 90, 0.62)' : 'rgba(199, 223, 247, 0.58)'
    );
    ctx.fillStyle = hazeGrad;
    ctx.fillRect(0, horizonY - 45, W, 70);

    // 3. PERSPECTIVE TERRAIN GROUND BASE + DEPTH BANDS
    const groundGrad = ctx.createLinearGradient(0, horizonY, 0, H);
    if (isNight) {
      groundGrad.addColorStop(0, '#090e17');
      groundGrad.addColorStop(1, '#05070c');
    } else if (track.def.theme === 'desert') {
      groundGrad.addColorStop(0, isSunset ? '#733d21' : '#945530');
      groundGrad.addColorStop(1, isSunset ? '#4f2814' : '#6c3a1f');
    } else if (track.def.theme === 'city') {
      groundGrad.addColorStop(0, '#1a1f28');
      groundGrad.addColorStop(1, '#101319');
    } else {
      groundGrad.addColorStop(0, '#213926');
      groundGrad.addColorStop(1, '#122216');
    }
    ctx.fillStyle = groundGrad;
    ctx.fillRect(0, horizonY, W, H - horizonY);

    // Subtle horizontal distance strata so terrain reads with depth
    for (let band = 0; band < 7; band++) {
      const zDist = 14 * Math.pow(1.48, band);
      const yTop = horizonY + ((camHeight) / (zDist * 1.4)) * focalY;
      const yBot = horizonY + ((camHeight) / zDist) * focalY;
      if (yBot > H) continue;
      ctx.fillStyle = band % 2 === 0 ? 'rgba(255,255,255,0.022)' : 'rgba(0,0,0,0.035)';
      ctx.fillRect(0, Math.min(yTop, yBot), W, Math.abs(yBot - yTop));
    }

    // Coastal ocean bay on horizon when looking North
    if (track.def.theme === 'coastal' && Math.cos(camYaw) < 0.35) {
      const bayTop = horizonY;
      const bayBottom = horizonY + (H - horizonY) * 0.16;
      const bayGrad = ctx.createLinearGradient(0, bayTop, 0, bayBottom);
      bayGrad.addColorStop(0, isNight ? 'rgba(7, 25, 45, 0.78)' : 'rgba(14, 116, 144, 0.56)');
      bayGrad.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bayGrad;
      ctx.fillRect(0, bayTop, W, bayBottom - bayTop);
    }

    // 4. TRUE 3D CAMERA-SPACE ROAD RENDERING (Near-Plane Clipped + Depth Sorted)
    const samps = track.samples;
    const N = track.sampleCount;
    const halfW = track.halfW;
    const shoulder = track.shoulder;
    const curbW = halfW * 0.11;
    const lineW = Math.max(0.28, halfW * 0.032);
    const Z_NEAR = 0.85;
    const MAX_DIST = 315;
    const MAX_DIST2 = MAX_DIST * MAX_DIST;

    interface RoadQuad {
      idx: number;
      midZ: number;
      a: TrackSample;
      b: TrackSample;
    }

    const visibleQuads: RoadQuad[] = [];
    for (let i = 0; i < N; i++) {
      const a = samps[i];
      const b = samps[(i + 1) % N];
      const d2a = (a.pos.x - camX) ** 2 + (a.pos.z - camZ) ** 2;
      const d2b = (b.pos.x - camX) ** 2 + (b.pos.z - camZ) ** 2;
      if (d2a > MAX_DIST2 && d2b > MAX_DIST2) continue;

      const caZ = (a.pos.x - camX) * camFwdX + (a.pos.z - camZ) * camFwdZ;
      const cbZ = (b.pos.x - camX) * camFwdX + (b.pos.z - camZ) * camFwdZ;
      if (caZ < -12 && cbZ < -12) continue;
      visibleQuads.push({ idx: i, midZ: (caZ + cbZ) * 0.5, a, b });
    }

    visibleQuads.sort((q1, q2) => q2.midZ - q1.midZ);

    const drawClippedRibbon = (
      a: TrackSample,
      b: TrackSample,
      latLeft: number,
      latRight: number,
      fillStyle: string
    ) => {
      const poly: CamPt3[] = [
        toCam(a.pos.x + a.right.x * latLeft, a.pos.z + a.right.z * latLeft),
        toCam(a.pos.x + a.right.x * latRight, a.pos.z + a.right.z * latRight),
        toCam(b.pos.x + b.right.x * latRight, b.pos.z + b.right.z * latRight),
        toCam(b.pos.x + b.right.x * latLeft, b.pos.z + b.right.z * latLeft)
      ];
      const clipped = clipPolygonNearZ(poly, Z_NEAR);
      if (clipped.length < 3) return;
      ctx.fillStyle = fillStyle;
      ctx.beginPath();
      for (let k = 0; k < clipped.length; k++) {
        const pt = projectPt(clipped[k].x, 0, clipped[k].z);
        if (k === 0) ctx.moveTo(pt.sx, pt.sy);
        else ctx.lineTo(pt.sx, pt.sy);
      }
      ctx.closePath();
      ctx.fill();
    };

    const drawGuardrailSpan = (a: TrackSample, b: TrackSample, lat: number, sharpCurve: boolean, idx: number) => {
      const ca = toCam(a.pos.x + a.right.x * lat, a.pos.z + a.right.z * lat);
      const cb = toCam(b.pos.x + b.right.x * lat, b.pos.z + b.right.z * lat);
      if (ca.z < 1.2 || cb.z < 1.2) return;
      const ba = projectPt(ca.x, 0, ca.z);
      const bb = projectPt(cb.x, 0, cb.z);
      const ta = projectPt(ca.x, 1.05, ca.z);
      const tb = projectPt(cb.x, 1.05, cb.z);
      const ma = projectPt(ca.x, 0.55, ca.z);
      const mb = projectPt(cb.x, 0.55, cb.z);

      // Steel rail beam
      ctx.fillStyle = isNight ? '#334155' : '#94a3b8';
      ctx.beginPath();
      ctx.moveTo(ta.sx, ta.sy);
      ctx.lineTo(tb.sx, tb.sy);
      ctx.lineTo(mb.sx, mb.sy);
      ctx.lineTo(ma.sx, ma.sy);
      ctx.closePath();
      ctx.fill();

      // Specular rail highlight strip
      ctx.strokeStyle = isNight ? 'rgba(148,163,184,0.3)' : 'rgba(248,250,252,0.55)';
      ctx.lineWidth = Math.max(1, 2.2 / Math.max(1, ca.z * 0.08));
      ctx.beginPath();
      ctx.moveTo(ta.sx, ta.sy);
      ctx.lineTo(tb.sx, tb.sy);
      ctx.stroke();

      // Posts every 2 segments + orange/red reflective chevron strip on sharp curves
      if (idx % 2 === 0) {
        const pw = Math.max(1.5, (fovScale / ca.z) * 0.16);
        ctx.fillStyle = '#1e293b';
        ctx.fillRect(ba.sx - pw * 0.5, ta.sy, pw, ba.sy - ta.sy);
      }
      if (sharpCurve && idx % 3 === 0) {
        const cw = Math.max(4, (fovScale / ca.z) * 0.65);
        const ch = Math.max(4, (focalY / ca.z) * 0.75);
        ctx.fillStyle = idx % 6 === 0 ? '#f59e0b' : '#ef4444';
        ctx.fillRect(ta.sx - cw * 0.5, ta.sy - ch * 0.9, cw, ch);
      }
    };

    for (let qi = 0; qi < visibleQuads.length; qi++) {
      const q = visibleQuads[qi];
      const { a, b, idx } = q;
      const stripBand = Math.floor(idx / 2) % 2 === 0;
      const grainMod = (idx * 7) % 3;
      const fogT = clamp((q.midZ - 45) / 245, 0, 0.72);

      // Shoulder / Gravel Verge
      drawClippedRibbon(a, b, -halfW - shoulder, halfW + shoulder, stripBand ? '#4b5563' : '#374151');

      // Left & Right Curbs with crisp bevel edge
      const curbCol = stripBand ? track.def.curbColors[0] : track.def.curbColors[1];
      drawClippedRibbon(a, b, -halfW - curbW, -halfW, curbCol);
      drawClippedRibbon(a, b, halfW, halfW + curbW, curbCol);

      // Multi-tone Textured Asphalt Surface
      const asphaltCol = isRain
        ? (grainMod === 0 ? '#161b24' : grainMod === 1 ? '#131820' : '#181e28')
        : isNight
          ? (grainMod === 0 ? '#141720' : grainMod === 1 ? '#11141c' : '#171a24')
          : (grainMod === 0 ? '#272b35' : grainMod === 1 ? '#232730' : '#2b2f3a');
      drawClippedRibbon(a, b, -halfW, halfW, asphaltCol);

      // Dual Rubber Racing-Line Tire Grooves (subtle dark longitudinal tracks)
      drawClippedRibbon(a, b, -halfW * 0.42, -halfW * 0.24, 'rgba(9, 11, 16, 0.24)');
      drawClippedRibbon(a, b, halfW * 0.24, halfW * 0.42, 'rgba(9, 11, 16, 0.24)');

      // World-locked Asphalt Tar Expansion Seams & Aggregate Bands on near segments
      if (q.midZ < 95 && idx % 6 === 0) {
        drawClippedRibbon(a, b, -halfW + 0.4, halfW - 0.4, 'rgba(10, 12, 16, 0.28)');
      }

      // Rain wet specular reflection sheen
      if (isRain) {
        drawClippedRibbon(a, b, -halfW * 0.52, halfW * 0.52, stripBand ? 'rgba(186, 230, 253, 0.10)' : 'rgba(148, 163, 184, 0.05)');
      }

      // Green Pit Repair Lane at s in [0.89, 0.95]
      const sFrac = idx / N;
      if (Math.abs(sFrac - track.pitS) < 0.032) {
        drawClippedRibbon(a, b, halfW * 0.56, halfW * 0.96, 'rgba(16, 185, 129, 0.48)');
      }

      // Crisp White Edge Lines
      drawClippedRibbon(a, b, -halfW + lineW * 0.6, -halfW + lineW * 1.6, 'rgba(248, 250, 252, 0.80)');
      drawClippedRibbon(a, b, halfW - lineW * 1.6, halfW - lineW * 0.6, 'rgba(248, 250, 252, 0.80)');

      // Dashed Amber Centerline
      if (stripBand) {
        drawClippedRibbon(a, b, -lineW * 0.55, lineW * 0.55, 'rgba(245, 158, 11, 0.86)');
      }

      // Reflective Cat's-Eye Road Studs on near segments
      if (q.midZ < 85 && q.midZ > 2.2 && idx % 4 === 0) {
        for (const latStud of [-halfW + lineW * 1.1, 0, halfW - lineW * 1.1]) {
          const cs = toCam(a.pos.x + a.right.x * latStud, a.pos.z + a.right.z * latStud);
          if (cs.z > 1.5) {
            const sp = projectPt(cs.x, 0.03, cs.z);
            const r = clamp((fovScale / cs.z) * 0.075, 1.2, 4.2);
            ctx.fillStyle = latStud === 0 ? 'rgba(251, 191, 36, 0.92)' : 'rgba(248, 250, 252, 0.85)';
            ctx.fillRect(sp.sx - r, sp.sy - r * 0.5, r * 2, r);
          }
        }
      }

      // Checkered Start / Finish line
      if (idx <= 1 || idx >= N - 2) {
        const sqCount = 12;
        for (let sq = 0; sq < sqCount; sq++) {
          const l0 = -halfW + (sq / sqCount) * halfW * 2;
          const l1 = -halfW + ((sq + 1) / sqCount) * halfW * 2;
          drawClippedRibbon(a, b, l0, l1, (sq + idx) % 2 === 0 ? '#f8fafc' : '#09090b');
        }
      }

      // Atmospheric haze on distant asphalt
      if (fogT > 0.12) {
        const fogCol = isNight
          ? `rgba(11, 18, 32, ${fogT * 0.55})`
          : isSunset
            ? `rgba(194, 106, 90, ${fogT * 0.36})`
            : `rgba(186, 210, 235, ${fogT * 0.34})`;
        drawClippedRibbon(a, b, -halfW - shoulder, halfW + shoulder, fogCol);
      }

      // 3D Armco Guardrails & Curve Chevrons on close-to-mid distances
      if (q.midZ < 175) {
        const sharpL = a.signedCurvature > 0.18;
        const sharpR = a.signedCurvature < -0.18;
        drawGuardrailSpan(a, b, -halfW - shoulder + 0.35, sharpR, idx);
        drawGuardrailSpan(a, b, halfW + shoulder - 0.35, sharpL, idx);
      }
    }

    // 4B. WORLD-SPACE PERSISTENT DRIFT SKIDMARKS ON ASPHALT
    if (params.skidMarks && params.skidMarks.length > 0) {
      ctx.save();
      ctx.lineCap = 'round';
      for (let i = 0; i < params.skidMarks.length; i++) {
        const sm = params.skidMarks[i];
        const c1 = toCam(sm.x1, sm.z1);
        const c2 = toCam(sm.x2, sm.z2);
        if (c1.z < 1.0 && c2.z < 1.0) continue;
        if (c1.z > 120 && c2.z > 120) continue;
        const az = Math.max(Z_NEAR, c1.z);
        const bz = Math.max(Z_NEAR, c2.z);
        const p1 = projectPt(c1.x, 0.01, az);
        const p2 = projectPt(c2.x, 0.01, bz);
        ctx.strokeStyle = `rgba(9, 10, 14, ${clamp(sm.alpha * 0.58, 0.05, 0.58)})`;
        ctx.lineWidth = clamp((fovScale / ((az + bz) * 0.5)) * 0.24, 1.2, 9);
        ctx.beginPath();
        ctx.moveTo(p1.sx, p1.sy);
        ctx.lineTo(p2.sx, p2.sy);
        ctx.stroke();
      }
      ctx.restore();
    }

    // 5. WORLD-SPACE PROPS, GANTRY, OPPONENTS & SMOKE (TRUE 3D CAMERA PROJECTED)
    const drawList: Array<{ z: number; fn: () => void }> = [];

    // Start / Finish Gantry with Truss Lattice & Live Countdown Signal Lights
    const st = samps[0];
    const gL = toCam(st.pos.x - st.right.x * (halfW + 1.4), st.pos.z - st.right.z * (halfW + 1.4));
    const gR = toCam(st.pos.x + st.right.x * (halfW + 1.4), st.pos.z + st.right.z * (halfW + 1.4));
    if (gL.z > 1.2 && gR.z > 1.2 && gL.z < 260) {
      const midZ = (gL.z + gR.z) * 0.5;
      drawList.push({
        z: midZ,
        fn: () => {
          const pL = projectPt(gL.x, 0, gL.z);
          const pR = projectPt(gR.x, 0, gR.z);
          const topL = projectPt(gL.x, 8.2, gL.z);
          const topR = projectPt(gR.x, 8.2, gR.z);
          const pilW = Math.max(5, (fovScale / midZ) * 1.05);

          // Cast shadow strip across start/finish line
          ctx.fillStyle = 'rgba(0, 0, 0, 0.30)';
          ctx.beginPath();
          ctx.moveTo(pL.sx, pL.sy);
          ctx.lineTo(pR.sx, pR.sy);
          ctx.lineTo(pR.sx + pilW * 1.4, pR.sy + pilW * 0.7);
          ctx.lineTo(pL.sx + pilW * 1.4, pL.sy + pilW * 0.7);
          ctx.closePath();
          ctx.fill();

          // Steel pillars with metallic edge highlight
          ctx.fillStyle = '#0f172a';
          ctx.fillRect(pL.sx - pilW * 0.5, topL.sy, pilW, pL.sy - topL.sy);
          ctx.fillRect(pR.sx - pilW * 0.5, topR.sy, pilW, pR.sy - topR.sy);
          ctx.fillStyle = '#334155';
          ctx.fillRect(pL.sx - pilW * 0.5, topL.sy, Math.max(1.5, pilW * 0.25), pL.sy - topL.sy);
          ctx.fillRect(pR.sx - pilW * 0.5, topR.sy, Math.max(1.5, pilW * 0.25), pR.sy - topR.sy);

          const barH = Math.max(10, (focalY / midZ) * 1.9);
          ctx.fillStyle = '#111827';
          ctx.beginPath();
          ctx.moveTo(topL.sx - pilW * 0.6, topL.sy);
          ctx.lineTo(topR.sx + pilW * 0.6, topR.sy);
          ctx.lineTo(topR.sx + pilW * 0.6, topR.sy + barH);
          ctx.lineTo(topL.sx - pilW * 0.6, topL.sy + barH);
          ctx.closePath();
          ctx.fill();

          // Amber LED trim line along gantry bottom
          ctx.strokeStyle = '#f59e0b';
          ctx.lineWidth = Math.max(1, barH * 0.08);
          ctx.beginPath();
          ctx.moveTo(topL.sx - pilW * 0.5, topL.sy + barH);
          ctx.lineTo(topR.sx + pilW * 0.5, topR.sy + barH);
          ctx.stroke();

          if (barH > 14) {
            const midX = (topL.sx + topR.sx) * 0.5;
            const midY = (topL.sy + topR.sy) * 0.5 + barH * 0.42;
            ctx.fillStyle = '#f8fafc';
            ctx.font = `800 ${Math.max(9, Math.round(barH * 0.44))}px system-ui, sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('APEX RUSH', midX, midY);

            // 5 Race Countdown Signal Pods
            const lightY = (topL.sy + topR.sy) * 0.5 + barH * 0.80;
            const podSpan = (topR.sx - topL.sx) * 0.36;
            const podR = Math.max(2.2, barH * 0.13);
            const cdStep = params.countdownStep ?? 4;
            const isActive = params.raceActive ?? true;
            for (let pod = 0; pod < 5; pod++) {
              const lx = midX - podSpan * 0.5 + (pod / 4) * podSpan;
              const litRed = !isActive && cdStep <= 3 && pod <= (3 - cdStep + 1);
              const litGreen = isActive;
              ctx.fillStyle = litGreen ? '#22c55e' : litRed ? '#ef4444' : '#334155';
              ctx.beginPath();
              ctx.arc(lx, lightY, podR, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      });
    }

    // 4K Shaded Roadside Props
    for (let i = 0; i < track.props.length; i++) {
      const pr = track.props[i];
      const cp = toCam(pr.x, pr.z);
      if (cp.z < 1.8 || cp.z > 275) continue;
      const basePt = projectPt(cp.x, 0, cp.z);
      const pw = Math.max(2, (pr.w / cp.z) * fovScale);
      const ph = Math.max(4, (pr.h / cp.z) * focalY);
      if (basePt.sx + pw < -80 || basePt.sx - pw > W + 80) continue;

      drawList.push({
        z: cp.z,
        fn: () => {
          const px = basePt.sx;
          const py = basePt.sy;
          if (pr.kind === 'lamp') {
            const postW = Math.max(2, pw * 0.45);
            ctx.fillStyle = '#334155';
            ctx.fillRect(px - postW * 0.5, py - ph, postW, ph);
            // Cantilevered lamp arm toward road
            const armDir = pr.lateral > 0 ? -1 : 1;
            ctx.fillRect(px, py - ph, armDir * pw * 2.1, Math.max(2, postW * 0.7));
            const bulbX = px + armDir * pw * 2.0;
            const bulbY = py - ph + postW * 0.4;
            ctx.fillStyle = pr.accent || '#fde68a';
            const br = Math.max(2, pw * 0.72);
            ctx.beginPath();
            ctx.arc(bulbX, bulbY, br, 0, Math.PI * 2);
            ctx.fill();
            if (isNight || isSunset || isRain) {
              const halo = ctx.createRadialGradient(bulbX, bulbY, 1, bulbX, bulbY, br * 7.5);
              halo.addColorStop(0, 'rgba(253, 230, 138, 0.42)');
              halo.addColorStop(1, 'rgba(253, 230, 138, 0)');
              ctx.fillStyle = halo;
              ctx.beginPath();
              ctx.arc(bulbX, bulbY, br * 7.5, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (pr.kind === 'traffic') {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(px - pw * 0.18, py - ph, Math.max(2, pw * 0.36), ph);
            ctx.fillStyle = '#090d16';
            ctx.fillRect(px - pw * 0.6, py - ph, pw * 1.2, ph * 0.28);
            const sigCol = pr.accent || '#22c55e';
            ctx.fillStyle = sigCol;
            ctx.beginPath();
            ctx.arc(px, py - ph * 0.86, Math.max(2.2, pw * 0.28), 0, Math.PI * 2);
            ctx.fill();
            if (isNight || isSunset) {
              const tg = ctx.createRadialGradient(px, py - ph * 0.86, 1, px, py - ph * 0.86, pw * 2.4);
              tg.addColorStop(0, sigCol === '#22c55e' ? 'rgba(34,197,94,0.45)' : 'rgba(245,158,11,0.45)');
              tg.addColorStop(1, 'rgba(0,0,0,0)');
              ctx.fillStyle = tg;
              ctx.beginPath();
              ctx.arc(px, py - ph * 0.86, pw * 2.4, 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (pr.kind === 'tree') {
            // Soft cast ground shadow
            ctx.fillStyle = 'rgba(0, 0, 0, 0.28)';
            ctx.beginPath();
            ctx.ellipse(px + pw * 0.15, py, pw * 0.56, Math.max(2, pw * 0.16), 0, 0, Math.PI * 2);
            ctx.fill();
            // Trunk
            ctx.fillStyle = '#3e2723';
            ctx.fillRect(px - pw * 0.1, py - ph * 0.34, Math.max(2, pw * 0.2), ph * 0.34);
            // Multi-tiered volumetric foliage (shadow + sunlit edge)
            const tiers = 3;
            const baseCol = isNight ? '#0a2214' : pr.color;
            const hiCol = isNight ? '#123821' : isSunset ? '#3b6e3c' : '#2d6a4f';
            for (let t = 0; t < tiers; t++) {
              const tTop = py - ph * (0.58 + t * 0.21);
              const tBot = py - ph * (0.20 + t * 0.20);
              const tHalf = pw * (0.58 - t * 0.13);
              ctx.fillStyle = baseCol;
              ctx.beginPath();
              ctx.moveTo(px, tTop);
              ctx.lineTo(px - tHalf, tBot);
              ctx.lineTo(px + tHalf, tBot);
              ctx.closePath();
              ctx.fill();

              // Sunlit left facet
              ctx.fillStyle = hiCol;
              ctx.beginPath();
              ctx.moveTo(px, tTop);
              ctx.lineTo(px - tHalf, tBot);
              ctx.lineTo(px - tHalf * 0.12, tBot);
              ctx.closePath();
              ctx.fill();
            }
          } else if (pr.kind === 'building') {
            const bx = px - pw * 0.5;
            const by = py - ph;
            // 3D depth side extrusion
            const sideW = clamp((px - W * 0.5) * -0.06, -pw * 0.28, pw * 0.28);
            ctx.fillStyle = isNight ? '#090d16' : '#161b26';
            if (Math.abs(sideW) > 1.5) {
              ctx.beginPath();
              const edgeX = sideW > 0 ? bx + pw : bx;
              ctx.moveTo(edgeX, by);
              ctx.lineTo(edgeX + sideW, by + Math.abs(sideW) * 0.25);
              ctx.lineTo(edgeX + sideW, py);
              ctx.lineTo(edgeX, py);
              ctx.closePath();
              ctx.fill();
            }
            // Main glass-and-concrete facade gradient
            const bGrad = ctx.createLinearGradient(bx, by, bx, py);
            bGrad.addColorStop(0, isNight ? '#151d2e' : isSunset ? '#3b3444' : '#334155');
            bGrad.addColorStop(1, isNight ? '#0b0f18' : pr.color);
            ctx.fillStyle = bGrad;
            ctx.fillRect(bx, by, pw, ph);

            // Reflective glass curtain wall horizontal mullions & lit windows
            if (pw > 12) {
              const cols = Math.max(2, Math.floor(pw / 9));
              const rows = Math.max(3, Math.floor(ph / 13));
              for (let r = 1; r < rows; r += 2) {
                for (let c = 0; c < cols; c++) {
                  const lit = (r * 3 + c * 5) % 4 !== 0;
                  if (isNight || isSunset) {
                    ctx.fillStyle = lit ? 'rgba(253, 230, 138, 0.34)' : 'rgba(148, 163, 184, 0.10)';
                  } else {
                    ctx.fillStyle = 'rgba(186, 230, 253, 0.22)';
                  }
                  ctx.fillRect(px - pw * 0.43 + c * ((pw * 0.86) / cols), by + r * (ph / rows), pw * 0.13, ph * 0.045);
                }
              }
            }
            // Rooftop aviation warning light at night/sunset
            if ((isNight || isSunset) && ph > 24) {
              ctx.fillStyle = 'rgba(239, 68, 68, 0.85)';
              ctx.beginPath();
              ctx.arc(px, by - 2, Math.max(1.5, pw * 0.04), 0, Math.PI * 2);
              ctx.fill();
            }
          } else if (pr.kind === 'stand') {
            ctx.fillStyle = '#1e293b';
            ctx.fillRect(px - pw * 0.5, py - ph, pw, ph);
            // Stadium awning + crowd rows
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(px - pw * 0.52, py - ph, pw * 1.04, Math.max(3, ph * 0.16));
            ctx.fillStyle = '#475569';
            for (let tier = 0; tier < 4; tier++) {
              ctx.fillRect(px - pw * 0.46, py - ph * (0.2 + tier * 0.16), pw * 0.92, Math.max(1.5, ph * 0.06));
            }
          } else if (pr.kind === 'mesa') {
            const mGrad = ctx.createLinearGradient(px - pw * 0.5, py - ph, px + pw * 0.5, py);
            mGrad.addColorStop(0, isNight ? '#3d1e12' : isSunset ? '#b4532a' : '#a84c27');
            mGrad.addColorStop(1, isNight ? '#1f0e08' : '#5e2914');
            ctx.fillStyle = mGrad;
            ctx.beginPath();
            ctx.moveTo(px - pw * 0.5, py);
            ctx.lineTo(px - pw * 0.34, py - ph);
            ctx.lineTo(px + pw * 0.32, py - ph);
            ctx.lineTo(px + pw * 0.5, py);
            ctx.closePath();
            ctx.fill();
            // Horizontal sandstone geological strata highlight
            ctx.fillStyle = isNight ? 'rgba(255,255,255,0.04)' : 'rgba(253, 186, 116, 0.18)';
            ctx.fillRect(px - pw * 0.36, py - ph * 0.62, pw * 0.72, Math.max(2, ph * 0.08));
          }
        }
      });
    }

    // Collect Opponent Cars (AI + Online Remotes + Ghost)
    const oppList: Array<{
      x: number;
      z: number;
      h: number;
      color: string;
      name: string;
      isGhost?: boolean;
      braking?: boolean;
      nitroActive?: boolean;
      showTag?: boolean;
      spoiler?: string;
      wheels?: string;
      roll?: number;
    }> = [];

    cars.forEach((c) => {
      if (c === player) return;
      oppList.push({
        x: c.x,
        z: c.z,
        h: c.heading,
        color: c.colorHex || c.carDef.defaultColor,
        name: c.name,
        braking: c.braking,
        nitroActive: c.nitroActive,
        showTag: false,
        spoiler: c.spoiler || 'street',
        wheels: c.wheels || '5spoke',
        roll: clamp(c.latSpeedVisual || 0, -0.04, 0.04)
      });
    });

    remotes.forEach((r) => {
      oppList.push({
        x: r.x,
        z: r.z,
        h: r.heading,
        color: r.colorHex || r.carDef.defaultColor,
        name: r.name,
        braking: r.braking,
        nitroActive: r.nitroActive,
        showTag: true,
        spoiler: r.spoiler || 'street',
        wheels: r.wheels || '5spoke',
        roll: clamp((r.targetSteer || 0) * 0.04, -0.04, 0.04)
      });
    });

    if (ghostCar) {
      oppList.push({
        x: ghostCar.x,
        z: ghostCar.z,
        h: ghostCar.h,
        color: '#06b6d4',
        name: 'GHOST',
        isGhost: true
      });
    }

    if (params.isPhoto) {
      oppList.push({
        x: player.x,
        z: player.z,
        h: player.heading,
        color: player.colorHex || player.carDef.defaultColor,
        name: '',
        braking: params.keys.brake || params.keys.drift,
        nitroActive: player.nitroActive,
        spoiler: player.spoiler || 'street',
        wheels: player.wheels || '5spoke',
        roll: clamp(player.latSpeedVisual || 0, -0.04, 0.04)
      });
    }

    oppList.forEach((opp) => {
      const cp = toCam(opp.x, opp.z);
      if (cp.z < 1.6 || cp.z > 240) return;
      const pt = projectPt(cp.x, 0, cp.z);
      const scale = fovScale / cp.z;
      if (pt.sx < -220 || pt.sx > W + 220) return;

      let yawDiff = opp.h - camYaw;
      while (yawDiff > Math.PI) yawDiff -= Math.PI * 2;
      while (yawDiff < -Math.PI) yawDiff += Math.PI * 2;

      drawList.push({
        z: cp.z,
        fn: () =>
          this.drawRearCarSprite(
            pt.sx,
            pt.sy,
            scale * 0.92,
            opp.color,
            !!opp.isGhost,
            !!opp.braking,
            !!opp.nitroActive,
            opp.showTag ? opp.name : '',
            (opp.roll || 0) + clamp(Math.sin(yawDiff) * 0.03, -0.03, 0.03),
            0,
            opp.spoiler || 'street',
            opp.wheels || '5spoke',
            weather
          )
      });
    });

    // Volumetric Smoke Puffs
    for (let i = 0; i < smokeData.length; i++) {
      const sm = smokeData[i];
      if (!sm.active) continue;
      const cp = toCam(sm.x, sm.z);
      if (cp.z < 1.4 || cp.z > 160) continue;
      const pt = projectPt(cp.x, sm.y, cp.z);
      const scale = fovScale / cp.z;
      drawList.push({
        z: cp.z,
        fn: () => {
          const t = sm.life / sm.maxLife;
          const r = Math.max(3, sm.scale * scale * 0.85);
          const sg = ctx.createRadialGradient(pt.sx, pt.sy, r * 0.1, pt.sx, pt.sy, r);
          sg.addColorStop(0, `rgba(226, 232, 240, ${(1 - t) * 0.38})`);
          sg.addColorStop(1, 'rgba(226, 232, 240, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(pt.sx, pt.sy, r, 0, Math.PI * 2);
          ctx.fill();
        }
      });
    }

    drawList.sort((a, b) => b.z - a.z);
    for (let i = 0; i < drawList.length; i++) drawList[i].fn();

    // 6. NIGHT HEADLIGHT BEAM CONE ON ASPHALT
    if (isNight && !params.isPhoto) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const beamGrad = ctx.createRadialGradient(W * 0.5, H * 0.85, 20, W * 0.5, horizonY + 80, W * 0.45);
      beamGrad.addColorStop(0, 'rgba(255, 244, 214, 0.34)');
      beamGrad.addColorStop(0.55, 'rgba(255, 244, 214, 0.11)');
      beamGrad.addColorStop(1, 'rgba(255, 244, 214, 0)');
      ctx.fillStyle = beamGrad;
      ctx.beginPath();
      ctx.moveTo(W * 0.31, H);
      ctx.lineTo(W * 0.19, horizonY + 12);
      ctx.lineTo(W * 0.81, horizonY + 12);
      ctx.lineTo(W * 0.69, H);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    // 7. FOREGROUND PLAYER CAR OR REAL-LIFE COCKPIT OVERLAY
    if (params.isPhoto) return;

    const steerRoll = (params.keys.right ? 0.032 : params.keys.left ? -0.032 : 0) + clamp(player.latSpeedVisual || 0, -0.04, 0.04);
    const bounce = Math.sin(performance.now() * 0.038) * Math.min(2.6, player.speed * 0.032);

    if (isCockpit) {
      if (this.cockpitOverlay) {
        const img = this.cockpitOverlay;
        const sc = Math.max(W / img.width, H / img.height) * 1.03;
        const dw = img.width * sc;
        const dh = img.height * sc;
        const steerShift = params.keys.left ? 14 : params.keys.right ? -14 : 0;
        ctx.save();
        ctx.translate(W * 0.5 + steerShift, H * 0.5 + bounce * 0.8);
        ctx.rotate(steerRoll * 0.45);
        ctx.drawImage(img, -dw * 0.5, -dh * 0.5, dw, dh);
        ctx.restore();
      }
    } else {
      const pCam = toCam(player.x, player.z);
      const pZ = Math.max(4.8, pCam.z);
      const pScale = fovScale / pZ;
      const pPt = projectPt(pCam.x, 0, pZ);
      const carX = pPt.sx + (params.keys.left ? -8 : params.keys.right ? 8 : 0);
      const carY = clamp(pPt.sy, H * 0.83, H * 0.91) + bounce;
      const isBraking = params.keys.brake || params.keys.drift;
      const pColor = player.colorHex || player.carDef.defaultColor;

      if (player.drifting) {
        for (const side of [-1, 1]) {
          const sx = carX + side * pScale * 0.92;
          const sy = carY - pScale * 0.08;
          const sg = ctx.createRadialGradient(sx, sy, 2, sx, sy, pScale * 0.68);
          sg.addColorStop(0, 'rgba(226, 232, 240, 0.44)');
          sg.addColorStop(1, 'rgba(226, 232, 240, 0)');
          ctx.fillStyle = sg;
          ctx.beginPath();
          ctx.arc(sx, sy, pScale * 0.68, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      this.drawRearCarSprite(
        carX,
        carY,
        pScale * 0.92,
        pColor,
        false,
        isBraking,
        player.nitroActive,
        '',
        steerRoll,
        bounce,
        player.spoiler || 'street',
        player.wheels || '5spoke',
        weather
      );
    }
  }

  private drawRearCarSprite(
    cx: number,
    baseY: number,
    unitScale: number,
    colorHex: string,
    isGhost: boolean,
    braking: boolean,
    nitroActive: boolean,
    label: string,
    rollRad: number,
    bouncePx: number,
    spoilerStyle = 'street',
    wheelStyle = '5spoke',
    weather = 'sunset'
  ) {
    const ctx = this.ctx;
    const sprite = this.getCarSprite('chase', colorHex, isGhost);
    const carW = clamp(unitScale * 2.35, 10, 580);
    const aspect = sprite ? sprite.height / sprite.width : 0.65;
    const carH = carW * aspect;
    if (carW < 8) return;

    ctx.save();
    ctx.translate(cx, baseY + bouncePx);
    if (rollRad) ctx.rotate(rollRad);

    // Multi-pass Ground Ambient Occlusion + Directional Sun Shadow
    if (!isGhost) {
      const sunShift = weather === 'sunset' ? carW * 0.10 : carW * 0.05;
      const shGrad = ctx.createRadialGradient(sunShift, -carH * 0.03, carW * 0.12, sunShift, -carH * 0.03, carW * 0.60);
      shGrad.addColorStop(0, 'rgba(0, 0, 0, 0.80)');
      shGrad.addColorStop(0.65, 'rgba(0, 0, 0, 0.36)');
      shGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = shGrad;
      ctx.beginPath();
      ctx.ellipse(sunShift, -carH * 0.03, carW * 0.58, carH * 0.15, 0, 0, Math.PI * 2);
      ctx.fill();

      // Wet rain asphalt mirror reflection of taillights under car
      if (weather === 'rain' && carW > 36) {
        const refGrad = ctx.createLinearGradient(0, 0, 0, carH * 0.24);
        refGrad.addColorStop(0, braking ? 'rgba(239, 68, 68, 0.28)' : 'rgba(148, 163, 184, 0.16)');
        refGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = refGrad;
        ctx.fillRect(-carW * 0.42, 0, carW * 0.84, carH * 0.24);
      }
    }

    if (sprite) {
      ctx.drawImage(sprite, -carW * 0.5, -carH, carW, carH);
    } else {
      ctx.fillStyle = isGhost ? 'rgba(6, 182, 212, 0.5)' : colorHex;
      ctx.fillRect(-carW * 0.45, -carH * 0.85, carW * 0.9, carH * 0.8);
    }

    // Dynamic Clearcoat Roof/Shoulder Rim Sheen matched to environment lighting
    if (!isGhost && carW > 56) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = weather === 'sunset'
        ? 'rgba(253, 186, 116, 0.32)'
        : weather === 'night'
          ? 'rgba(148, 163, 184, 0.22)'
          : 'rgba(248, 250, 252, 0.28)';
      ctx.lineWidth = Math.max(1.2, carH * 0.015);
      ctx.beginPath();
      ctx.moveTo(-carW * 0.22, -carH * 0.88);
      ctx.quadraticCurveTo(0, -carH * 0.91, carW * 0.22, -carH * 0.88);
      ctx.stroke();
      ctx.restore();
    }

    // Customized Rear Spoiler visual overlay
    if (!isGhost && carW > 38) {
      if (spoilerStyle === 'gt') {
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(-carW * 0.21, -carH * 0.90, carW * 0.032, carH * 0.14);
        ctx.fillRect(carW * 0.178, -carH * 0.90, carW * 0.032, carH * 0.14);
        ctx.fillStyle = '#111827';
        ctx.fillRect(-carW * 0.44, -carH * 0.95, carW * 0.88, Math.max(3, carH * 0.055));
        ctx.fillStyle = '#475569';
        ctx.fillRect(-carW * 0.44, -carH * 0.95, carW * 0.88, Math.max(1, carH * 0.014));
        ctx.fillStyle = '#334155';
        ctx.fillRect(-carW * 0.45, -carH * 0.99, carW * 0.032, carH * 0.11);
        ctx.fillRect(carW * 0.418, -carH * 0.99, carW * 0.032, carH * 0.11);
      } else if (spoilerStyle === 'ducktail') {
        ctx.fillStyle = colorHex;
        ctx.beginPath();
        ctx.moveTo(-carW * 0.33, -carH * 0.68);
        ctx.lineTo(-carW * 0.28, -carH * 0.77);
        ctx.lineTo(carW * 0.28, -carH * 0.77);
        ctx.lineTo(carW * 0.33, -carH * 0.68);
        ctx.closePath();
        ctx.fill();
      }
    }

    // Wheel rim lip accent inside rear arches
    if (!isGhost && carW > 95 && wheelStyle !== '5spoke') {
      ctx.fillStyle = wheelStyle === 'deep' ? 'rgba(245, 158, 11, 0.58)'
        : wheelStyle === 'mesh' ? 'rgba(226, 232, 240, 0.48)'
          : 'rgba(15, 23, 42, 0.68)';
      ctx.fillRect(-carW * 0.47, -carH * 0.22, carW * 0.025, carH * 0.14);
      ctx.fillRect(carW * 0.445, -carH * 0.22, carW * 0.025, carH * 0.14);
    }

    // Volumetric Taillight & Center Third Brake Light (CHMSL) Flares
    if (braking && !isGhost) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        const lx = side * carW * 0.31;
        const ly = -carH * 0.53;
        const tg = ctx.createRadialGradient(lx, ly, 1, lx, ly, carW * 0.17);
        tg.addColorStop(0, 'rgba(255, 180, 180, 0.98)');
        tg.addColorStop(0.28, 'rgba(239, 68, 68, 0.82)');
        tg.addColorStop(1, 'rgba(239, 68, 68, 0)');
        ctx.fillStyle = tg;
        ctx.beginPath();
        ctx.arc(lx, ly, carW * 0.17, 0, Math.PI * 2);
        ctx.fill();
      }
      // Third brake light strip under rear window
      if (carW > 65) {
        ctx.fillStyle = 'rgba(255, 90, 90, 0.92)';
        ctx.fillRect(-carW * 0.09, -carH * 0.72, carW * 0.18, Math.max(2, carH * 0.024));
      }
      ctx.restore();
    }

    // Twin Titanium Plasma Nitro Exhaust Afterburner
    if (nitroActive && !isGhost) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for (const side of [-1, 1]) {
        const ex = side * carW * 0.28;
        const ey = -carH * 0.17;
        const r = carW * (0.095 + Math.random() * 0.045);
        const fg = ctx.createRadialGradient(ex, ey, 1, ex, ey, r);
        fg.addColorStop(0, 'rgba(255, 255, 255, 1)');
        fg.addColorStop(0.32, 'rgba(125, 211, 252, 0.94)');
        fg.addColorStop(0.68, 'rgba(37, 99, 235, 0.52)');
        fg.addColorStop(1, 'rgba(37, 99, 235, 0)');
        ctx.fillStyle = fg;
        ctx.beginPath();
        ctx.arc(ex, ey, r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
    }

    if (label && carW > 24) {
      ctx.fillStyle = 'rgba(8, 9, 12, 0.82)';
      ctx.fillRect(-46, -carH - 26, 92, 20);
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.24)';
      ctx.strokeRect(-46, -carH - 26, 92, 20);
      ctx.fillStyle = '#f8fafc';
      ctx.font = '700 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(label.slice(0, 14), 0, -carH - 16);
    }

    ctx.restore();
  }

  private renderTopDownDrone(params: {
    track: TrackWorldData;
    player: any;
    cars: any[];
    remotes: Map<string, any>;
    ghostCar: { x: number; z: number; h: number; color: string } | null;
    smokeData: any[];
    skidMarks?: SkidSegment[];
    isPhoto: boolean;
    orbitDist: number;
    keys: { brake: boolean; drift: boolean };
  }) {
    const { track, player, cars, remotes, ghostCar, smokeData } = params;
    const ctx = this.ctx;
    const W = this.width;
    const H = this.height;
    const isNight = track.weather === 'night';
    const isRain = track.isRain;
    const pxPerM = params.isPhoto ? clamp(95 / params.orbitDist, 7, 22) : clamp(13.5 - player.speed * 0.035, 8.5, 13.5);

    ctx.fillStyle = isNight
      ? '#090e17'
      : track.def.theme === 'desert' ? '#7b4929' : track.def.theme === 'city' ? '#1b1f27' : '#213a26';
    ctx.fillRect(0, 0, W, H);

    ctx.save();
    ctx.translate(W * 0.5, H * 0.62);
    ctx.rotate(player.heading - Math.PI);
    ctx.scale(pxPerM, pxPerM);
    ctx.translate(-player.x, -player.z);

    if (track.def.theme === 'coastal') {
      ctx.fillStyle = isNight ? '#0a1f33' : '#0369a1';
      ctx.fillRect(-1000, -1200, 2000, 750);
    }

    const samps = track.samples;
    const N = track.sampleCount;

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    for (let i = 0; i < N; i += 2) {
      if (i === 0) ctx.moveTo(samps[i].pos.x, samps[i].pos.z);
      else ctx.lineTo(samps[i].pos.x, samps[i].pos.z);
    }
    ctx.closePath();
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = (track.halfW + track.shoulder) * 2;
    ctx.stroke();

    ctx.strokeStyle = isRain ? '#151922' : '#21252e';
    ctx.lineWidth = track.halfW * 2;
    ctx.stroke();

    // Rubber racing groove ribbon
    ctx.strokeStyle = 'rgba(8, 10, 14, 0.28)';
    ctx.lineWidth = track.halfW * 0.9;
    ctx.stroke();

    ctx.save();
    ctx.strokeStyle = 'rgba(245, 158, 11, 0.72)';
    ctx.lineWidth = 0.4;
    ctx.setLineDash([4, 4]);
    ctx.stroke();
    ctx.restore();

    // Persistent drift skidmarks in drone view
    if (params.skidMarks && params.skidMarks.length > 0) {
      ctx.save();
      ctx.lineWidth = 0.28;
      for (let i = 0; i < params.skidMarks.length; i++) {
        const sm = params.skidMarks[i];
        ctx.strokeStyle = `rgba(9, 10, 14, ${clamp(sm.alpha * 0.55, 0.05, 0.55)})`;
        ctx.beginPath();
        ctx.moveTo(sm.x1, sm.z1);
        ctx.lineTo(sm.x2, sm.z2);
        ctx.stroke();
      }
      ctx.restore();
    }

    const pitIdx = Math.floor(track.pitS * N);
    const pitSamp = samps[pitIdx];
    ctx.save();
    ctx.translate(pitSamp.pos.x + pitSamp.right.x * (track.halfW - 1.8), pitSamp.pos.z + pitSamp.right.z * (track.halfW - 1.8));
    ctx.rotate(Math.atan2(pitSamp.tangent.x, -pitSamp.tangent.z));
    ctx.fillStyle = 'rgba(16, 185, 129, 0.55)';
    ctx.fillRect(-2, -18, 4, 36);
    ctx.restore();

    const st = samps[0];
    ctx.save();
    ctx.translate(st.pos.x, st.pos.z);
    ctx.rotate(Math.atan2(st.tangent.x, -st.tangent.z));
    for (let q = -6; q < 6; q++) {
      ctx.fillStyle = q % 2 === 0 ? '#f8fafc' : '#09090b';
      ctx.fillRect((q / 6) * track.halfW, -1.2, track.halfW / 6, 1.2);
      ctx.fillStyle = q % 2 !== 0 ? '#f8fafc' : '#09090b';
      ctx.fillRect((q / 6) * track.halfW, 0, track.halfW / 6, 1.2);
    }
    ctx.restore();

    const viewRad = Math.max(W, H) / pxPerM + 60;
    for (let i = 0; i < track.props.length; i++) {
      const pr = track.props[i];
      if (Math.abs(pr.x - player.x) > viewRad || Math.abs(pr.z - player.z) > viewRad) continue;
      if (pr.kind === 'building' || pr.kind === 'stand') {
        ctx.fillStyle = 'rgba(0,0,0,0.40)';
        ctx.fillRect(pr.x - pr.w * 0.5 + 1.8, pr.z - pr.w * 0.5 + 1.8, pr.w, pr.w);
        ctx.fillStyle = pr.color;
        ctx.fillRect(pr.x - pr.w * 0.5, pr.z - pr.w * 0.5, pr.w, pr.w);
      } else if (pr.kind === 'tree') {
        ctx.fillStyle = 'rgba(0,0,0,0.28)';
        ctx.beginPath();
        ctx.arc(pr.x + 0.8, pr.z + 0.8, pr.w * 0.72, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.arc(pr.x, pr.z, pr.w * 0.7, 0, Math.PI * 2);
        ctx.fill();
      } else if (pr.kind === 'mesa') {
        ctx.fillStyle = pr.color;
        ctx.beginPath();
        ctx.arc(pr.x, pr.z, pr.w * 0.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    smokeData.forEach((sm) => {
      if (!sm.active) return;
      const t = sm.life / sm.maxLife;
      ctx.fillStyle = `rgba(226, 232, 240, ${(1 - t) * 0.35})`;
      ctx.beginPath();
      ctx.arc(sm.x, sm.z, sm.scale * (0.9 + t * 1.4), 0, Math.PI * 2);
      ctx.fill();
    });

    const drawTopCar = (x: number, z: number, heading: number, color: string, isGhost: boolean, braking: boolean, nitro: boolean, tag: string) => {
      const sp = this.getCarSprite('top', color, isGhost);
      ctx.save();
      ctx.translate(x, z);
      ctx.rotate(-heading + Math.PI);

      if (isNight && !isGhost) {
        const bg = ctx.createLinearGradient(0, -2, 0, -26);
        bg.addColorStop(0, 'rgba(255, 244, 214, 0.38)');
        bg.addColorStop(1, 'rgba(255, 244, 214, 0)');
        ctx.fillStyle = bg;
        ctx.beginPath();
        ctx.moveTo(-0.8, -2.0);
        ctx.lineTo(-5.5, -26);
        ctx.lineTo(5.5, -26);
        ctx.lineTo(0.8, -2.0);
        ctx.closePath();
        ctx.fill();
      }

      if (!isGhost) {
        ctx.fillStyle = 'rgba(0,0,0,0.52)';
        ctx.beginPath();
        ctx.ellipse(0.35, 0.35, 1.35, 2.55, 0, 0, Math.PI * 2);
        ctx.fill();
      }

      if (sp) {
        ctx.drawImage(sp, -1.25, -2.4, 2.5, 4.8);
      } else {
        ctx.fillStyle = isGhost ? 'rgba(6, 182, 212, 0.5)' : color;
        ctx.fillRect(-1.0, -2.1, 2.0, 4.2);
      }

      if (braking && !isGhost) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.9)';
        ctx.fillRect(-0.85, 2.05, 0.45, 0.28);
        ctx.fillRect(0.40, 2.05, 0.45, 0.28);
      }
      if (nitro && !isGhost) {
        ctx.fillStyle = 'rgba(56, 189, 248, 0.95)';
        ctx.beginPath();
        ctx.arc(-0.42, 2.55, 0.32, 0, Math.PI * 2);
        ctx.arc(0.42, 2.55, 0.32, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();

      if (tag) {
        ctx.save();
        ctx.translate(x, z);
        ctx.rotate(-(player.heading - Math.PI));
        ctx.fillStyle = 'rgba(8,9,12,0.8)';
        ctx.fillRect(-4.5, -5.2, 9, 2.2);
        ctx.fillStyle = '#f8fafc';
        ctx.font = 'bold 1.35px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(tag.slice(0, 12), 0, -4.1);
        ctx.restore();
      }
    };

    if (ghostCar) drawTopCar(ghostCar.x, ghostCar.z, ghostCar.h, '#06b6d4', true, false, false, '');
    cars.forEach((c) => {
      if (c !== player) drawTopCar(c.x, c.z, c.heading, c.colorHex || c.carDef.defaultColor, false, !!c.braking, !!c.nitroActive, '');
    });
    remotes.forEach((r) => {
      drawTopCar(r.x, r.z, r.heading, r.colorHex || r.carDef.defaultColor, false, !!r.braking, !!r.nitroActive, r.name);
    });
    drawTopCar(
      player.x,
      player.z,
      player.heading,
      player.colorHex || player.carDef.defaultColor,
      false,
      params.keys.brake || params.keys.drift,
      player.nitroActive,
      ''
    );

    ctx.restore();
  }
}
