// Aggregat-Detailpanel mit Schiebereglern und Live-Anzeigen.

import { qualityModel, CAP } from '../sim/simulation.js?v=10';
import { repairCost } from '../game/upgrades.js?v=10';
import { FUELS } from '../data/fuels.js?v=10';
import { ADDITIVES } from '../data/materials.js?v=10';
import { fmt0, fmt1, fmt2, fmtMoney, fmtInt } from '../util.js?v=10';

const NAMES = {
  quarry: 'Steinbruch', crusher: 'Brecher', rawmill: 'Rohmühle', blending: 'Mischbett / Rohmehl-Silo',
  preheater: 'Zyklon-Vorwärmer', calciner: 'Calcinator', kiln: 'Drehrohrofen', cooler: 'Klinkerkühler',
  clinkersilo: 'Klinkersilo', cementmill: 'Zementmühle', cementsilo: 'Zementsilo', dispatch: 'Versand & Markt',
};
const DESCR = {
  quarry: 'Gewinnung von Kalkstein, Ton und Korrekturstoffen',
  crusher: 'Zerkleinerung des Rohgesteins',
  rawmill: 'Mahlen & Trocknen zu Rohmehl — Rezeptur bestimmt die Klinkerqualität',
  blending: 'Homogenisierung & Pufferung des Rohmehls',
  preheater: 'Vorwärmung des Rohmehls mit Ofenabgas',
  calciner: 'Entsäuerung: CaCO₃ → CaO + CO₂',
  kiln: 'Sinterung bei ~1450 °C — Bildung der Klinkerphasen',
  cooler: 'Klinkerkühlung & Wärmerückgewinnung',
  clinkersilo: 'Pufferlager für gebrannten Klinker',
  cementmill: 'Mahlen von Klinker + Gips + Zumahlstoffen',
  cementsilo: 'Lager für versandfertigen Zement',
  dispatch: 'Verkauf — Marktpreis und Nachfrage',
};
const REPAIRABLE = ['crusher', 'rawmill', 'preheater', 'calciner', 'kiln', 'cooler', 'cementmill'];

let ST, HOOKS, panelEl, currentUnit = null, readouts = [];

export function initPanels(state, hooks) {
  ST = state;
  HOOKS = hooks;
  panelEl = document.getElementById('panel');
}
export function currentPanelUnit() { return currentUnit; }
export function refreshPanel() { readouts.forEach(r => r.refresh()); }
export function closePanel() {
  currentUnit = null;
  readouts = [];
  panelEl.classList.add('hidden');
  panelEl.innerHTML = '';
}
export function openPanel(id) { currentUnit = id; render(); }

// ---------- DOM-Helfer ----------
function E(tag, cls, txt) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (txt != null) e.textContent = txt;
  return e;
}

function changed() {
  readouts.forEach(r => r.refresh());
  HOOKS.onChange();
}

function slider({ label, min, max, step, value, fmt, on }) {
  const wrap = E('div', 'ctrl');
  const lab = E('label');
  const span = E('span', null, label);
  const b = E('b', null, fmt(value));
  lab.append(span, b);
  const inp = document.createElement('input');
  inp.type = 'range';
  inp.min = min; inp.max = max; inp.step = step; inp.value = value;
  inp.addEventListener('input', () => {
    const v = parseFloat(inp.value);
    b.textContent = fmt(v);
    on(v);
    changed();
  });
  wrap.append(lab, inp);
  return wrap;
}

function segmented(options, current, on) {
  const seg = E('div', 'seg');
  for (const o of options) {
    const btn = E('button', current === o.value ? 'active' : '', o.label);
    btn.onclick = () => { on(o.value); render(); };
    seg.append(btn);
  }
  return seg;
}

function makeReadout(specs) {
  const box = E('div', 'readout');
  const items = specs.map(sp => {
    const d = E('div');
    const s = E('span');
    const sm = document.createElement('small');
    d.append(sp.label + ' ', s, sm);
    box.append(d);
    return { sp, s, sm };
  });
  const r = {
    refresh() {
      const q = qualityModel(ST), m = ST.metrics;
      for (const it of items) {
        const res = it.sp.fn(q, m, ST);
        it.s.textContent = res.value;
        it.sm.textContent = res.sub || '';
        it.s.style.color = { ok: '#43d17a', warn: '#ffb13b', bad: '#ff5a52' }[res.cls] || '#dfe8f2';
      }
    },
  };
  r.refresh();
  readouts.push(r);
  return box;
}

function title(t) { return E('div', 'hint', t); }

// Mahlaggregat-Auswahl (gilt für Roh- und Zementmühle).
function millSelector(c) {
  panelEl.append(E('div', 'hint', 'Mahlaggregat — bestimmt den Mahlstrombedarf:'));
  panelEl.append(segmented([
    { value: 'ballmill', label: 'Kugelmühle' },
    { value: 'verticalmill', label: 'Vertikalmühle' },
    { value: 'rollerpress', label: 'Rollenpresse' },
  ], c.millType, v => c.millType = v));
}

// ---------- Render ----------
function render() {
  const id = currentUnit;
  readouts = [];
  panelEl.innerHTML = '';
  panelEl.classList.remove('hidden');

  const head = E('div', 'panel-head');
  const left = E('div');
  left.append(E('h2', null, NAMES[id]), E('div', 'sub', DESCR[id] || ''));
  const close = E('button', 'close-btn', '×');
  close.onclick = closePanel;
  head.append(left, close);
  panelEl.append(head);

  buildBody(id);
  buildDisturbance(id);
  buildRepair(id);
}

function buildBody(id) {
  const c = ST.controls;
  switch (id) {

    case 'rawmill': {
      panelEl.append(slider({
        label: 'Durchsatz Rohmühle', min: 60, max: CAP.rawmill, step: 1,
        value: c.rawMillRate, fmt: v => fmt0(v) + ' t/h',
        on: v => c.rawMillRate = v,
      }));
      panelEl.append(slider({
        label: 'Rohmehl-Feinheit', min: 0, max: 1, step: 0.01,
        value: c.rawMealFineness, fmt: v => Math.round(22 - v * 16) + ' % Rückstand',
        on: v => c.rawMealFineness = v,
      }));
      millSelector(c);
      panelEl.append(E('div', 'hint', 'Rohmehl-Rezeptur (Anteile) — bestimmt Kalkstandard & Module:'));
      for (const [mid, name] of [['limestone', 'Kalkstein'], ['clay', 'Ton/Mergel'], ['sand', 'Sand'], ['ironOre', 'Eisenerz']]) {
        panelEl.append(slider({
          label: name, min: 0, max: 100, step: 1,
          value: c.recipe[mid] * 100, fmt: v => fmt0(v) + ' T.',
          on: v => c.recipe[mid] = v / 100,
        }));
      }
      panelEl.append(makeReadout([
        { label: 'LSF', fn: q => ({ value: fmt0(q.lsf), sub: 'Ziel 92–98', cls: q.lsf >= 92 && q.lsf <= 98 ? 'ok' : 'bad' }) },
        { label: 'Silikatmodul', fn: q => ({ value: fmt2(q.sm), sub: 'Ziel 2,2–2,6', cls: q.sm >= 2.2 && q.sm <= 2.6 ? 'ok' : 'warn' }) },
        { label: 'Tonerdemodul', fn: q => ({ value: fmt2(q.am), sub: 'Ziel 1,3–2,5', cls: q.am >= 1.3 && q.am <= 2.5 ? 'ok' : 'warn' }) },
        { label: 'Rohmehl je t Klinker', fn: q => ({ value: fmt2(q.rmPerClinker) + ' t', sub: 'aus Glühverlust' }) },
        { label: 'Durchsatz', fn: (q, m) => ({ value: m ? fmt0(m.rawMealOut) + ' t/h' : '—', sub: 'aktuell' }) },
        { label: 'Rohmehl-Silo', fn: () => ({ value: Math.round(ST.silos.rawMeal.level / ST.silos.rawMeal.cap * 100) + ' %', sub: fmtInt(ST.silos.rawMeal.level) + ' t' }) },
      ]));
      panelEl.append(title('Tipp: Mehr Kalkstein hebt den LSF. Zu hoher LSF (>100) erzeugt Freikalk und schwächt den Zement.'));
      break;
    }

    case 'kiln': {
      panelEl.append(slider({
        label: 'Produktionsrate', min: 40, max: 170, step: 1,
        value: c.productionRate, fmt: v => fmt0(v) + ' t Klinker/h',
        on: v => c.productionRate = v,
      }));
      panelEl.append(slider({
        label: 'Brennintensität', min: 0, max: 1, step: 0.01,
        value: c.burningIntensity, fmt: v => Math.round(v * 100) + ' %',
        on: v => c.burningIntensity = v,
      }));
      const rdfMax = ST.upgrades.altFuelSystem ? 60 : 15;
      panelEl.append(E('div', 'hint', 'Brennstoffmix (Anteile):'));
      for (const [fid, max] of [['coal', 100], ['petcoke', 100], ['rdf', rdfMax]]) {
        panelEl.append(slider({
          label: FUELS[fid].name, min: 0, max, step: 1,
          value: Math.min(c.fuelMix[fid] * 100, max), fmt: v => fmt0(v) + ' T.',
          on: v => c.fuelMix[fid] = v / 100,
        }));
      }
      if (!ST.upgrades.altFuelSystem) {
        panelEl.append(title('RDF ist ohne Ersatzbrennstoff-Dosieranlage auf 15 % begrenzt (siehe Ausbau).'));
      }
      panelEl.append(makeReadout([
        { label: 'Sintertemperatur', fn: q => ({ value: q.kilnTemp + ' °C', cls: q.kilnTemp >= 1430 && q.kilnTemp <= 1500 ? 'ok' : 'warn' }) },
        { label: 'Spez. Wärmebedarf', fn: q => ({ value: fmt0(q.specHeat) + ' kJ/kg', sub: 'gut < 3300', cls: q.specHeat < 3300 ? 'ok' : q.specHeat < 3600 ? 'warn' : 'bad' }) },
        { label: 'Freikalk', fn: q => ({ value: fmt1(q.freeLime) + ' %', sub: 'gut < 2 %', cls: q.freeLime < 2 ? 'ok' : q.freeLime < 3.5 ? 'warn' : 'bad' }) },
        { label: 'Brennstoff', fn: (q, m) => ({ value: m ? fmt1(m.fuelMass) + ' t/h' : '—' }) },
        { label: 'CO₂-Intensität', fn: q => ({ value: fmt0(q.co2PerClinker) + ' kg/t Kl.', cls: q.co2PerClinker < 820 ? 'ok' : 'warn' }) },
        { label: 'RDF-Quote (therm.)', fn: q => ({ value: fmt0(q.thermalRDF) + ' %', cls: q.thermalRDF > 20 ? 'ok' : '' }) },
      ]));
      break;
    }

    case 'cementmill': {
      panelEl.append(slider({
        label: 'Durchsatz Zementmühle', min: 50, max: CAP.cementmill, step: 1,
        value: c.cementMillRate, fmt: v => fmt0(v) + ' t/h',
        on: v => c.cementMillRate = v,
      }));
      panelEl.append(slider({
        label: 'Mahlfeinheit (Blaine)', min: 0, max: 1, step: 0.01,
        value: c.cementFineness, fmt: v => fmt0(2800 + v * 2200) + ' cm²/g',
        on: v => c.cementFineness = v,
      }));
      millSelector(c);
      panelEl.append(E('div', 'hint', 'Zement-Rezeptur (Anteile):'));
      for (const [rid, name] of [['clinker', 'Klinker'], ['gypsum', 'Gips'], ['scm', 'Zumahlstoff']]) {
        panelEl.append(slider({
          label: name, min: 0, max: 100, step: 1,
          value: c.cementRecipe[rid] * 100, fmt: v => fmt0(v) + ' T.',
          on: v => c.cementRecipe[rid] = v / 100,
        }));
      }
      panelEl.append(E('div', 'hint', 'Zumahlstoff-Art:'));
      panelEl.append(segmented([
        { value: 'slag', label: 'Hüttensand' },
        { value: 'flyash', label: 'Flugasche' },
        { value: 'limestonePowder', label: 'Kalksteinmehl' },
      ], c.scmType, v => c.scmType = v));
      panelEl.append(makeReadout([
        { label: 'Zementsorte', fn: q => ({ value: q.cementType.code, sub: q.cementType.name }) },
        { label: '28-Tage-Festigkeit', fn: q => ({ value: fmt0(q.strength) + ' MPa' }) },
        { label: 'Festigkeitsklasse', fn: q => ({ value: q.strengthClass, cls: q.strengthClass === 'Ausschuss' ? 'bad' : q.strengthClass === '32,5' ? 'warn' : 'ok' }) },
        { label: 'Klinkeranteil', fn: q => ({ value: fmt0(q.clinkerFrac * 100) + ' %' }) },
        { label: 'CO₂ je t Zement', fn: q => ({ value: fmt0(q.co2PerT) + ' kg', cls: q.co2PerT < 680 ? 'ok' : q.co2PerT < 780 ? 'warn' : 'bad' }) },
        { label: 'Durchsatz', fn: (q, m) => ({ value: m ? fmt0(m.cementOut) + ' t/h' : '—' }) },
      ]));
      panelEl.append(title('Weniger Klinker (mehr Zumahlstoff) senkt CO₂ und Kosten — aber auch die Festigkeit.'));
      break;
    }

    case 'blending':
    case 'clinkersilo':
    case 'cementsilo': {
      const key = id === 'blending' ? 'rawMeal' : id === 'clinkersilo' ? 'clinker' : 'cement';
      panelEl.append(makeReadout([
        { label: 'Füllstand', fn: () => ({ value: Math.round(ST.silos[key].level / ST.silos[key].cap * 100) + ' %' }) },
        { label: 'Bestand', fn: () => ({ value: fmtInt(ST.silos[key].level) + ' t' }) },
        { label: 'Kapazität', fn: () => ({ value: fmtInt(ST.silos[key].cap) + ' t' }) },
      ]));
      panelEl.append(title('Silos puffern Schwankungen ab. Läuft ein Silo leer, hungert das nachfolgende Aggregat — läuft es voll, drosselt das vorherige.'));
      break;
    }

    case 'dispatch': {
      panelEl.append(makeReadout([
        { label: 'Marktpreis', fn: (q, m) => ({ value: m ? fmt0(m.unitPrice) + ' €/t' : '—', sub: 'Klasse ' + (m ? m.strengthClass : '') }) },
        { label: 'Nachfrage', fn: () => ({ value: fmt0(ST.market.demand) + ' t/h' }) },
        { label: 'Absatz', fn: (q, m) => ({ value: m ? fmt0(m.sold) + ' t/h' : '—' }) },
        { label: 'Erlös', fn: (q, m) => ({ value: m ? fmtMoney(m.revenue) + '/h' : '—', cls: 'ok' }) },
        { label: 'CO₂-Zertifikat', fn: () => ({ value: fmt0(ST.market.certPrice) + ' €/t' }) },
        { label: 'Zement-Silo', fn: () => ({ value: Math.round(ST.silos.cement.level / ST.silos.cement.cap * 100) + ' %' }) },
      ]));
      panelEl.append(title('Produziere mehr Zement, als verkauft wird, läuft das Silo voll. Marktpreis und Nachfrage schwanken täglich.'));
      break;
    }

    case 'preheater': {
      panelEl.append(makeReadout([
        { label: 'Zyklonstufen', fn: () => ({ value: ST.upgrades.preheaterStages + '-stufig', cls: ST.upgrades.preheaterStages >= 5 ? 'ok' : 'warn' }) },
        { label: 'Spez. Wärmebedarf', fn: q => ({ value: fmt0(q.specHeat) + ' kJ/kg', cls: q.specHeat < 3300 ? 'ok' : 'warn' }) },
        { label: 'Zustand', fn: () => ({ value: fmt0(ST.units.preheater.condition) + ' %' }) },
      ]));
      panelEl.append(title('Mehr Vorwärmerstufen nutzen die Abgaswärme besser und senken den Brennstoffbedarf (siehe Ausbau).'));
      break;
    }

    case 'cooler': {
      panelEl.append(makeReadout([
        { label: 'Wärmerückgewinnung', fn: () => ({ value: fmt0(ST.upgrades.coolerEff * 100) + ' %', cls: ST.upgrades.coolerEff >= 0.78 ? 'ok' : 'warn' }) },
        { label: 'Spez. Wärmebedarf', fn: q => ({ value: fmt0(q.specHeat) + ' kJ/kg' }) },
        { label: 'Zustand', fn: () => ({ value: fmt0(ST.units.cooler.condition) + ' %' }) },
      ]));
      break;
    }

    case 'calciner': {
      panelEl.append(makeReadout([
        { label: 'Prozess-CO₂', fn: () => ({ value: '525 kg/t Kl.', sub: 'aus Entsäuerung' }) },
        { label: 'Klinker', fn: (q, m) => ({ value: m ? fmt0(m.clinkerOut) + ' t/h' : '—' }) },
        { label: 'Zustand', fn: () => ({ value: fmt0(ST.units.calciner.condition) + ' %' }) },
      ]));
      panelEl.append(title('Rund 60 % der CO₂-Emissionen entstehen prozessbedingt beim Entsäuern des Kalksteins — unvermeidbar je t Klinker.'));
      break;
    }

    default: {
      // quarry, crusher
      panelEl.append(makeReadout([
        { label: 'Durchsatz', fn: (q, m) => ({ value: m ? fmt0(m.rawMealOut) + ' t/h' : '—' }) },
        { label: 'Zustand', fn: () => ({ value: ST.units[id] ? fmt0(ST.units[id].condition) + ' %' : '100 %' }) },
      ]));
      if (id === 'quarry') {
        panelEl.append(E('div', 'hint', 'Rohstoffvorräte im Steinbruch:'));
        panelEl.append(makeReadout([
          { label: 'Kalkstein', fn: () => ({ value: fmtInt(ST.reserves.limestone) + ' t' }) },
          { label: 'Ton', fn: () => ({ value: fmtInt(ST.reserves.clay) + ' t' }) },
          { label: 'Sand', fn: () => ({ value: fmtInt(ST.reserves.sand) + ' t' }) },
          { label: 'Eisenerz', fn: () => ({ value: fmtInt(ST.reserves.ironOre) + ' t' }) },
        ]));
      }
      break;
    }
  }
}

function buildDisturbance(id) {
  const dist = ST.events.active.find(d => d.unit === id || (d.unit === 'all' && id === 'kiln'));
  if (!dist) return;
  const card = E('div', 'card');
  card.style.borderColor = '#ff5a52';
  card.append(E('h4', null, '⚠ ' + dist.name));
  card.append(E('p', null, dist.desc + ' Verbleibend: ca. ' + dist.hoursLeft + ' h.'));
  const cost = Math.round(dist.hoursLeft * 9000) + 12000;
  const btn = E('button', 'btn', 'Sofort beheben (' + fmtMoney(cost) + ')');
  btn.disabled = ST.money < cost;
  btn.onclick = () => {
    ST.money -= cost;
    ST.events.active = ST.events.active.filter(d => d !== dist);
    HOOKS.toast('Störung behoben: ' + dist.name, 'good');
    render();
    HOOKS.onChange();
  };
  card.append(btn);
  panelEl.append(card);
}

function buildRepair(id) {
  if (!REPAIRABLE.includes(id)) return;
  const u = ST.units[id];
  const card = E('div', 'card');
  const cost = repairCost(u);
  const row = E('div', 'row');
  row.append(E('h4', null, 'Zustand: ' + fmt0(u.condition) + ' %'));
  const tag = E('span', 'tag ' + (u.condition > 50 ? 'ok' : u.condition > 20 ? 'warn' : 'bad'),
    u.condition > 50 ? 'in Ordnung' : u.condition > 20 ? 'Wartung nötig' : 'kritisch');
  row.append(tag);
  card.append(row);
  const bar = E('div', 'bar');
  const fill = E('i');
  fill.style.width = u.condition + '%';
  bar.append(fill);
  card.append(bar);
  card.append(E('p', null, 'Verschleiß senkt Kapazität und erhöht das Störungsrisiko.'));
  const btn = E('button', 'btn', 'Instand setzen (' + fmtMoney(cost) + ')');
  btn.disabled = u.condition >= 100 || ST.money < cost;
  btn.onclick = () => {
    ST.money -= cost;
    u.condition = 100;
    HOOKS.toast(NAMES[id] + ' instand gesetzt', 'good');
    render();
    HOOKS.onChange();
  };
  card.append(btn);
  panelEl.append(card);
}
