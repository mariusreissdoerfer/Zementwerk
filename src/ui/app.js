// Verdrahtung: Spiel-Loop, Footer-Steuerung, Modals, Canvas-Eingabe.

import { simulate, qualityModel } from '../sim/simulation.js?v=4';
import { initFlowsheet, drawFlowsheet } from './flowsheet.js?v=4';
import { initPanels, openPanel, closePanel, currentPanelUnit, refreshPanel } from './panels.js?v=4';
import { initHud, updateHud, toast, openModal } from './hud.js?v=4';
import { MISSIONS } from '../game/scenarios.js?v=4';
import { UPGRADES, buyUpgrade } from '../game/upgrades.js?v=4';
import { saveState, clearSave } from '../game/state.js?v=4';
import { fmtMoney, fmt0 } from '../util.js?v=4';

const TICK_MS = 850;
let state, last = 0, acc = 0, tickCount = 0, saveTimer = null;

export function startApp(s) {
  state = s;
  initHud();
  initFlowsheet(document.getElementById('flowsheet'),
    id => id ? openPanel(id) : closePanel());
  initPanels(state, { onChange: scheduleSave, toast });
  buildFooter();
  if (!state.metrics) simulate(state);
  last = performance.now();
  requestAnimationFrame(frame);
  if (!state.tutorialDone) { state.tutorialDone = true; showInfo(); }
}

// ---------- Loop ----------
function frame(now) {
  const dt = Math.min(260, now - last);
  last = now;
  if (state.speed > 0) {
    acc += dt * state.speed;
    let guard = 0;
    while (acc >= TICK_MS && guard < 6) { doTick(); acc -= TICK_MS; guard++; }
  } else {
    acc = 0;
  }
  drawFlowsheet(state, now, currentPanelUnit());
  updateHud(state, displayMetrics());
  requestAnimationFrame(frame);
}

function doTick() {
  const notes = simulate(state);
  tickCount++;
  if (notes.length) {
    const n = notes[notes.length - 1];
    toast(n.msg, n.type);
  }
  refreshPanel();
  if (tickCount % 6 === 0) saveState(state);
}

// Anzeigemetriken: letzte Tick-Werte + Live-Qualitätsvorschau aus den Reglern.
function displayMetrics() {
  if (!state.metrics) return null;
  return { ...state.metrics, ...qualityModel(state) };
}

function scheduleSave() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => saveState(state), 1200);
}

// ---------- Footer ----------
function buildFooter() {
  const speed = document.getElementById('speed');
  speed.innerHTML = '';
  for (const [v, lab] of [[0, '❚❚'], [1, '▶'], [2, '▶▶'], [4, '▶▶▶']]) {
    const b = document.createElement('button');
    b.textContent = lab;
    b.dataset.speed = v;
    b.onclick = () => setSpeed(v);
    speed.append(b);
  }
  const menu = document.getElementById('menu');
  menu.innerHTML = '';
  for (const [lab, fn] of [['Missionen', showMissions], ['Ausbau', showUpgrades],
    ['Markt', showMarket], ['Info', showInfo]]) {
    const b = document.createElement('button');
    b.textContent = lab;
    b.onclick = fn;
    menu.append(b);
  }
  refreshSpeed();
}

function setSpeed(v) {
  state.speed = v;
  refreshSpeed();
  saveState(state);
}
function refreshSpeed() {
  for (const b of document.getElementById('speed').children) {
    b.classList.toggle('active', +b.dataset.speed === state.speed);
  }
}

// ---------- Modal-Helfer ----------
function elp(t) { const p = document.createElement('p'); p.className = 'hint'; p.textContent = t; return p; }
function elh(t) { const h = document.createElement('h3'); h.textContent = t; return h; }
function readoutRow(pairs) {
  const r = document.createElement('div');
  r.className = 'readout';
  for (const [label, val] of pairs) {
    const d = document.createElement('div');
    const s = document.createElement('span');
    s.textContent = val;
    d.append(label + ' ', s);
    r.append(d);
  }
  return r;
}

// ---------- Modals ----------
function showMissions() {
  const body = document.createElement('div');
  const done = state.missions.completed.length;
  body.append(elp(`${done} von ${MISSIONS.length} Missionen erfüllt. Belohnungen werden sofort gutgeschrieben.`));
  for (const m of MISSIONS) {
    const ok = state.missions.completed.includes(m.id);
    const card = document.createElement('div');
    card.className = 'card';
    const row = document.createElement('div');
    row.className = 'row';
    row.append(Object.assign(document.createElement('h4'), { textContent: m.title }));
    const tag = document.createElement('span');
    tag.className = 'tag ' + (ok ? 'ok' : 'warn');
    tag.textContent = ok ? '✓ erfüllt' : 'offen';
    row.append(tag);
    const p = document.createElement('p');
    p.textContent = m.desc + '  ·  Belohnung: ' + fmtMoney(m.reward);
    card.append(row, p);
    body.append(card);
  }
  openModal('Missionen & Challenges', body);
}

function showUpgrades() {
  const body = document.createElement('div');
  body.append(elp('Einmalige Investitionen verbessern Effizienz, Kapazität und Umweltbilanz dauerhaft.'));
  for (const up of UPGRADES) {
    const card = document.createElement('div');
    card.className = 'card';
    const row = document.createElement('div');
    row.className = 'row';
    row.append(Object.assign(document.createElement('h4'), { textContent: up.name }));
    card.append(row);
    card.append(Object.assign(document.createElement('p'), { textContent: up.desc }));
    if (up.done(state)) {
      const t = document.createElement('span');
      t.className = 'tag ok';
      t.textContent = '✓ umgesetzt';
      row.append(t);
    } else if (up.available(state)) {
      const btn = document.createElement('button');
      btn.className = 'btn';
      btn.textContent = 'Bauen — ' + fmtMoney(up.cost);
      btn.disabled = state.money < up.cost;
      btn.onclick = () => {
        const r = buyUpgrade(state, up.id);
        toast(r.msg, r.ok ? 'good' : 'bad');
        if (r.ok) { saveState(state); showUpgrades(); }
      };
      card.append(btn);
    } else {
      const t = document.createElement('span');
      t.className = 'tag warn';
      t.textContent = 'gesperrt';
      row.append(t);
      card.append(Object.assign(document.createElement('p'),
        { textContent: 'Voraussetzung noch nicht erfüllt.' }));
    }
    body.append(card);
  }
  openModal('Werk ausbauen', body);
}

function showMarket() {
  const m = state.metrics;
  const body = document.createElement('div');
  body.append(elp('Marktlage und laufende Stundenbilanz des Werks.'));
  body.append(readoutRow([
    ['Zementpreis', m ? fmt0(m.unitPrice) + ' €/t' : '—'],
    ['Nachfrage', fmt0(state.market.demand) + ' t/h'],
    ['Preisindex', Math.round(state.market.priceFactor * 100) + ' %'],
    ['CO₂-Zertifikat', fmt0(state.market.certPrice) + ' €/t'],
    ['Gewinn/Tag', fmtMoney(state.finance.lastProfit)],
    ['Kontostand', fmtMoney(state.money)],
  ]));
  if (m) {
    body.append(elh('Kosten je Stunde'));
    body.append(readoutRow([
      ['Rohstoffe', fmtMoney(m.costs.raw)],
      ['Brennstoff', fmtMoney(m.costs.fuel)],
      ['Strom', fmtMoney(m.costs.elec)],
      ['CO₂', fmtMoney(m.costs.co2)],
      ['Zumahlstoffe', fmtMoney(m.costs.add)],
      ['Personal', fmtMoney(m.costs.pers)],
      ['Wartung', fmtMoney(m.costs.maint)],
      ['Erlös', fmtMoney(m.revenue)],
    ]));
  }
  openModal('Markt & Finanzen', body);
}

function showInfo() {
  const body = document.createElement('div');
  body.innerHTML = `
    <p class="hint">Du leitest ein komplettes Zementwerk. Tippe ein Aggregat im
    Fließbild an, um es zu steuern.</p>
    <h3>Prozesskette</h3>
    <p class="hint">Steinbruch → Brecher → Rohmühle → Mischbett → Vorwärmer →
    Calcinator → Drehrohrofen → Kühler → Klinkersilo → Zementmühle → Zementsilo →
    Versand.</p>
    <h3>Worauf es ankommt</h3>
    <p class="hint">• <b>Rohmühle:</b> Die Rezeptur bestimmt den Kalkstandard (LSF).
    Ziel 92–98 — sonst entsteht Freikalk und der Zement wird schwach.<br>
    • <b>Drehrohrofen:</b> Produktionsrate, Brennintensität und Brennstoffmix
    steuern Energiebedarf und CO₂. Ersatzbrennstoff (RDF) ist günstig und CO₂-arm.<br>
    • <b>Zementmühle:</b> Klinkeranteil und Mahlfeinheit bestimmen Sorte (CEM I/II/III)
    und Festigkeitsklasse. Weniger Klinker = weniger CO₂, aber geringere Festigkeit.<br>
    • <b>Silos</b> puffern die Stoffströme — Mahl- und Brennraten aufeinander abstimmen.</p>
    <h3>Wirtschaft</h3>
    <p class="hint">Verkaufe Zement gewinnbringend. Kosten entstehen durch Rohstoffe,
    Brennstoff, Strom, CO₂-Zertifikate, Personal und Wartung. Verschleiß senkt die
    Leistung und löst Störungen aus — rechtzeitig instand setzen!</p>
    <h3>Ziel</h3>
    <p class="hint">Erfülle Missionen, baue das Werk aus und maximiere den Gewinn.</p>
  `;
  const btn = document.createElement('button');
  btn.className = 'btn sec';
  btn.textContent = 'Neues Spiel starten (Spielstand löschen)';
  btn.onclick = () => {
    if (confirm('Aktuellen Spielstand wirklich löschen und neu starten?')) {
      clearSave();
      location.reload();
    }
  };
  body.append(btn);
  openModal('Zementwerk-Simulator — Anleitung', body);
}
