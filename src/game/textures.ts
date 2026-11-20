import * as THREE from 'three';

// Procedural, dependency-free photoreal-ish textures (generated once, cached).
const cache = new Map<string, THREE.CanvasTexture>();

function mk(key: string, w: number, h: number, draw: (g: CanvasRenderingContext2D, w: number, h: number) => void, repeat = true, color = true) {
  const hit = cache.get(key);
  if (hit) return hit;
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d')!;
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (color) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  cache.set(key, t);
  return t;
}

function speckle(g: CanvasRenderingContext2D, w: number, h: number, n: number, lo: number, hi: number, a: number) {
  for (let i = 0; i < n; i++) {
    const v = lo + Math.random() * (hi - lo);
    g.fillStyle = `rgba(${v},${v},${v},${a})`;
    const s = 1 + Math.random() * 2;
    g.fillRect(Math.random() * w, Math.random() * h, s, s);
  }
}

/** Neutral-grey detail map multiplied over vertex colours (grass/dirt/asphalt grain). */
export function detailTexture() {
  return mk('detail', 512, 512, (g, w, h) => {
    g.fillStyle = '#b4b4b4'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 26000, 70, 255, 0.35);
    for (let i = 0; i < 160; i++) {
      const v = 120 + Math.random() * 100;
      g.fillStyle = `rgba(${v},${v},${v},0.08)`;
      g.beginPath(); g.arc(Math.random() * w, Math.random() * h, 6 + Math.random() * 30, 0, 7); g.fill();
    }
  });
}

export function detailBump() {
  return mk('detailBump', 512, 512, (g, w, h) => {
    g.fillStyle = '#808080'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 40000, 0, 255, 0.5);
  }, true, false);
}

export function asphaltTexture() {
  return mk('asphalt', 512, 512, (g, w, h) => {
    g.fillStyle = '#34363a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 30000, 20, 140, 0.5);
    g.strokeStyle = 'rgba(10,10,12,0.5)'; g.lineWidth = 1.2;
    for (let i = 0; i < 14; i++) {
      g.beginPath(); let x = Math.random() * w, y = Math.random() * h; g.moveTo(x, y);
      for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 60; y += (Math.random() - 0.5) * 60; g.lineTo(x, y); }
      g.stroke();
    }
  });
}

/** Building facade: wall + window grid (colour tinted by material.color). */
export function facadeTexture() {
  return mk('facade', 512, 512, (g, w, h) => {
    g.fillStyle = '#d8d4cc'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 9000, 120, 255, 0.25);
    const cols = 4, rows = 4, cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      const x = c * cw + cw * 0.16, y = r * rh + rh * 0.16, ww = cw * 0.68, hh = rh * 0.62;
      g.fillStyle = '#9a958c'; g.fillRect(x - 4, y - 4, ww + 8, hh + 8);
      const lit = Math.random() < 0.28;
      const grd = g.createLinearGradient(0, y, 0, y + hh);
      grd.addColorStop(0, lit ? '#ffd9a0' : '#4b6478');
      grd.addColorStop(1, lit ? '#e8a95c' : '#1a2430');
      g.fillStyle = grd; g.fillRect(x, y, ww, hh);
      g.fillStyle = 'rgba(255,255,255,0.18)';
      g.beginPath(); g.moveTo(x, y + hh); g.lineTo(x + ww * 0.45, y); g.lineTo(x + ww * 0.7, y); g.lineTo(x + ww * 0.25, y + hh); g.fill();
      g.fillStyle = '#6b675f'; g.fillRect(x + ww / 2 - 1, y, 2, hh);
      g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(x - 4, y + hh + 4, ww + 8, 4);
    }
  });
}

export function facadeEmissive() {
  return mk('facadeEm', 512, 512, (g, w, h) => {
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    const cols = 4, rows = 4, cw = w / cols, rh = h / rows;
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
      if (Math.random() < 0.3) { g.fillStyle = '#ffb860'; g.fillRect(c * cw + cw * 0.16, r * rh + rh * 0.16, cw * 0.68, rh * 0.62); }
    }
  });
}

export function brickTexture() {
  return mk('brick', 512, 512, (g, w, h) => {
    g.fillStyle = '#5a463c'; g.fillRect(0, 0, w, h);
    const bw = 64, bh = 28;
    for (let y = 0; y * bh < h; y++) for (let x = -1; x * bw < w; x++) {
      const off = y % 2 ? bw / 2 : 0, v = 150 + Math.random() * 90;
      g.fillStyle = `rgb(${v},${v * 0.62},${v * 0.5})`;
      g.fillRect(x * bw + off + 2, y * bh + 2, bw - 4, bh - 4);
    }
    speckle(g, w, h, 8000, 0, 200, 0.25);
  });
}

export function roadMarkingTexture() {
  return mk('roadmark', 256, 256, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(235,230,210,0.9)'; g.fillRect(w / 2 - 5, 20, 10, 100);
    speckle(g, w, h, 1500, 0, 90, 0.6);
  }, true, true);
}

/** Sky gradient + sun glow + soft clouds, painted to an equirect-ish dome texture. */
export function skyTexture() {
  return mk('sky', 1024, 512, (g, w, h) => {
    const grd = g.createLinearGradient(0, 0, 0, h);
    grd.addColorStop(0, '#2c5d9a'); grd.addColorStop(0.35, '#6fa0cf');
    grd.addColorStop(0.5, '#f0c690'); grd.addColorStop(0.58, '#f3a763'); grd.addColorStop(1, '#6b4a3a');
    g.fillStyle = grd; g.fillRect(0, 0, w, h);
    const sx = w * 0.3, sy = h * 0.46;
    const sun = g.createRadialGradient(sx, sy, 2, sx, sy, 200);
    sun.addColorStop(0, 'rgba(255,248,220,1)'); sun.addColorStop(0.08, 'rgba(255,220,150,0.9)');
    sun.addColorStop(0.4, 'rgba(255,170,90,0.28)'); sun.addColorStop(1, 'rgba(255,150,70,0)');
    g.fillStyle = sun; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = Math.random() * w, y = h * (0.18 + Math.random() * 0.3), r = 20 + Math.random() * 60;
      const cg = g.createRadialGradient(x, y, 0, x, y, r);
      cg.addColorStop(0, 'rgba(255,225,200,0.2)'); cg.addColorStop(1, 'rgba(255,225,200,0)');
      g.save(); g.scale(1, 0.32); g.fillStyle = cg; g.fillRect(x - r, (y - r) / 0.32, r * 2, (r * 2) / 0.32); g.restore();
    }
  }, false);
}
