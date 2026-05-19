// Animiertes Prozess-Fließbild auf einem Canvas.

import { fmt0 } from '../util.js';

// [id, Spalte, Zeile] — die Reihenfolge ist zugleich die Flusskette (Schlangenlinie).
const LAYOUT = [
  ['quarry', 0, 0], ['crusher', 1, 0], ['rawmill', 2, 0], ['blending', 3, 0],
  ['preheater', 3, 1], ['calciner', 2, 1], ['kiln', 1, 1], ['cooler', 0, 1],
  ['clinkersilo', 0, 2], ['cementmill', 1, 2], ['cementsilo', 2, 2], ['dispatch', 3, 2],
];
const COLS = 4, ROWS = 3;

const NAMES = {
  quarry: 'Steinbruch', crusher: 'Brecher', rawmill: 'Rohmühle', blending: 'Mischbett',
  preheater: 'Vorwärmer', calciner: 'Calcinator', kiln: 'Drehrohrofen', cooler: 'Klinkerkühler',
  clinkersilo: 'Klinkersilo', cementmill: 'Zementmühle', cementsilo: 'Zementsilo', dispatch: 'Versand',
};
const SILOS = { blending: 'rawMeal', clinkersilo: 'clinker', cementsilo: 'cement' };

let canvas, ctx, dpr = 1, W = 0, H = 0;
let boxes = {};

export function initFlowsheet(cv) {
  canvas = cv;
  ctx = cv.getContext('2d');
  resize();
  window.addEventListener('resize', resize);
}

function resize() {
  dpr = window.devicePixelRatio || 1;
  const r = canvas.getBoundingClientRect();
  W = Math.max(320, r.width);
  H = Math.max(240, r.height);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
}

export function hitTest(clientX, clientY) {
  const r = canvas.getBoundingClientRect();
  const x = clientX - r.left, y = clientY - r.top;
  for (const id in boxes) {
    const b = boxes[id];
    if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return id;
  }
  return null;
}

function roundRect(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function flowFor(fromId, m) {
  if (!m) return 0;
  if (['quarry', 'crusher', 'rawmill'].includes(fromId)) return m.rawMealOut;
  if (['blending', 'preheater', 'calciner', 'kiln', 'cooler'].includes(fromId)) return m.clinkerOut;
  return m.cementOut;
}
function flowColor(fromId) {
  if (['quarry', 'crusher', 'rawmill'].includes(fromId)) return '#b9a98c';
  if (['blending', 'preheater', 'calciner', 'kiln', 'cooler'].includes(fromId)) return '#ff9528';
  return '#d7e2ee';
}

function sublabel(id, state, m) {
  if (SILOS[id]) {
    const s = state.silos[SILOS[id]];
    return Math.round(s.level / s.cap * 100) + '% voll';
  }
  if (!m) return '—';
  switch (id) {
    case 'quarry': case 'crusher': case 'rawmill': return fmt0(m.rawMealOut) + ' t/h';
    case 'preheater': return state.upgrades.preheaterStages + ' Stufen';
    case 'calciner': return 'Entsäuerung';
    case 'kiln': return fmt0(m.clinkerOut) + ' t/h · ' + m.kilnTemp + '°C';
    case 'cooler': return fmt0(m.clinkerOut) + ' t/h';
    case 'cementmill': return fmt0(m.cementOut) + ' t/h';
    case 'dispatch': return fmt0(m.sold) + ' t/h';
  }
  return '';
}

export function drawFlowsheet(state, now, selectedId) {
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, W, H);

  const m = state.metrics;
  const margin = 6;
  const cellW = (W - 2 * margin) / COLS;
  const cellH = (H - 2 * margin) / ROWS;
  const pad = Math.min(cellW, cellH) * 0.06 + 3;

  boxes = {};
  for (const [id, col, row] of LAYOUT) {
    const x = margin + col * cellW + pad;
    const y = margin + row * cellH + pad;
    const w = cellW - 2 * pad;
    const h = cellH - 2 * pad;
    boxes[id] = { x, y, w, h, cx: x + w / 2, cy: y + h / 2 };
  }

  // --- Verbindungen + Partikelfluss ---
  for (let i = 0; i < LAYOUT.length - 1; i++) {
    const a = boxes[LAYOUT[i][0]], b = boxes[LAYOUT[i + 1][0]];
    let p0, p1;
    if (Math.abs(a.cy - b.cy) < 1) {
      if (b.cx > a.cx) { p0 = [a.x + a.w, a.cy]; p1 = [b.x, b.cy]; }
      else { p0 = [a.x, a.cy]; p1 = [b.x + b.w, b.cy]; }
    } else {
      p0 = [a.cx, a.y + a.h]; p1 = [b.cx, b.y];
    }
    ctx.strokeStyle = '#33475e';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(p0[0], p0[1]);
    ctx.lineTo(p1[0], p1[1]);
    ctx.stroke();

    const flow = flowFor(LAYOUT[i][0], m);
    const n = Math.min(8, Math.round(flow / 14));
    if (n > 0) {
      ctx.fillStyle = flowColor(LAYOUT[i][0]);
      const speed = 0.5 + flow / 220;
      for (let k = 0; k < n; k++) {
        const t = ((now / 1500) * speed + k / n) % 1;
        const x = p0[0] + (p1[0] - p0[0]) * t;
        const y = p0[1] + (p1[1] - p0[1]) * t;
        ctx.beginPath();
        ctx.arc(x, y, 3.4, 0, 7);
        ctx.fill();
      }
    }
  }

  // --- Aggregate ---
  const nameFs = Math.max(9, Math.min(14, cellW / 9));
  const subFs = Math.max(8, Math.min(12, cellW / 11));

  for (const [id] of LAYOUT) {
    const b = boxes[id];
    const u = state.units[id];
    const avail = m ? (m.avail[id] ?? 1) : 1;

    // Ofen-Glühen
    if (id === 'kiln' && m) {
      const glow = 0.25 + 0.55 * state.controls.burningIntensity;
      const g = ctx.createRadialGradient(b.cx, b.cy, 4, b.cx, b.cy, b.w * 0.95);
      g.addColorStop(0, `rgba(255,140,40,${glow})`);
      g.addColorStop(1, 'rgba(255,140,40,0)');
      ctx.fillStyle = g;
      ctx.fillRect(b.x - b.w * 0.4, b.y - b.h * 0.4, b.w * 1.8, b.h * 1.8);
    }

    roundRect(b.x, b.y, b.w, b.h, 9);
    ctx.fillStyle = id === 'kiln' ? '#2a2118' : '#1d2a39';
    ctx.fill();

    let border = '#33475e', lw = 1.6;
    if (avail < 1) border = '#ff5a52';
    else if (u && u.condition < 20) border = '#ff5a52';
    else if (u && u.condition < 50) border = '#ffb13b';
    if (id === selectedId) { border = '#ffd24a'; lw = 3; }
    ctx.strokeStyle = border;
    ctx.lineWidth = lw;
    ctx.stroke();

    // Texte
    ctx.textAlign = 'center';
    ctx.fillStyle = '#dfe8f2';
    ctx.font = `600 ${nameFs}px Segoe UI, sans-serif`;
    ctx.fillText(NAMES[id], b.cx, b.y + b.h * 0.40, b.w - 8);

    ctx.fillStyle = '#8da0b8';
    ctx.font = `${subFs}px Segoe UI, sans-serif`;
    ctx.fillText(sublabel(id, state, m), b.cx, b.y + b.h * 0.62, b.w - 8);

    // Status-/Füllbalken unten
    const barY = b.y + b.h - 9;
    const barW = b.w - 16;
    const barX = b.x + 8;
    ctx.fillStyle = '#0e131a';
    roundRect(barX, barY, barW, 5, 2.5); ctx.fill();
    if (SILOS[id]) {
      const s = state.silos[SILOS[id]];
      const f = s.level / s.cap;
      ctx.fillStyle = f > 0.92 ? '#ff5a52' : '#4ab6ff';
      roundRect(barX, barY, barW * f, 5, 2.5); ctx.fill();
    } else if (u) {
      const f = u.condition / 100;
      ctx.fillStyle = f > 0.5 ? '#43d17a' : f > 0.2 ? '#ffb13b' : '#ff5a52';
      roundRect(barX, barY, barW * f, 5, 2.5); ctx.fill();
    }

    // Störungs-Hinweis
    if (avail < 1) {
      ctx.fillStyle = '#ff5a52';
      ctx.font = `700 ${subFs}px Segoe UI, sans-serif`;
      ctx.fillText('STÖRUNG', b.cx, b.y + b.h * 0.20);
    }
  }
}
