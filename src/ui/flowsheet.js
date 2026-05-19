// Realistische, gezeichnete Werksansicht (Seitenelevation) auf Canvas.
// Zoom- & schwenkbar; Animation an Mengen, Drehzahl, Temperatur & CO2 gekoppelt.

import { fmt0, fmtMoney } from '../util.js?v=18';

const SCENE_W = 2260, SCENE_H = 560, GROUND = 460;
const OUTLINE = '#0d131b';

const NAMES = {
  quarry: 'Steinbruch', crusher: 'Brecher', rawmill: 'Rohmühle', blending: 'Rohmehl-Silo',
  preheater: 'Vorwärmerturm', calciner: 'Calcinator', kiln: 'Drehrohrofen', cooler: 'Klinkerkühler',
  clinkersilo: 'Klinkersilo', cementmill: 'Zementmühle', cementsilo: 'Zementsilo', dispatch: 'Versand',
};
const HIT = {
  quarry: [30, 95, 255, 360],
  crusher: [305, 296, 135, 168],
  rawmill: [460, 300, 235, 164],
  blending: [712, 158, 122, 306],
  preheater: [852, 70, 198, 394],
  calciner: [1052, 246, 88, 218],
  kiln: [1055, 348, 330, 156],
  cooler: [1378, 320, 146, 144],
  clinkersilo: [1548, 298, 168, 166],
  cementmill: [1748, 300, 238, 164],
  cementsilo: [2012, 146, 140, 318],
  dispatch: [2156, 296, 96, 168],
};
const SILOKEY = { blending: 'rawMeal', clinkersilo: 'clinker', cementsilo: 'cement' };
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

let canvas, ctx, dpr = 1, cssW = 0, cssH = 0;
let scale = 1, zoom = 1, panX = 0, panY = 0;
let onSelect = () => {};

// Eingabe (Multi-Pointer für Pinch-Zoom)
const pts = new Map();
let lastCx = 0, lastCy = 0, lastDist = 0;
let tap = null;
let zoomBtn = { in: [0, 0, 0], out: [0, 0, 0] };

// Animationsspeicher
let animLast = 0;
const scroll = { raw: 0, clinker: 0, cement: 0 };
const spin = { kiln: 0, rawmill: 0, cementmill: 0 };
let puff = 0;

// Tageszeit-Himmel: Stützfarben je Stunde (top/bottom als RGB)
let stars = null;
const SKY = [
  { h: 0,    top: [10, 15, 32],   bot: [22, 30, 54] },
  { h: 5,    top: [30, 36, 64],   bot: [86, 64, 96] },
  { h: 6.5,  top: [60, 78, 124],  bot: [234, 150, 92] },
  { h: 8,    top: [80, 124, 178], bot: [176, 200, 226] },
  { h: 12,   top: [92, 146, 202], bot: [190, 216, 236] },
  { h: 17,   top: [80, 122, 178], bot: [198, 190, 212] },
  { h: 18.5, top: [60, 66, 108],  bot: [236, 124, 76] },
  { h: 20,   top: [28, 36, 66],   bot: [60, 52, 90] },
  { h: 24,   top: [10, 15, 32],   bot: [22, 30, 54] },
];
const CLOUDS = [
  { x: 0.18, y: 0.15, s: 1.0, sp: 1.0 },
  { x: 0.55, y: 0.09, s: 0.7, sp: 0.6 },
  { x: 0.82, y: 0.21, s: 0.85, sp: 0.8 },
];

export function initFlowsheet(cv, selectCb) {
  canvas = cv;
  ctx = cv.getContext('2d');
  if (selectCb) onSelect = selectCb;
  resize();
  window.addEventListener('resize', resize);

  cv.addEventListener('pointerdown', e => {
    const b = zoomBtnHit(e.clientX, e.clientY);
    if (b) { zoomAt(cssW / 2, cssH / 2, b === 'in' ? 1.4 : 0.72); return; }
    pts.set(e.pointerId, pointAt(e));
    cv.setPointerCapture(e.pointerId);
    if (pts.size === 1) tap = { x: e.clientX, y: e.clientY, moved: false };
    else tap = null;
    refreshGesture();
  });
  cv.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId)) return;
    pts.set(e.pointerId, pointAt(e));
    const arr = [...pts.values()];
    if (arr.length === 1) {
      panX += arr[0].x - lastCx;
      panY += arr[0].y - lastCy;
      lastCx = arr[0].x; lastCy = arr[0].y;
      if (tap && Math.hypot(e.clientX - tap.x, e.clientY - tap.y) > 9) tap.moved = true;
      clampView();
    } else if (arr.length >= 2) {
      const cx = (arr[0].x + arr[1].x) / 2, cy = (arr[0].y + arr[1].y) / 2;
      const dist = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
      if (lastDist > 0) {
        zoomAt(cx, cy, dist / lastDist);
        panX += cx - lastCx; panY += cy - lastCy;
        clampView();
      }
      lastCx = cx; lastCy = cy; lastDist = dist;
    }
  });
  const end = e => {
    const wasTap = pts.size === 1 && tap && !tap.moved;
    if (wasTap) onSelect(hitTest(tap.x, tap.y));
    pts.delete(e.pointerId);
    tap = null;
    refreshGesture();
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', e => { pts.delete(e.pointerId); tap = null; refreshGesture(); });
  cv.addEventListener('wheel', e => {
    e.preventDefault();
    const r = canvas.getBoundingClientRect();
    zoomAt(e.clientX - r.left, e.clientY - r.top, e.deltaY < 0 ? 1.14 : 0.88);
  }, { passive: false });

  // Browser-eigenes Pinch-Zoom/Scrollen im Schaubild unterbinden (v.a. iOS Safari)
  cv.addEventListener('touchmove', e => e.preventDefault(), { passive: false });
  cv.addEventListener('gesturestart', e => e.preventDefault());
  cv.addEventListener('gesturechange', e => e.preventDefault());
  cv.addEventListener('gestureend', e => e.preventDefault());
}

function pointAt(e) {
  const r = canvas.getBoundingClientRect();
  return { x: e.clientX - r.left, y: e.clientY - r.top };
}
function refreshGesture() {
  const arr = [...pts.values()];
  if (arr.length === 1) { lastCx = arr[0].x; lastCy = arr[0].y; lastDist = 0; }
  else if (arr.length >= 2) {
    lastCx = (arr[0].x + arr[1].x) / 2;
    lastCy = (arr[0].y + arr[1].y) / 2;
    lastDist = Math.hypot(arr[0].x - arr[1].x, arr[0].y - arr[1].y);
  } else { lastDist = 0; }
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  cssW = Math.max(1, r.width);
  cssH = Math.max(1, r.height);
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  clampView();
}

function minZoom() {
  return Math.max(0.12, Math.min(1, cssW * SCENE_H / (SCENE_W * cssH)));
}
function clampView() {
  zoom = clamp(zoom, minZoom(), 3.2);
  scale = (cssH / SCENE_H) * zoom;
  const sw = SCENE_W * scale, sh = SCENE_H * scale;
  panX = sw <= cssW ? (cssW - sw) / 2 : clamp(panX, cssW - sw, 0);
  panY = sh <= cssH ? (cssH - sh) / 2 : clamp(panY, cssH - sh, 0);
}
function zoomAt(cx, cy, f) {
  const z2 = clamp(zoom * f, minZoom(), 3.2);
  const f2 = z2 / zoom;
  panX = cx - (cx - panX) * f2;
  panY = cy - (cy - panY) * f2;
  zoom = z2;
  clampView();
}
function zoomBtnHit(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const x = clientX - r.left, y = clientY - r.top;
  const pad = 8; // großzügigere Trefferfläche als die sichtbare Taste
  for (const k of ['in', 'out']) {
    const [bx, by, s] = zoomBtn[k];
    if (x >= bx - pad && x <= bx + s + pad && y >= by - pad && y <= by + s + pad) return k;
  }
  return null;
}
function hitTest(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const sx = (clientX - r.left - panX) / scale;
  const sy = (clientY - r.top - panY) / scale;
  for (const id in HIT) {
    const [x, y, w, h] = HIT[id];
    if (sx >= x && sx <= x + w && sy >= y && sy <= y + h) return id;
  }
  return null;
}

// ---------- Zeichen-Helfer ----------
function rr(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}
function box(x, y, w, h, fill) {
  ctx.fillStyle = fill;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.4;
  ctx.strokeRect(x, y, w, h);
}
function vcyl(x, y, w, h, c1, c2) {
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, c2); g.addColorStop(0.42, c1);
  g.addColorStop(0.62, c1); g.addColorStop(1, c2);
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.4;
  ctx.strokeRect(x, y, w, h);
}
// Rauch — intensity 0..1 steuert Menge & Deckkraft, col die Färbung.
function smoke(x, y, clock, col, intensity) {
  const n = Math.round(1 + intensity * 3);
  for (let k = 0; k < n; k++) {
    const t = ((clock / 2600) + k / n) % 1;
    ctx.globalAlpha = (1 - t) * 0.10 + (1 - t) * 0.32 * intensity;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 6 + k) * 14, y - t * 96, 10 + t * (20 + intensity * 22), 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// Bodenschatten unter einem Aggregat.
function shadow(cx, halfW) {
  ctx.fillStyle = 'rgba(0,0,0,.26)';
  ctx.beginPath();
  ctx.ellipse(cx, GROUND + 3, halfW, 9, 0, 0, 7);
  ctx.fill();
}
// Senkrechte Steigleiter.
function ladder(lx, y0, y1) {
  ctx.strokeStyle = '#39434f';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(lx, y0); ctx.lineTo(lx, y1);
  ctx.moveTo(lx + 7, y0); ctx.lineTo(lx + 7, y1);
  ctx.stroke();
  ctx.lineWidth = 1.5;
  for (let yy = y0 + 7; yy < y1; yy += 11) {
    ctx.beginPath(); ctx.moveTo(lx, yy); ctx.lineTo(lx + 7, yy); ctx.stroke();
  }
}
// Handlauf-Geländer.
function railing(rx, ry, rw) {
  ctx.strokeStyle = '#7a8896';
  ctx.lineWidth = 1.8;
  ctx.beginPath(); ctx.moveTo(rx, ry - 10); ctx.lineTo(rx + rw, ry - 10); ctx.stroke();
  for (let xx = rx; xx <= rx + rw; xx += 13) {
    ctx.beginPath(); ctx.moveTo(xx, ry - 10); ctx.lineTo(xx, ry); ctx.stroke();
  }
}

// Förderbrücke (eingehauste Galerie) — flow steuert Partikelmenge, scrollVal die Bewegung.
function belt(x0, y0, x1, y1, flow, color, scrollVal) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(ang);
  const gh = 22;
  const g = ctx.createLinearGradient(0, -gh / 2, 0, gh / 2);
  g.addColorStop(0, '#4b5663'); g.addColorStop(0.5, '#3a434f'); g.addColorStop(1, '#2a323d');
  ctx.fillStyle = g;
  ctx.fillRect(0, -gh / 2, len, gh);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2;
  ctx.strokeRect(0, -gh / 2, len, gh);
  // Fachwerk-Andeutung
  ctx.strokeStyle = 'rgba(13,19,27,.42)'; ctx.lineWidth = 1.5;
  for (let sx = 6; sx < len - 12; sx += 26) {
    ctx.beginPath();
    ctx.moveTo(sx, -gh / 2 + 2); ctx.lineTo(sx + 13, gh / 2 - 2);
    ctx.moveTo(sx + 13, -gh / 2 + 2); ctx.lineTo(sx, gh / 2 - 2);
    ctx.stroke();
  }
  // Materialfluss
  const n = Math.min(9, Math.round(flow / 13));
  ctx.fillStyle = color;
  for (let k = 0; k < n; k++) {
    const t = ((scrollVal + k / n) % 1 + 1) % 1;
    ctx.beginPath();
    ctx.arc(10 + t * (len - 20), 3, 4, 0, 7);
    ctx.fill();
  }
  // Antriebstrommeln
  ctx.fillStyle = '#5c6776';
  for (const px of [3, len - 3]) {
    ctx.beginPath(); ctx.arc(px, 0, 9, 0, 7); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  }
  ctx.restore();
}

// ---------- Aggregate ----------
function drawQuarry() {
  // Felsmassiv mit Abbauterrassen
  const grd = ctx.createLinearGradient(0, 110, 0, GROUND);
  grd.addColorStop(0, '#7e7259'); grd.addColorStop(1, '#5b5240');
  ctx.fillStyle = grd;
  ctx.beginPath();
  ctx.moveTo(18, GROUND);
  ctx.lineTo(34, 322); ctx.lineTo(74, 304); ctx.lineTo(96, 252);
  ctx.lineTo(124, 234); ctx.lineTo(142, 168); ctx.lineTo(208, 132);
  ctx.lineTo(240, 198); ctx.lineTo(266, 214); ctx.lineTo(290, GROUND);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6; ctx.stroke();
  // Terrassenkanten
  ctx.strokeStyle = '#4a4233'; ctx.lineWidth = 3;
  for (const [ax, ay, bx, by] of [[40, 322, 92, 304], [78, 300, 158, 280],
    [100, 252, 214, 226], [142, 196, 248, 178], [150, 150, 224, 142]]) {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  // Schattenflanke rechts
  ctx.fillStyle = 'rgba(0,0,0,.17)';
  ctx.beginPath();
  ctx.moveTo(208, 132); ctx.lineTo(240, 198); ctx.lineTo(266, 214);
  ctx.lineTo(290, GROUND); ctx.lineTo(250, GROUND); ctx.closePath();
  ctx.fill();
  // Schutthaufen
  ctx.fillStyle = '#6c6149';
  for (const [rx, rw] of [[58, 13], [98, 9], [254, 11]]) {
    ctx.beginPath(); ctx.arc(rx, GROUND, rw, Math.PI, 0); ctx.fill();
  }
  // Muldenkipper
  const tx = 150, ty = 300;
  ctx.fillStyle = '#e0a93b';
  ctx.beginPath();
  ctx.moveTo(tx, ty); ctx.lineTo(tx + 42, ty); ctx.lineTo(tx + 36, ty - 15);
  ctx.lineTo(tx + 12, ty - 15); ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.8; ctx.stroke();
  box(tx - 12, ty - 13, 14, 13, '#caa235');
  ctx.fillStyle = '#1d2733';
  ctx.beginPath(); ctx.arc(tx - 4, ty + 2, 6, 0, 7); ctx.fill();
  ctx.beginPath(); ctx.arc(tx + 28, ty + 2, 6, 0, 7); ctx.fill();
}
function drawCrusher() {
  const [x, y, w, h] = HIT.crusher;
  shadow(x + w / 2, w / 2 + 4);
  // Aufgabetrichter
  ctx.fillStyle = '#8c98a6';
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 6); ctx.lineTo(x + w - 12, y + 6);
  ctx.lineTo(x + w - 40, y + 42); ctx.lineTo(x + 40, y + 42);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();
  // Gehäuse mit Wellblech
  const bx = x + 18, bw = w - 36, by = y + 42, bh = y + h - by;
  const g = ctx.createLinearGradient(bx, 0, bx + bw, 0);
  g.addColorStop(0, '#7a8490'); g.addColorStop(1, '#586470');
  ctx.fillStyle = g;
  ctx.fillRect(bx, by, bw, bh);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.strokeRect(bx, by, bw, bh);
  ctx.strokeStyle = 'rgba(13,19,27,.3)'; ctx.lineWidth = 1.4;
  for (let xx = bx + 9; xx < bx + bw; xx += 13) {
    ctx.beginPath(); ctx.moveTo(xx, by + 2); ctx.lineTo(xx, by + bh - 2); ctx.stroke();
  }
  box(x + w - 30, y + h - 52, 24, 28, '#49525d'); // Antrieb
  ladder(bx + 5, by + 6, by + bh);
}
// Mahlaggregat — Darstellung je nach gewähltem Typ.
function drawMill(id, accent, spinVal, type) {
  const [x, y, w, h] = HIT[id];
  shadow(x + w / 2, w / 2 + 4);
  box(x + 10, y + h - 30, w - 20, 30, '#4a5460'); // Fundament
  ctx.strokeStyle = 'rgba(255,255,255,.10)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.moveTo(x + 12, y + h - 28); ctx.lineTo(x + w - 12, y + h - 28); ctx.stroke();

  if (type === 'verticalmill') {
    // Vertikalmühle: stehendes Trapezgehäuse mit Klassierer und Mahlteller
    const cx = x + w / 2 - 12;
    const bodyBot = y + h - 30, bodyTop = y + 50;
    ctx.fillStyle = '#7c8590';
    ctx.beginPath();
    ctx.moveTo(cx - 32, bodyTop); ctx.lineTo(cx + 32, bodyTop);
    ctx.lineTo(cx + 56, bodyBot); ctx.lineTo(cx - 56, bodyBot);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();
    vcyl(cx - 26, bodyTop - 32, 52, 32, '#aeb7c2', '#7c8590');
    ctx.fillStyle = '#9aa4b0';
    ctx.beginPath();
    ctx.moveTo(cx - 26, bodyTop - 32); ctx.lineTo(cx + 26, bodyTop - 32);
    ctx.lineTo(cx, bodyTop - 50); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
    // rotierender Mahlteller
    ctx.save();
    ctx.translate(cx, bodyBot - 8);
    ctx.fillStyle = '#566270';
    ctx.beginPath(); ctx.ellipse(0, 0, 48, 12, 0, 0, 7); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.strokeStyle = accent; ctx.lineWidth = 3;
    for (let k = 0; k < 6; k++) {
      const a = spinVal * 6.283 + k * 1.047;
      ctx.beginPath(); ctx.moveTo(0, 0);
      ctx.lineTo(Math.cos(a) * 45, Math.sin(a) * 11); ctx.stroke();
    }
    ctx.restore();
    box(x + w - 44, y + h - 50, 34, 20, '#444d58');
    return;
  }

  if (type === 'rollerpress') {
    // Rollenpresse: Rahmen, Aufgabetrichter und zwei gegenläufige Walzen
    const cx = x + w / 2;
    const fy = y + h - 104, fh = 74;
    box(cx - 80, fy - 6, 160, fh + 12, '#5a6470');
    ctx.fillStyle = '#7f8b99';
    ctx.beginPath();
    ctx.moveTo(cx - 42, fy - 6); ctx.lineTo(cx + 42, fy - 6);
    ctx.lineTo(cx + 15, fy - 34); ctx.lineTo(cx - 15, fy - 34);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
    const rR = 31, ry = fy + fh / 2;
    [[1, cx - rR + 3], [-1, cx + rR - 3]].forEach(([dir, rx]) => {
      ctx.fillStyle = '#8a94a0';
      ctx.beginPath(); ctx.arc(rx, ry, rR, 0, 7); ctx.fill();
      ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();
      ctx.save();
      ctx.translate(rx, ry);
      ctx.strokeStyle = accent; ctx.lineWidth = 3;
      for (let k = 0; k < 6; k++) {
        const a = dir * spinVal * 6.283 + k * 1.047;
        ctx.beginPath(); ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * (rR - 6), Math.sin(a) * (rR - 6)); ctx.stroke();
      }
      ctx.restore();
    });
    box(x + w - 42, y + h - 50, 32, 20, '#444d58');
    return;
  }

  // Kugelmühle: liegende, rotierende Trommel
  const dy = y + h - 92, dh = 66;
  vcyl(x + 28, dy, w - 90, dh, '#808993', '#565f6b');
  ctx.fillStyle = '#737d8a';
  for (const cx of [x + 28, x + w - 62]) {
    ctx.beginPath();
    ctx.ellipse(cx, dy + dh / 2, 9, dh / 2, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  }
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  const span = w - 116;
  for (let k = 0; k < 4; k++) {
    const bx = x + 40 + (((spinVal + k / 4) % 1 + 1) % 1) * span;
    ctx.beginPath();
    ctx.moveTo(bx, dy + 4);
    ctx.lineTo(bx, dy + dh - 4);
    ctx.stroke();
  }
  box(x + w - 56, y + h - 56, 44, 26, '#444d58');
}
function drawSilo(R, id, c1, c2, matCol) {
  const [x, y, w, h] = HIT[id];
  shadow(x + w / 2, w / 2 + 6);
  const bodyTop = y + 20, skirtH = 20;
  const bodyBot = y + h - skirtH;
  const bodyH = bodyBot - bodyTop;
  box(x + 6, bodyBot, w - 12, skirtH, '#4d5762'); // Stützsockel
  vcyl(x, bodyTop, w, bodyH, c1, c2);
  // Füllstand
  const key = SILOKEY[id];
  if (key && R.state.silos[key]) {
    const f = clamp(R.state.silos[key].level / R.state.silos[key].cap, 0, 1);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x + 3, bodyTop + bodyH * (1 - f), w - 6, bodyH * f);
    ctx.clip();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = matCol;
    ctx.fillRect(x + 3, bodyTop, w - 6, bodyH);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  // Konstruktionsringe
  ctx.strokeStyle = 'rgba(13,19,27,.2)'; ctx.lineWidth = 1.5;
  for (let yy = bodyTop + 28; yy < bodyBot - 4; yy += 32) {
    ctx.beginPath(); ctx.moveTo(x + 1, yy); ctx.lineTo(x + w - 1, yy); ctx.stroke();
  }
  // flach gewölbtes Dach
  ctx.fillStyle = c1;
  ctx.beginPath();
  ctx.moveTo(x - 1, bodyTop + 2);
  ctx.quadraticCurveTo(x + w / 2, y - 12, x + w + 1, bodyTop + 2);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();
  box(x + w / 2 - 13, y - 22, 26, 14, '#6b7682'); // Kopfhaus
  ladder(x + w - 13, bodyTop + 8, bodyBot);
}
function drawPreheater(R) {
  const [x, y, w, h] = HIT.preheater;
  shadow(x + w / 2 + 8, w / 2);
  // Treppenturm links
  const stW = 24;
  box(x, y + 40, stW, h - 40, '#586470');
  ctx.strokeStyle = 'rgba(13,19,27,.45)'; ctx.lineWidth = 1.6;
  for (let yy = y + 50; yy < y + h - 6; yy += 16) {
    ctx.beginPath(); ctx.moveTo(x + 2, yy); ctx.lineTo(x + stW - 2, yy + 9); ctx.stroke();
  }
  // Betonturm
  const tx = x + stW + 4, tw = w - stW - 4;
  const g = ctx.createLinearGradient(tx, 0, tx + tw, 0);
  g.addColorStop(0, '#808a95'); g.addColorStop(0.5, '#6b7681'); g.addColorStop(1, '#525c67');
  ctx.fillStyle = g;
  ctx.fillRect(tx, y + 14, tw, h - 14);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6;
  ctx.strokeRect(tx, y + 14, tw, h - 14);
  // Etagen
  ctx.strokeStyle = 'rgba(13,19,27,.3)'; ctx.lineWidth = 2;
  for (let k = 1; k < 7; k++) {
    const fy = y + 14 + (h - 14) * k / 7;
    ctx.beginPath(); ctx.moveTo(tx, fy); ctx.lineTo(tx + tw, fy); ctx.stroke();
  }
  // Fenster
  ctx.fillStyle = 'rgba(20,28,38,.5)';
  for (let r = 0; r < 6; r++) {
    ctx.fillRect(tx + tw - 26, y + 26 + r * (h - 14) / 7, 15, 13);
  }
  // Zyklone (Anzahl = Vorwärmerstufen)
  const n = R.state.upgrades.preheaterStages;
  const cw = tw - 30, cx = tx + 6;
  const cTop = y + 20, cBot = y + h - 66;
  const ch = (cBot - cTop) / n;
  for (let k = 0; k < n; k++) {
    const cy = cTop + k * ch;
    ctx.strokeStyle = '#7c8590'; ctx.lineWidth = 6; // Steigleitung
    ctx.beginPath();
    ctx.moveTo(cx + cw - 6, cy + ch - 8);
    ctx.lineTo(cx + cw + 9, cy + ch * 0.28);
    ctx.stroke();
    vcyl(cx, cy, cw, ch * 0.46, '#c2cad3', '#8c95a0');
    ctx.fillStyle = '#aab3bd';
    ctx.beginPath();
    ctx.moveTo(cx, cy + ch * 0.46);
    ctx.lineTo(cx + cw, cy + ch * 0.46);
    ctx.lineTo(cx + cw / 2, cy + ch - 3);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  }
  // fallendes Rohmehl — Menge nach Klinkerdurchsatz
  const act = clamp(R.clk / 130, 0, 1);
  const dots = Math.round(act * 5);
  ctx.fillStyle = '#d8c79c';
  for (let k = 0; k < dots; k++) {
    const t = ((R.scroll.raw * 1.4 + k / dots) % 1 + 1) % 1;
    ctx.beginPath();
    ctx.arc(cx + cw / 2 + Math.sin(k * 2) * 8, cTop + t * (cBot - cTop), 3.4, 0, 7);
    ctx.fill();
  }
  railing(tx + 4, y + 14, tw - 8);
  box(x + w / 2 - 9, y - 28, 20, 42, '#566069'); // Gasabzug / Kamin
  const co2 = R.m ? R.m.co2PerClinker : 700;
  smoke(x + w / 2 + 1, y - 28, R.puff, smokeColor(co2), 0.35 + act * 0.55);
}
function drawCalciner(R) {
  const [x, y, w, h] = HIT.calciner;
  vcyl(x + 12, y, w - 24, h - 46, '#a6b0bb', '#6c7681');
  // Kegelkopf
  ctx.fillStyle = '#9aa4b0';
  ctx.beginPath();
  ctx.moveTo(x + 12, y); ctx.lineTo(x + w - 12, y);
  ctx.lineTo(x + w / 2, y - 22); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  // konischer Auslauf
  ctx.fillStyle = '#7c8590';
  ctx.beginPath();
  ctx.moveTo(x + 12, y + h - 46); ctx.lineTo(x + w - 12, y + h - 46);
  ctx.lineTo(x + w / 2 + 7, y + h - 16); ctx.lineTo(x + w / 2 - 7, y + h - 16);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  // Brenner — pulsiert mit Brennintensität
  const bi = R.state.controls.burningIntensity;
  const on = R.clk > 0 ? 1 : 0;
  const pr = (5 + bi * 6) * on * (0.8 + 0.2 * Math.sin(R.puff / 130));
  ctx.fillStyle = '#ffa238';
  ctx.beginPath();
  ctx.arc(x + w - 8, y + h - 62, Math.max(0.1, pr), 0, 7);
  ctx.fill();
}
function drawKiln(R) {
  const x0 = 1075, y0 = 392, x1 = 1372, y1 = 446;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  const bi = R.state.controls.burningIntensity;
  const on = R.clk > 0 ? 1 : 0;
  const temp = R.m ? R.m.kilnTemp : 1400;
  const tF = clamp((temp - 1360) / 150, 0, 1);

  // Glut — Intensität nach Brennintensität, Farbe nach Temperatur
  const inten = on * (0.22 + 0.6 * bi);
  const gl = ctx.createRadialGradient(x1, y1, 6, x1, y1, 160);
  gl.addColorStop(0, `rgba(255,${140 + tF * 70},${40 + tF * 60},${inten})`);
  gl.addColorStop(1, 'rgba(255,150,50,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(x1 - 160, y1 - 160, 320, 230);

  // Stützpfeiler unter den Laufringen
  for (const f of [0.26, 0.72]) {
    const wx = x0 + (x1 - x0) * f;
    const wy = y0 + (y1 - y0) * f;
    ctx.fillStyle = '#5b6571';
    ctx.beginPath();
    ctx.moveTo(wx - 15, wy + 20); ctx.lineTo(wx + 15, wy + 20);
    ctx.lineTo(wx + 24, GROUND); ctx.lineTo(wx - 24, GROUND);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();
  }

  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(ang);
  const d = 56;
  const g = ctx.createLinearGradient(0, -d / 2, 0, d / 2);
  g.addColorStop(0, '#8b6a4a'); g.addColorStop(0.5, '#c98a52'); g.addColorStop(1, '#7a5a3e');
  ctx.fillStyle = g;
  ctx.fillRect(0, -d / 2, len, d);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6;
  ctx.strokeRect(0, -d / 2, len, d);
  // rotierende Bänder — Versatz aus spin.kiln (Drehzahl ~ Durchsatz)
  ctx.strokeStyle = 'rgba(60,40,25,.55)';
  ctx.lineWidth = 5;
  for (let k = 0; k < 7; k++) {
    const bx = (((R.spin.kiln + k / 7) % 1 + 1) % 1) * (len - 10) + 5;
    ctx.beginPath();
    ctx.moveTo(bx, -d / 2 + 3);
    ctx.lineTo(bx, d / 2 - 3);
    ctx.stroke();
  }
  ctx.fillStyle = '#3f4954';
  for (const rx of [len * 0.26, len * 0.72]) {
    ctx.fillRect(rx - 7, -d / 2 - 5, 14, d + 10);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2;
    ctx.strokeRect(rx - 7, -d / 2 - 5, 14, d + 10);
    ctx.fillStyle = '#566270';
    ctx.beginPath(); ctx.arc(rx - 14, d / 2 + 12, 10, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(rx + 14, d / 2 + 12, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#3f4954';
  }
  ctx.fillStyle = '#48525e';
  ctx.fillRect(len * 0.49 - 9, -d / 2 - 8, 18, d + 16);
  ctx.restore();

  // Ofenkopf & Flamme — Länge nach Brennintensität
  box(x1 - 6, y1 - 44, 40, 78, '#5a6470');
  const flame = on * (0.5 + 0.9 * bi);
  for (let k = 0; k < 5; k++) {
    const t = ((R.puff / 200 + k / 5) % 1);
    const reach = 30 * flame;
    ctx.fillStyle = `rgba(255,${170 - t * 110},40,${(0.85 - t * 0.8) * flame})`;
    ctx.beginPath();
    ctx.arc(x1 - 22 - t * reach, y1 - 6, (15 - t * 9) * (0.6 + flame * 0.5), 0, 7);
    ctx.fill();
  }
}
function drawCooler(R) {
  const [x, y, w, h] = HIT.cooler;
  shadow(x + w / 2, w / 2 + 4);
  // Gehäuse
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#7b8591'); g.addColorStop(1, '#58626d');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x, y + 24); ctx.lineTo(x + w, y + 12);
  ctx.lineTo(x + w - 14, y + h - 26); ctx.lineTo(x + 14, y + h - 26);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6; ctx.stroke();
  // Rost-Linien
  ctx.strokeStyle = 'rgba(13,19,27,.32)'; ctx.lineWidth = 2.4;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(x + 14, y + 24 + k * 20); ctx.lineTo(x + w - 14, y + 12 + k * 20);
    ctx.stroke();
  }
  // Unterkorn-Trichter
  ctx.fillStyle = '#4e5863';
  for (let k = 0; k < 3; k++) {
    const hx = x + 26 + k * (w - 52) / 2;
    ctx.beginPath();
    ctx.moveTo(hx - 15, y + h - 26); ctx.lineTo(hx + 15, y + h - 26);
    ctx.lineTo(hx, y + h - 2); ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.8; ctx.stroke();
  }
  // Kühlluftgebläse
  ctx.fillStyle = '#5a6470';
  ctx.beginPath(); ctx.arc(x + w - 2, y + h - 44, 11, 0, 7); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
  box(x + w / 2 - 11, y - 26, 22, 38, '#525c68'); // Abluftkamin
  smoke(x + w / 2, y - 26, R.puff + 800, '#aab6c4', 0.3 + clamp(R.clk / 130, 0, 1) * 0.5);
}
function drawDome(R) {
  const [x, y, w, h] = HIT.clinkersilo;
  shadow(x + w / 2, w / 2 + 4);
  const baseY = y + h - 36;
  box(x + 4, baseY, w - 8, 36, '#55606c'); // Sockelring
  // Kuppel mit Schattierung
  const g = ctx.createLinearGradient(x, 0, x + w, 0);
  g.addColorStop(0, '#9aa6b3'); g.addColorStop(0.4, '#aeb8c3');
  g.addColorStop(0.66, '#8f9aa6'); g.addColorStop(1, '#6c7783');
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.moveTo(x + 4, baseY);
  ctx.quadraticCurveTo(x + w / 2, y - 18, x + w - 4, baseY);
  ctx.closePath();
  ctx.fill();
  // Klinker-Füllstand innerhalb der Kuppel
  const sil = R.state.silos.clinker;
  if (sil) {
    const f = clamp(sil.level / sil.cap, 0, 1);
    const apexY = y - 18;
    const fillTop = baseY - (baseY - apexY) * f;
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(x + 4, baseY);
    ctx.quadraticCurveTo(x + w / 2, apexY, x + w - 4, baseY);
    ctx.closePath();
    ctx.clip();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = '#9c9484';
    ctx.fillRect(x, fillTop, w, baseY - fillTop + 2);
    ctx.globalAlpha = 1;
    ctx.restore();
  }
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6;
  ctx.beginPath();
  ctx.moveTo(x + 4, baseY);
  ctx.quadraticCurveTo(x + w / 2, y - 18, x + w - 4, baseY);
  ctx.closePath();
  ctx.stroke();
  // Segmentrippen
  ctx.strokeStyle = 'rgba(13,19,27,.24)'; ctx.lineWidth = 1.6;
  for (const fx of [0.26, 0.5, 0.74]) {
    ctx.beginPath();
    ctx.moveTo(x + 4 + (w - 8) * fx, baseY);
    ctx.quadraticCurveTo(x + w / 2, y + 14, x + w / 2, y - 12);
    ctx.stroke();
  }
  box(x + w / 2 - 12, y - 26, 24, 14, '#6b7682'); // Kopfhaus
}
function drawCementSilos(R) {
  const [x, y, w, h] = HIT.cementsilo;
  shadow(x + w / 2, w / 2 + 6);
  box(x + 2, y + 6, w - 4, 9, '#6b7682'); // Verbindungssteg oben
  const sw = (w - 8) / 3;
  const sil = R.state.silos.cement;
  const f = sil ? clamp(sil.level / sil.cap, 0, 1) : 0;
  for (let k = 0; k < 3; k++) {
    const sx = x + 4 + k * sw;
    const top = y + 16;
    const innerH = h - 32;
    box(sx + 2, y + h - 16, sw - 6, 16, '#4d5762'); // Sockel
    vcyl(sx + 2, top, sw - 6, innerH, '#ced5dd', '#9aa3ad');
    // Zement-Füllstand
    if (f > 0) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(sx + 3, top + innerH * (1 - f), sw - 8, innerH * f);
      ctx.clip();
      ctx.globalAlpha = 0.8;
      ctx.fillStyle = '#e0e4ea';
      ctx.fillRect(sx + 3, top, sw - 8, innerH);
      ctx.globalAlpha = 1;
      ctx.restore();
    }
    // flache Kuppe
    ctx.fillStyle = '#c4ccd4';
    ctx.beginPath();
    ctx.moveTo(sx + 1, top + 2);
    ctx.quadraticCurveTo(sx + sw / 2 - 1, y + 2, sx + sw - 3, top + 2);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
    ctx.strokeStyle = 'rgba(13,19,27,.16)'; ctx.lineWidth = 1.4;
    for (let yy = top + 30; yy < y + h - 20; yy += 36) {
      ctx.beginPath(); ctx.moveTo(sx + 3, yy); ctx.lineTo(sx + sw - 5, yy); ctx.stroke();
    }
  }
}
function drawDispatch() {
  const [x, y, w, h] = HIT.dispatch;
  shadow(x + w / 2, w / 2 + 12);
  // Verladesilo
  vcyl(x + 20, y, w - 40, h - 86, '#aeb7c1', '#7d8791');
  ctx.fillStyle = '#9aa3ad';
  ctx.beginPath();
  ctx.moveTo(x + 20, y + h - 86); ctx.lineTo(x + w - 20, y + h - 86);
  ctx.lineTo(x + w / 2 + 8, y + h - 56); ctx.lineTo(x + w / 2 - 8, y + h - 56);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  box(x + 2, y + h - 60, w - 4, 8, '#5a6470'); // Verladedach
  // Silozug-LKW
  const tx = x + 4, ty = y + h - 6;
  ctx.fillStyle = '#dfe4ea';
  ctx.beginPath();
  ctx.moveTo(tx + 16, ty - 30); ctx.lineTo(tx + 60, ty - 33);
  ctx.lineTo(tx + 60, ty - 13); ctx.lineTo(tx + 16, ty - 13);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 1.8; ctx.stroke();
  box(tx, ty - 21, 16, 15, '#3f6fae'); // Fahrerhaus
  ctx.fillStyle = '#1d2733';
  for (const wx of [tx + 8, tx + 32, tx + 50]) {
    ctx.beginPath(); ctx.arc(wx, ty, 7, 0, 7); ctx.fill();
  }
}

function smokeColor(co2PerClinker) {
  const t = clamp((co2PerClinker - 600) / 320, 0, 1);
  const r = Math.round(190 - t * 120);
  const g = Math.round(198 - t * 130);
  const b = Math.round(208 - t * 130);
  return `rgb(${r},${g},${b})`;
}

// ---------- Beschriftung & Status ----------
function sublabel(id, state, m) {
  if (SILOKEY[id]) {
    const s = state.silos[SILOKEY[id]];
    return Math.round(s.level / s.cap * 100) + '%';
  }
  if (!m) return '';
  switch (id) {
    case 'quarry': case 'crusher': case 'rawmill': return fmt0(m.rawMealOut) + ' t/h';
    case 'preheater': return state.upgrades.preheaterStages + ' Stufen';
    case 'calciner': case 'cooler': return fmt0(m.clinkerOut) + ' t/h';
    case 'kiln': return fmt0(m.clinkerOut) + ' t/h · ' + m.kilnTemp + '°C';
    case 'cementmill': return fmt0(m.cementOut) + ' t/h';
    case 'dispatch': return fmt0(m.sold) + ' t/h';
  }
  return '';
}
function drawLabel(id, state, m) {
  const [x, y, w, h] = HIT[id];
  const cx = x + w / 2, ly = y + h + 6;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe8f2';
  ctx.font = '600 16px Segoe UI, sans-serif';
  ctx.fillText(NAMES[id], cx, ly + 13, w + 90);
  const sl = sublabel(id, state, m);
  if (sl) {
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '14px Segoe UI, sans-serif';
    ctx.fillText(sl, cx, ly + 31);
  }
  // Kostensumme des Aggregats
  const uc = m && m.unitCosts && m.unitCosts[id];
  if (uc) {
    ctx.fillStyle = '#ff8f86';
    ctx.font = '600 13px Segoe UI, sans-serif';
    ctx.fillText('−' + fmtMoney(uc.total) + '/h', cx, ly + (sl ? 48 : 31));
  }
}
function drawStatus(id, state, m, selected) {
  const [x, y, w, h] = HIT[id];
  if (id === selected) {
    ctx.strokeStyle = '#ffd24a';
    ctx.lineWidth = 3.5;
    ctx.shadowColor = '#ffd24a';
    ctx.shadowBlur = 16;
    rr(x - 6, y - 6, w + 12, h + 12, 12);
    ctx.stroke();
    ctx.shadowBlur = 0;
  }
  const avail = m ? (m.avail[id] ?? 1) : 1;
  const cond = state.units[id] ? state.units[id].condition : 100;
  if (avail < 1 || cond < 20) {
    const wx = x + w / 2, wy = y - 14;
    ctx.fillStyle = avail < 1 ? '#ff5a52' : '#ffb13b';
    ctx.beginPath();
    ctx.moveTo(wx, wy - 14); ctx.lineTo(wx + 14, wy + 10); ctx.lineTo(wx - 14, wy + 10);
    ctx.closePath(); ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#1d2733';
    ctx.textAlign = 'center';
    ctx.font = '700 16px Segoe UI, sans-serif';
    ctx.fillText('!', wx, wy + 8);
  }
}

const MILL_NAME = { ballmill: 'Kugelmühle', verticalmill: 'Vertikalmühle', rollerpress: 'Rollenpresse' };

// Welche Ausbauten/Einstellungen sind an einem Aggregat sichtbar zu kennzeichnen?
function upgradeTags(id, state) {
  const u = state.upgrades, t = [];
  if (id === 'preheater' && u.preheaterStages > 4) t.push(u.preheaterStages + '-stufig');
  if (id === 'cooler') {
    if (u.coolerEff >= 0.78) t.push('Hocheffizienz');
    if (u.whr) t.push('WHR-Strom');
  }
  if (id === 'kiln' && u.altFuelSystem) t.push('RDF-Dosierung');
  if (id === 'rawmill' || id === 'cementmill') t.push(MILL_NAME[state.controls.millType] || '');
  return t.filter(Boolean);
}

// Grüne Plaketten über einem Aggregat — zeigen die installierten Ausbauten.
function drawUpgradeTags(id, state) {
  const tags = upgradeTags(id, state);
  if (!tags.length) return;
  const [x, y, w] = HIT[id];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = '600 13px Segoe UI, sans-serif';
  let ty = y - 13;
  for (let i = tags.length - 1; i >= 0; i--) {
    const label = tags[i];
    const tw = ctx.measureText(label).width + 16;
    ctx.fillStyle = 'rgba(67,209,122,.94)';
    rr(x + w / 2 - tw / 2, ty - 9, tw, 18, 9);
    ctx.fill();
    ctx.strokeStyle = OUTLINE;
    ctx.lineWidth = 1.4;
    ctx.stroke();
    ctx.fillStyle = '#0c2415';
    ctx.fillText(label, x + w / 2, ty + 1);
    ty -= 23;
  }
  ctx.textBaseline = 'alphabetic';
}

function drawZoomButtons() {
  const s = 42, mg = 12;
  const bx = cssW - mg - s;
  zoomBtn.in = [bx, cssH - mg - s * 2 - 8, s];
  zoomBtn.out = [bx, cssH - mg - s, s];
  for (const [k, sym] of [['in', '+'], ['out', '−']]) {
    const [x, y] = zoomBtn[k];
    ctx.fillStyle = 'rgba(29,42,57,.92)';
    ctx.strokeStyle = '#5b6b7e';
    ctx.lineWidth = 2;
    rr(x, y, s, s, 10);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = '#dfe8f2';
    ctx.font = '700 24px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(sym, x + s / 2, y + s / 2 + 1);
  }
  ctx.textBaseline = 'alphabetic';
}

// ---------- Tageszeit-Himmel ----------
function lerp(a, b, t) { return a + (b - a) * t; }
function rgbStr(a) { return `rgb(${a[0] | 0},${a[1] | 0},${a[2] | 0})`; }
function lerpArr(a, b, t) { return a.map((v, i) => lerp(v, b[i], t)); }

function skyAt(hour) {
  const h = ((hour % 24) + 24) % 24;
  for (let i = 0; i < SKY.length - 1; i++) {
    if (h >= SKY[i].h && h < SKY[i + 1].h) {
      const t = (h - SKY[i].h) / (SKY[i + 1].h - SKY[i].h);
      return {
        top: lerpArr(SKY[i].top, SKY[i + 1].top, t),
        bot: lerpArr(SKY[i].bot, SKY[i + 1].bot, t),
      };
    }
  }
  return { top: SKY[0].top, bot: SKY[0].bot };
}
function nightFactor(hour) {
  const h = ((hour % 24) + 24) % 24;
  if (h >= 21 || h <= 4) return 1;
  if (h > 4 && h < 6) return clamp((6 - h) / 2, 0, 1);
  if (h > 19 && h < 21) return clamp((h - 19) / 2, 0, 1);
  return 0;
}
function ensureStars() {
  if (stars) return;
  stars = [];
  for (let i = 0; i < 84; i++) {
    stars.push({
      x: Math.random(), y: Math.random() * 0.56,
      r: Math.random() * 1.4 + 0.5, ph: Math.random() * 7,
    });
  }
}
function drawCloud(cx, cy, s, alpha) {
  if (alpha <= 0.01) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = '#dfe6ee';
  for (const [dx, dy, r] of [[-34, 6, 22], [-8, -6, 28], [22, 4, 24], [46, 10, 18]]) {
    ctx.beginPath();
    ctx.arc(cx + dx * s, cy + dy * s, r * s, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
// bgX/bgY = Parallax-Versatz: der Himmel bewegt sich beim Schwenken mit,
// aber nur mit einem Bruchteil des Vordergrunds.
function drawSky(hour, now, bgX, bgY) {
  ensureStars();
  const pal = skyAt(hour);
  const g = ctx.createLinearGradient(0, 0, 0, cssH);
  g.addColorStop(0, rgbStr(pal.top));
  g.addColorStop(0.72, rgbStr(pal.bot));
  g.addColorStop(1, rgbStr(lerpArr(pal.bot, [0, 0, 0], 0.25)));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cssW, cssH);

  const wrap = v => ((v % cssW) + cssW) % cssW;

  // Sterne (parallax, horizontal umlaufend)
  const nf = nightFactor(hour);
  if (nf > 0) {
    ctx.fillStyle = '#ffffff';
    for (const st of stars) {
      const tw = 0.55 + 0.45 * Math.sin(now / 600 + st.ph);
      ctx.globalAlpha = nf * tw * 0.9;
      ctx.beginPath();
      ctx.arc(wrap(st.x * cssW + bgX), st.y * cssH + bgY, st.r, 0, 7);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  const horizon = cssH * 0.66, apex = cssH * 0.09;
  const left = cssW * 0.12, right = cssW * 0.88;

  // Sonne auf dem Tagesbogen (6–18 Uhr)
  const sunP = (hour - 6) / 12;
  const sunAlt = Math.sin(clamp(sunP, 0, 1) * Math.PI);
  if (sunP > -0.07 && sunP < 1.07) {
    const sx = lerp(left, right, sunP) + bgX;
    const sy = lerp(horizon, apex, Math.max(0, sunAlt)) + bgY;
    const warm = clamp(1 - sunAlt * 1.7, 0, 1);
    if (warm > 0.05) {
      const hg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 220);
      hg.addColorStop(0, `rgba(255,140,60,${0.42 * warm})`);
      hg.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = hg;
      ctx.fillRect(sx - 220, sy - 220, 440, 440);
    }
    const col = rgbStr(lerpArr([255, 138, 58], [255, 236, 172], clamp(sunAlt * 1.5, 0, 1)));
    const dg = ctx.createRadialGradient(sx, sy, 0, sx, sy, 52);
    dg.addColorStop(0, col);
    dg.addColorStop(0.5, col);
    dg.addColorStop(1, 'rgba(255,220,150,0)');
    ctx.fillStyle = dg;
    ctx.beginPath(); ctx.arc(sx, sy, 52, 0, 7); ctx.fill();
    ctx.fillStyle = col;
    ctx.beginPath(); ctx.arc(sx, sy, 21, 0, 7); ctx.fill();
  }

  // Mond auf dem Nachtbogen (18–6 Uhr)
  const moonP = ((((hour - 18) % 24) + 24) % 24) / 12;
  const moonAlt = Math.sin(clamp(moonP, 0, 1) * Math.PI);
  if (moonP > -0.07 && moonP < 1.07) {
    const mx = lerp(left, right, moonP) + bgX;
    const my = lerp(horizon, apex, Math.max(0, moonAlt)) + bgY;
    const mg = ctx.createRadialGradient(mx, my, 0, mx, my, 48);
    mg.addColorStop(0, 'rgba(214,224,240,.55)');
    mg.addColorStop(1, 'rgba(214,224,240,0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx, my, 48, 0, 7); ctx.fill();
    ctx.fillStyle = '#e7ecf3';
    ctx.beginPath(); ctx.arc(mx, my, 16, 0, 7); ctx.fill();
    ctx.fillStyle = '#ccd4df';
    for (const [dx, dy, r] of [[-5, -4, 4], [6, 3, 3], [2, -7, 2.4]]) {
      ctx.beginPath(); ctx.arc(mx + dx, my + dy, r, 0, 7); ctx.fill();
    }
  }

  // Wolken (tagsüber sichtbar, parallax umlaufend)
  const dayF = clamp((hour - 5.5) / 2, 0, 1) * clamp((19.5 - hour) / 2, 0, 1);
  for (const c of CLOUDS) {
    const f = c.x + now * 0.0000022 * c.sp + bgX / cssW;
    const cf = ((f % 1.3) + 1.3) % 1.3 - 0.15;
    drawCloud(cf * cssW, c.y * cssH + bgY, c.s, dayF * 0.5);
  }
}

// ---------- Hauptfunktion ----------
export function drawFlowsheet(state, now, selectedId, hourFloat) {
  const hour = hourFloat ?? state.time.hour;
  if (!ctx) return;
  // Canvas-Größe laufend mit dem echten Layout abgleichen — HUD-Alarmzeile,
  // iOS-Adressleiste u. Ä. ändern die Höhe ohne resize-Event, was sonst die
  // Touch-Umrechnung verschiebt.
  const cr = canvas.getBoundingClientRect();
  if (Math.abs(cr.width - cssW) > 0.5 || Math.abs(cr.height - cssH) > 0.5) resize();
  clampView();

  // Animationszeit nur fortschreiben, wenn das Spiel läuft
  const dt = animLast ? clamp(now - animLast, 0, 120) : 0;
  animLast = now;
  const m = state.metrics;
  const raw = m ? m.rawMealOut : 0, clk = m ? m.clinkerOut : 0, cem = m ? m.cementOut : 0;
  if (state.speed > 0) {
    const sp = state.speed; // Animationstempo folgt der Vorspulgeschwindigkeit
    scroll.raw += dt * sp * (0.00020 + raw * 0.0000050);
    scroll.clinker += dt * sp * (0.00020 + clk * 0.0000060);
    scroll.cement += dt * sp * (0.00020 + cem * 0.0000050);
    spin.kiln += dt * sp * (clk / 110) * 0.00045;
    spin.rawmill += dt * sp * (raw / 175) * 0.00110;
    spin.cementmill += dt * sp * (cem / 120) * 0.00110;
    puff += dt * sp;
  }

  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const bgX = clamp(panX * 0.25, -cssW * 0.55, cssW * 0.55);
  const bgY = clamp(panY * 0.25, -cssH * 0.28, cssH * 0.28);
  drawSky(hour, now, bgX, bgY);

  // Boden bis zur Unterkante des Fensters ziehen (auch beim Rauszoomen)
  const horizonY = Math.max(0, panY + GROUND * scale);
  if (horizonY < cssH) {
    ctx.fillStyle = '#322d26';
    ctx.fillRect(0, horizonY, cssW, cssH - horizonY);
  }

  ctx.save();
  ctx.translate(panX, panY);
  ctx.scale(scale, scale);

  const R = { state, m, now, clk, scroll, spin, puff };

  ctx.fillStyle = '#2f3e54';
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  for (let i = 0; i <= SCENE_W; i += 220) {
    ctx.lineTo(i, GROUND - 70 - 40 * Math.sin(i * 0.7));
  }
  ctx.lineTo(SCENE_W, GROUND);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = '#322d26';
  ctx.fillRect(0, GROUND, SCENE_W, SCENE_H - GROUND);
  ctx.fillStyle = '#3c372e';
  ctx.fillRect(0, GROUND, SCENE_W, 8);

  belt(280, 250, 322, 320, raw, '#c7b48f', scroll.raw);
  belt(430, 372, 470, 360, raw, '#c7b48f', scroll.raw);
  belt(690, 330, 760, 210, raw, '#c7b48f', scroll.raw);
  belt(820, 196, 980, 120, raw, '#c7b48f', scroll.raw);
  belt(1505, 392, 1576, 360, clk, '#ff9528', scroll.clinker);
  belt(1705, 392, 1782, 358, clk, '#d7d0c4', scroll.clinker);
  belt(1965, 332, 2055, 206, cem, '#e2e7ee', scroll.cement);
  belt(2120, 300, 2176, 332, cem, '#e2e7ee', scroll.cement);

  const millType = state.controls.millType;
  drawQuarry();
  drawCrusher();
  drawMill('rawmill', '#c7b48f', spin.rawmill, millType);
  drawSilo(R, 'blending', '#c2cad3', '#9099a3', '#c7b48f');
  drawPreheater(R);
  drawCalciner(R);
  drawKiln(R);
  drawCooler(R);
  drawDome(R);
  drawMill('cementmill', '#aeb7c2', spin.cementmill, millType);
  drawCementSilos(R);
  drawDispatch();

  for (const id in HIT) drawLabel(id, state, m);
  for (const id in HIT) drawUpgradeTags(id, state);
  for (const id in HIT) drawStatus(id, state, m, selectedId);

  ctx.restore();

  // Nachtschleier — dunkelt das Werk in der Nacht ab
  const nf = nightFactor(hour);
  if (nf > 0) {
    ctx.fillStyle = `rgba(8,12,28,${nf * 0.34})`;
    ctx.fillRect(0, 0, cssW, cssH);
  }

  drawZoomButtons();

  ctx.fillStyle = 'rgba(223,232,242,.5)';
  ctx.font = '12px Segoe UI, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('Ziehen zum Schwenken · zwei Finger oder +/− zum Zoomen', cssW / 2, cssH - 8);
}
