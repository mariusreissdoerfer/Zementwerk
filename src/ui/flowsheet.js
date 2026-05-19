// Realistische, gezeichnete Werksansicht (Seitenelevation) auf Canvas.
// Schwenkbar (Pan), antippbare Aggregate, animierte Stoffströme.

import { fmt0 } from '../util.js';

const SCENE_W = 2260, SCENE_H = 560, GROUND = 460;
const OUTLINE = '#0d131b';

const NAMES = {
  quarry: 'Steinbruch', crusher: 'Brecher', rawmill: 'Rohmühle', blending: 'Rohmehl-Silo',
  preheater: 'Vorwärmerturm', calciner: 'Calcinator', kiln: 'Drehrohrofen', cooler: 'Klinkerkühler',
  clinkersilo: 'Klinkersilo', cementmill: 'Zementmühle', cementsilo: 'Zementsilo', dispatch: 'Versand',
};

// Trefferflächen (Szenenkoordinaten)
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
let scale = 1, panX = 0, originX = 0;
let onSelect = () => {};
let drag = null;

export function initFlowsheet(cv, selectCb) {
  canvas = cv;
  ctx = cv.getContext('2d');
  if (selectCb) onSelect = selectCb;
  resize();
  window.addEventListener('resize', resize);

  cv.addEventListener('pointerdown', e => {
    drag = { x0: e.clientX, panStart: panX, moved: false };
    cv.setPointerCapture(e.pointerId);
  });
  cv.addEventListener('pointermove', e => {
    if (!drag) return;
    const d = e.clientX - drag.x0;
    if (Math.abs(d) > 6) drag.moved = true;
    panX = drag.panStart + d;
    clampPan();
  });
  const end = e => {
    if (drag && !drag.moved) {
      const id = hitTest(e.clientX, e.clientY);
      onSelect(id);
    }
    drag = null;
  };
  cv.addEventListener('pointerup', end);
  cv.addEventListener('pointercancel', () => { drag = null; });
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  cssW = Math.max(320, r.width);
  cssH = Math.max(240, r.height);
  canvas.width = cssW * dpr;
  canvas.height = cssH * dpr;
}

function clampPan() {
  scale = cssH / SCENE_H;
  const sw = SCENE_W * scale;
  if (sw <= cssW) { originX = (cssW - sw) / 2; panX = 0; }
  else { originX = 0; panX = clamp(panX, cssW - sw, 0); }
}

function hitTest(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const sx = (clientX - r.left - originX - panX) / scale;
  const sy = (clientY - r.top) / scale;
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
// Vertikaler Zylinder mit Schein-Rundung.
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
function smoke(x, y, now, col) {
  for (let k = 0; k < 3; k++) {
    const t = ((now / 2600) + k / 3) % 1;
    ctx.globalAlpha = (1 - t) * 0.35;
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.arc(x + Math.sin(t * 6 + k) * 14, y - t * 90, 12 + t * 26, 0, 7);
    ctx.fill();
  }
  ctx.globalAlpha = 1;
}
function belt(x0, y0, x1, y1, flow, color, now) {
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(ang);
  ctx.fillStyle = '#2b3543';
  ctx.fillRect(0, -9, len, 18);
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2;
  ctx.strokeRect(0, -9, len, 18);
  ctx.fillStyle = '#5c6776';
  for (const px of [0, len]) {
    ctx.beginPath();
    ctx.arc(px, 0, 11, 0, 7);
    ctx.fill();
    ctx.stroke();
  }
  const n = Math.min(7, Math.round(flow / 16));
  ctx.fillStyle = color;
  for (let k = 0; k < n; k++) {
    const t = ((now / 1700) * (0.4 + flow / 220) + k / n) % 1;
    ctx.beginPath();
    ctx.arc(8 + t * (len - 16), -3, 4.6, 0, 7);
    ctx.fill();
  }
  ctx.restore();
}

// ---------- Aggregate ----------
function drawQuarry(R) {
  // Abraumhalde / Steinbruch mit Terrassen
  ctx.fillStyle = '#6f6450';
  ctx.beginPath();
  ctx.moveTo(20, GROUND);
  ctx.lineTo(40, 300);
  ctx.lineTo(110, 250);
  ctx.lineTo(130, 170);
  ctx.lineTo(210, 130);
  ctx.lineTo(260, 210);
  ctx.lineTo(285, GROUND);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.6;
  ctx.stroke();
  // Terrassen
  ctx.strokeStyle = '#564d3d';
  ctx.lineWidth = 3;
  for (const [ax, ay, bx, by] of [[48, 320, 150, 290], [120, 250, 235, 215], [150, 195, 220, 168]]) {
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.lineTo(bx, by); ctx.stroke();
  }
  // Bagger (vereinfacht)
  ctx.fillStyle = '#e0a93b';
  box(150, 250, 34, 20, '#e0a93b');
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4;
  ctx.beginPath(); ctx.moveTo(184, 256); ctx.lineTo(214, 240); ctx.stroke();
}
function drawCrusher(R) {
  const [x, y, w, h] = HIT.crusher;
  // Trichter
  ctx.fillStyle = '#7f8b99';
  ctx.beginPath();
  ctx.moveTo(x + 6, y); ctx.lineTo(x + w - 6, y);
  ctx.lineTo(x + w - 34, y + 40); ctx.lineTo(x + 34, y + 40);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();
  // Gehäuse
  box(x + 20, y + 40, w - 40, h - 40, '#69737f');
  box(x + 20, y + 40, w - 40, h - 40, '#69737f');
  // Antrieb
  box(x + w - 30, y + h - 54, 26, 30, '#4f5965');
}
function drawBallMill(R, id, accent) {
  const [x, y, w, h] = HIT[id];
  // Fundament
  box(x + 10, y + h - 34, w - 20, 34, '#4a5460');
  // Trommel
  const dy = y + h - 96, dh = 70;
  vcyl(x + 28, dy, w - 90, dh, '#808993', '#565f6b');
  // Endkappen
  ctx.fillStyle = '#737d8a';
  for (const cx of [x + 28, x + w - 62]) {
    ctx.beginPath();
    ctx.ellipse(cx, dy + dh / 2, 9, dh / 2, 0, 0, 7);
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  }
  // Rotationsbänder
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  for (let k = 0; k < 4; k++) {
    const bx = x + 40 + ((R.now / 26 + k * 34) % (w - 116));
    ctx.beginPath();
    ctx.moveTo(bx, dy + 4);
    ctx.lineTo(bx, dy + dh - 4);
    ctx.stroke();
  }
  // Motor
  box(x + w - 56, y + h - 60, 44, 30, '#444d58');
}
function drawSilo(R, id, c1, c2, matCol) {
  const [x, y, w, h] = HIT[id];
  const bodyTop = y + 34;
  // Dach (Kegel)
  ctx.fillStyle = c2;
  ctx.beginPath();
  ctx.moveTo(x, bodyTop);
  ctx.lineTo(x + w / 2, y);
  ctx.lineTo(x + w, bodyTop);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.4; ctx.stroke();
  // Körper
  vcyl(x, bodyTop, w, h - 34, c1, c2);
  // Füllstand
  const key = SILOKEY[id];
  if (key && R.state.silos[key]) {
    const f = clamp(R.state.silos[key].level / R.state.silos[key].cap, 0, 1);
    const fh = (h - 40) * f;
    ctx.fillStyle = matCol;
    ctx.globalAlpha = 0.85;
    ctx.fillRect(x + 4, bodyTop + (h - 40) - fh + 6, w - 8, fh);
    ctx.globalAlpha = 1;
  }
}
function drawPreheater(R) {
  const [x, y, w, h] = HIT.preheater;
  // Turm-Rahmen
  ctx.fillStyle = '#5d6772';
  ctx.fillRect(x + w - 60, y + 6, 56, h - 6);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6;
  ctx.strokeRect(x + w - 60, y + 6, 56, h - 6);
  // Etagen
  ctx.strokeStyle = '#454e58'; ctx.lineWidth = 3;
  for (let k = 1; k < 6; k++) {
    const fy = y + 6 + (h - 6) * k / 6;
    ctx.beginPath(); ctx.moveTo(x + w - 60, fy); ctx.lineTo(x + w - 4, fy); ctx.stroke();
  }
  // Zyklone (Anzahl = Vorwärmerstufen)
  const n = R.state.upgrades.preheaterStages;
  const top = y + 10, bot = y + h - 70;
  const ch = (bot - top) / n;
  for (let k = 0; k < n; k++) {
    const cy = top + k * ch;
    const cw = w - 86;
    const cx = x + 4;
    // Zylinder
    vcyl(cx, cy, cw, ch * 0.55, '#aeb7c2', '#7c8590');
    // Kegel
    ctx.fillStyle = '#9aa4b0';
    ctx.beginPath();
    ctx.moveTo(cx, cy + ch * 0.55);
    ctx.lineTo(cx + cw, cy + ch * 0.55);
    ctx.lineTo(cx + cw / 2, cy + ch - 4);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  }
  // Gasaustritt oben + Rauch
  box(x + 8, y - 4, 26, 16, '#4f5965');
  smoke(x + 21, y - 4, R.now, '#9fb0c2');
}
function drawCalciner(R) {
  const [x, y, w, h] = HIT.calciner;
  // Steigleitung / Vessel
  vcyl(x + 10, y, w - 20, h - 30, '#9aa4b0', '#6c7681');
  // Kegelkopf
  ctx.fillStyle = '#9aa4b0';
  ctx.beginPath();
  ctx.moveTo(x + 10, y); ctx.lineTo(x + w - 10, y);
  ctx.lineTo(x + w / 2, y - 22); ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  // Brennerstutzen
  ctx.fillStyle = '#ff7a2e';
  ctx.beginPath();
  ctx.arc(x + w - 6, y + h - 50, 7, 0, 7);
  ctx.fill();
}
function drawKiln(R) {
  const x0 = 1075, y0 = 392, x1 = 1372, y1 = 446;
  const ang = Math.atan2(y1 - y0, x1 - x0);
  const len = Math.hypot(x1 - x0, y1 - y0);
  // Glut
  const gl = ctx.createRadialGradient(x1, y1, 6, x1, y1, 150);
  const inten = 0.3 + 0.6 * R.state.controls.burningIntensity;
  gl.addColorStop(0, `rgba(255,150,50,${inten})`);
  gl.addColorStop(1, 'rgba(255,150,50,0)');
  ctx.fillStyle = gl;
  ctx.fillRect(x1 - 150, y1 - 150, 300, 220);

  ctx.save();
  ctx.translate(x0, y0);
  ctx.rotate(ang);
  const d = 56;
  // Mantel
  const g = ctx.createLinearGradient(0, -d / 2, 0, d / 2);
  g.addColorStop(0, '#8b6a4a'); g.addColorStop(0.5, '#c98a52'); g.addColorStop(1, '#7a5a3e');
  ctx.fillStyle = g;
  ctx.fillRect(0, -d / 2, len, d);
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6;
  ctx.strokeRect(0, -d / 2, len, d);
  // rotierende Bänder
  ctx.strokeStyle = 'rgba(60,40,25,.55)';
  ctx.lineWidth = 5;
  for (let k = 0; k < 7; k++) {
    const bx = ((R.now / 16 + k * 50) % (len - 10)) + 5;
    ctx.beginPath();
    ctx.moveTo(bx, -d / 2 + 3);
    ctx.lineTo(bx, d / 2 - 3);
    ctx.stroke();
  }
  // Laufringe
  ctx.fillStyle = '#3f4954';
  for (const rx of [len * 0.26, len * 0.72]) {
    ctx.fillRect(rx - 7, -d / 2 - 5, 14, d + 10);
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2;
    ctx.strokeRect(rx - 7, -d / 2 - 5, 14, d + 10);
    // Stützrollen
    ctx.fillStyle = '#566270';
    ctx.beginPath(); ctx.arc(rx - 14, d / 2 + 12, 10, 0, 7); ctx.fill();
    ctx.beginPath(); ctx.arc(rx + 14, d / 2 + 12, 10, 0, 7); ctx.fill();
    ctx.fillStyle = '#3f4954';
  }
  // Antriebszahnrad
  ctx.fillStyle = '#48525e';
  ctx.fillRect(len * 0.49 - 9, -d / 2 - 8, 18, d + 16);
  ctx.restore();

  // Ofenkopf / Haube mit Flamme
  ctx.fillStyle = '#5a6470';
  box(x1 - 6, y1 - 44, 40, 78, '#5a6470');
  for (let k = 0; k < 4; k++) {
    const t = (R.now / 220 + k) % 1;
    ctx.fillStyle = `rgba(255,${150 - t * 80},40,${0.8 - t * 0.7})`;
    ctx.beginPath();
    ctx.arc(x1 - 24 - t * 26, y1 - 6, 13 - t * 8, 0, 7);
    ctx.fill();
  }
}
function drawCooler(R) {
  const [x, y, w, h] = HIT.cooler;
  // Gehäuse (Trapez)
  ctx.fillStyle = '#6b7682';
  ctx.beginPath();
  ctx.moveTo(x, y + 26);
  ctx.lineTo(x + w, y + 14);
  ctx.lineTo(x + w - 16, y + h);
  ctx.lineTo(x + 16, y + h);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6; ctx.stroke();
  // Rostlinien
  ctx.strokeStyle = '#49525d'; ctx.lineWidth = 3;
  for (let k = 1; k < 4; k++) {
    ctx.beginPath();
    ctx.moveTo(x + 16, y + 26 + k * 22);
    ctx.lineTo(x + w - 16, y + 14 + k * 22);
    ctx.stroke();
  }
  // Abluftkamin
  box(x + w / 2 - 11, y - 26, 22, 34, '#525c68');
  smoke(x + w / 2, y - 26, R.now + 800, '#aab6c4');
}
function drawDome(R) {
  const [x, y, w, h] = HIT.clinkersilo;
  const baseY = y + h - 44;
  // Kuppel
  ctx.fillStyle = '#8c97a4';
  ctx.beginPath();
  ctx.moveTo(x + 6, baseY);
  ctx.quadraticCurveTo(x + w / 2, y - 14, x + w - 6, baseY);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.6; ctx.stroke();
  // Segmentrippen
  ctx.strokeStyle = '#5f6975'; ctx.lineWidth = 2.2;
  for (const fx of [0.3, 0.5, 0.7]) {
    ctx.beginPath();
    ctx.moveTo(x + 6 + (w - 12) * fx, baseY);
    ctx.quadraticCurveTo(x + w / 2, y + 6, x + w / 2, y + 6);
    ctx.stroke();
  }
  // Sockel
  box(x + 6, baseY, w - 12, 44, '#5e6874');
}
function drawCementSilos(R) {
  const [x, y, w, h] = HIT.cementsilo;
  const sw = (w - 8) / 3;
  for (let k = 0; k < 3; k++) {
    const sx = x + 4 + k * sw;
    ctx.fillStyle = '#b9c1cb';
    ctx.beginPath();
    ctx.moveTo(sx + 2, y + 26);
    ctx.lineTo(sx + sw / 2, y + 4);
    ctx.lineTo(sx + sw - 4, y + 26);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
    vcyl(sx + 2, y + 26, sw - 6, h - 30, '#cdd4dc', '#9aa3ad');
  }
}
function drawDispatch(R) {
  const [x, y, w, h] = HIT.dispatch;
  // Verladesilo
  vcyl(x + 18, y, w - 36, h - 80, '#aab3bd', '#7d8791');
  ctx.fillStyle = '#9aa3ad';
  ctx.beginPath();
  ctx.moveTo(x + 18, y + h - 80);
  ctx.lineTo(x + w - 18, y + h - 80);
  ctx.lineTo(x + w / 2, y + h - 48);
  ctx.closePath();
  ctx.fill();
  ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2.2; ctx.stroke();
  // LKW
  const tx = x + 6, ty = y + h - 40;
  box(tx, ty - 22, 54, 24, '#3f6fae');
  box(tx + 54, ty - 30, 22, 32, '#d8dde3');
  ctx.fillStyle = '#1d2733';
  for (const wx of [tx + 14, tx + 44, tx + 66]) {
    ctx.beginPath(); ctx.arc(wx, ty + 4, 9, 0, 7); ctx.fill();
  }
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
  const cx = x + w / 2;
  const ly = y + h + 6;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#dfe8f2';
  ctx.font = '600 16px Segoe UI, sans-serif';
  ctx.fillText(NAMES[id], cx, ly + 13, w + 80);
  const sl = sublabel(id, state, m);
  if (sl) {
    ctx.fillStyle = '#9fb0c2';
    ctx.font = '14px Segoe UI, sans-serif';
    ctx.fillText(sl, cx, ly + 31);
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
    ctx.moveTo(wx, wy - 14);
    ctx.lineTo(wx + 14, wy + 10);
    ctx.lineTo(wx - 14, wy + 10);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = OUTLINE; ctx.lineWidth = 2; ctx.stroke();
    ctx.fillStyle = '#1d2733';
    ctx.textAlign = 'center';
    ctx.font = '700 16px Segoe UI, sans-serif';
    ctx.fillText('!', wx, wy + 8);
  }
}

// ---------- Hauptfunktion ----------
export function drawFlowsheet(state, now, selectedId) {
  if (!ctx) return;
  clampPan();
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Himmel (Bildschirmraum)
  const sky = ctx.createLinearGradient(0, 0, 0, cssH);
  sky.addColorStop(0, '#1b2738');
  sky.addColorStop(0.6, '#2c3c52');
  sky.addColorStop(1, '#3a4a60');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, cssW, cssH);

  ctx.save();
  ctx.translate(originX + panX, 0);
  ctx.scale(scale, scale);

  const m = state.metrics;
  const R = { state, m, now };

  // Ferne Hügel
  ctx.fillStyle = '#2f3e54';
  ctx.beginPath();
  ctx.moveTo(0, GROUND);
  for (let i = 0; i <= SCENE_W; i += 220) {
    ctx.lineTo(i, GROUND - 70 - 40 * Math.sin(i * 0.7));
  }
  ctx.lineTo(SCENE_W, GROUND);
  ctx.closePath();
  ctx.fill();

  // Boden
  ctx.fillStyle = '#322d26';
  ctx.fillRect(0, GROUND, SCENE_W, SCENE_H - GROUND);
  ctx.fillStyle = '#3c372e';
  ctx.fillRect(0, GROUND, SCENE_W, 8);

  // Förderbänder / Stoffströme
  const raw = m ? m.rawMealOut : 0;
  const clk = m ? m.clinkerOut : 0;
  const cem = m ? m.cementOut : 0;
  belt(280, 250, 322, 320, raw, '#c7b48f', now);
  belt(430, 372, 470, 360, raw, '#c7b48f', now);
  belt(690, 330, 760, 210, raw, '#c7b48f', now);
  belt(820, 196, 980, 120, raw, '#c7b48f', now);
  belt(1505, 392, 1576, 360, clk, '#ff9528', now);
  belt(1705, 392, 1782, 358, clk, '#d7d0c4', now);
  belt(1965, 332, 2055, 206, cem, '#e2e7ee', now);
  belt(2120, 300, 2176, 332, cem, '#e2e7ee', now);

  // Aggregate
  drawQuarry(R);
  drawCrusher(R);
  drawBallMill(R, 'rawmill', '#c7b48f');
  drawSilo(R, 'blending', '#c2cad3', '#9099a3', '#c7b48f');
  drawPreheater(R);
  drawCalciner(R);
  drawKiln(R);
  drawCooler(R);
  drawDome(R);
  drawBallMill(R, 'cementmill', '#aeb7c2');
  drawCementSilos(R);
  drawDispatch(R);

  // Beschriftung & Status
  for (const id in HIT) drawLabel(id, state, m);
  for (const id in HIT) drawStatus(id, state, m, selectedId);

  ctx.restore();

  // Schwenk-Hinweis
  if (SCENE_W * scale > cssW + 4) {
    ctx.fillStyle = 'rgba(223,232,242,.5)';
    ctx.font = '12px Segoe UI, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('◀ ziehen zum Schwenken ▶', cssW / 2, cssH - 8);
  }
}
