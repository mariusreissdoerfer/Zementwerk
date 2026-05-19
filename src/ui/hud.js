// Kopfzeile (KPIs, Uhr, Geld, Alarme), Toasts und generischer Modal-Dialog.

import { fmt0, fmtMoney } from '../util.js?v=14';

let elClock, elMoney, elProfit, elKpis, elAlarm, elModal, elToast;
let toastTimer = null;

const KPIS = [
  { label: 'Klinker', fn: m => ({ v: fmt0(m.clinkerOut) + ' t/h', cls: m.clinkerOut > 90 ? 'good' : 'warn' }) },
  { label: 'Zement', fn: m => ({ v: fmt0(m.cementOut) + ' t/h', cls: m.cementOut > 80 ? 'good' : 'warn' }) },
  { label: 'LSF', fn: m => ({ v: fmt0(m.lsf), cls: m.lsf >= 92 && m.lsf <= 98 ? 'good' : 'bad' }) },
  { label: 'Wärme', fn: m => ({ v: fmt0(m.specHeat), cls: m.specHeat < 3300 ? 'good' : m.specHeat < 3600 ? 'warn' : 'bad' }) },
  { label: 'CO₂/t', fn: m => ({ v: fmt0(m.co2PerT), cls: m.co2PerT < 680 ? 'good' : m.co2PerT < 780 ? 'warn' : 'bad' }) },
  { label: 'Strom/t', fn: m => ({ v: fmt0(m.elecPerT), cls: m.elecPerT < 115 ? 'good' : 'warn' }) },
  { label: 'Klasse', fn: m => ({ v: m.strengthClass, cls: m.strengthClass === 'Ausschuss' ? 'bad' : m.strengthClass === '32,5' ? 'warn' : 'good' }) },
  { label: 'Gewinn/h', fn: m => ({ v: fmtMoney(m.profitHour), cls: m.profitHour >= 0 ? 'good' : 'bad' }) },
];

export function initHud() {
  elClock = document.getElementById('clock');
  elMoney = document.getElementById('money');
  elProfit = document.getElementById('profit');
  elKpis = document.getElementById('kpis');
  elAlarm = document.getElementById('alarm');
  elModal = document.getElementById('modal');
  elToast = document.getElementById('toast');

  elKpis.innerHTML = '';
  for (const k of KPIS) {
    const chip = document.createElement('div');
    chip.className = 'kpi';
    const l = document.createElement('div');
    l.className = 'k-label';
    l.textContent = k.label;
    const v = document.createElement('div');
    v.className = 'k-value';
    v.textContent = '—';
    chip.append(l, v);
    k._chip = chip;
    k._v = v;
    elKpis.append(chip);
  }

  elModal.addEventListener('click', e => {
    if (e.target === elModal) closeModal();
  });
}

export function updateHud(state, m, hourFloat) {
  const hf = hourFloat ?? state.time.hour;
  const h = Math.floor(hf) % 24;
  const mm = Math.floor((((hf % 1) + 1) % 1) * 6) * 10; // 10-Minuten-Schritte
  const pad = n => String(n).padStart(2, '0');
  elClock.textContent = `Tag ${state.time.day} · ${pad(h)}:${pad(mm)}`;
  elMoney.textContent = fmtMoney(state.money);
  elMoney.style.color = state.money < 0 ? '#ff5a52' : '#ffd24a';

  const p = state.finance.lastProfit;
  elProfit.textContent = (p >= 0 ? '▲ ' : '▼ ') + fmtMoney(p) + '/Tag';
  elProfit.className = 'profit ' + (p >= 0 ? 'up' : 'down');

  if (m) {
    for (const k of KPIS) {
      const r = k.fn(m);
      k._v.textContent = r.v;
      k._chip.className = 'kpi ' + r.cls;
    }
  }

  updateAlarm(state);
}

function updateAlarm(state) {
  let msg = '';
  if (state.money < 0) {
    msg = '⚠ Konto im Minus — Kosten senken oder Produktion anpassen!';
  } else if (state.events.active.length) {
    msg = '⚠ ' + state.events.active[0].name + ' aktiv — Aggregat antippen.';
  } else {
    for (const id in state.units) {
      if (state.units[id].condition < 15) {
        msg = '⚠ Aggregat in kritischem Zustand — Instandsetzung nötig.';
        break;
      }
    }
  }
  if (msg) {
    elAlarm.textContent = msg;
    elAlarm.classList.remove('hidden');
  } else {
    elAlarm.classList.add('hidden');
  }
}

export function toast(msg, type) {
  elToast.textContent = msg;
  elToast.className = 'toast ' + (type || '');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => elToast.classList.add('hidden'), 3600);
}

// ---------- Generischer Modal ----------
export function openModal(titleText, bodyNode) {
  const card = document.createElement('div');
  card.className = 'modal-card';
  const head = document.createElement('div');
  head.className = 'panel-head';
  const h = document.createElement('h2');
  h.textContent = titleText;
  const close = document.createElement('button');
  close.className = 'close-btn';
  close.textContent = '×';
  close.onclick = closeModal;
  head.append(h, close);
  card.append(head, bodyNode);
  elModal.innerHTML = '';
  elModal.append(card);
  elModal.classList.remove('hidden');
}

export function closeModal() {
  elModal.classList.add('hidden');
  elModal.innerHTML = '';
}

export function modalOpen() {
  return !elModal.classList.contains('hidden');
}
