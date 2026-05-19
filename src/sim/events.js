// Zufallsereignisse / Betriebsstörungen.

const POOL = [
  {
    id: 'refractory', name: 'Feuerfest-Ausfall', unit: 'kiln',
    desc: 'Die Ofenausmauerung ist verschlissen — der Drehrohrofen steht still.',
    avail: { kiln: 0 }, hours: [26, 52], fix: 165000,
  },
  {
    id: 'preheaterBlock', name: 'Vorwärmer-Verstopfung', unit: 'preheater',
    desc: 'Ansatzbildung im Zyklon-Vorwärmer drosselt den Durchsatz stark.',
    avail: { preheater: 0.45 }, hours: [9, 20], fix: 38000,
  },
  {
    id: 'power', name: 'Stromausfall', unit: 'all',
    desc: 'Ein Netzausfall legt das gesamte Werk vorübergehend lahm.',
    avail: { all: 0 }, hours: [2, 6], fix: 0,
  },
  {
    id: 'fuel', name: 'Brennstoff-Lieferengpass', unit: 'kiln',
    desc: 'Eine Lieferverzögerung zwingt die Ofenlinie in den Sparbetrieb.',
    avail: { kiln: 0.55 }, hours: [15, 30], fix: 0,
  },
  {
    id: 'millJam', name: 'Zementmühle blockiert', unit: 'cementmill',
    desc: 'Eine Störung im Mahlkreislauf bremst die Zementmühle aus.',
    avail: { cementmill: 0.30 }, hours: [7, 15], fix: 22000,
  },
  {
    id: 'rawmillJam', name: 'Rohmühle gestört', unit: 'rawmill',
    desc: 'Mahltisch-Problem in der Rohmühle — verminderter Durchsatz.',
    avail: { rawmill: 0.35 }, hours: [6, 14], fix: 18000,
  },
];

const rnd = (a, b) => a + Math.random() * (b - a);

// Verfügbarkeit je Aggregat (0..1) aus aktiven Störungen.
export function unitAvailability(state) {
  const a = {};
  for (const id of Object.keys(state.units)) a[id] = 1;
  for (const d of state.events.active) {
    for (const u in d.avail) {
      if (u === 'all') {
        for (const id in a) a[id] = Math.min(a[id], d.avail.all);
      } else if (a[u] !== undefined) {
        a[u] = Math.min(a[u], d.avail[u]);
      }
    }
  }
  return a;
}

// Stündlicher Countdown der Störungen.
export function tickDisturbances(state) {
  const ended = [];
  state.events.active = state.events.active.filter(d => {
    d.hoursLeft -= 1;
    if (d.hoursLeft <= 0) { ended.push(d); return false; }
    return true;
  });
  return ended;
}

// Einmal pro Tag: evtl. neue Störung auslösen. Gibt das Ereignis zurück (oder null).
export function maybeTriggerEvent(state) {
  // Risiko steigt mit Verschleiß: schlechtester Aggregatzustand bestimmt die Basis.
  let worst = 100;
  for (const id in state.units) worst = Math.min(worst, state.units[id].condition);
  const prob = 0.08 + (100 - worst) / 100 * 0.42;
  if (Math.random() > prob) return null;

  // Ereignis gewichtet wählen — schlechte Aggregate bevorzugt.
  const weighted = POOL.map(e => {
    const cond = e.unit === 'all' ? worst : (state.units[e.unit]?.condition ?? 60);
    return { e, w: 1 + (100 - cond) / 25 };
  });
  const total = weighted.reduce((s, x) => s + x.w, 0);
  let r = Math.random() * total;
  let pick = weighted[0].e;
  for (const x of weighted) { r -= x.w; if (r <= 0) { pick = x.e; break; } }

  const dist = {
    id: pick.id, name: pick.name, unit: pick.unit, desc: pick.desc,
    avail: pick.avail, hoursLeft: Math.round(rnd(pick.hours[0], pick.hours[1])),
    fix: pick.fix,
  };
  state.events.active.push(dist);
  state.money -= pick.fix;
  return dist;
}
