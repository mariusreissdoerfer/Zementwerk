// Ausbaustufen des Werks. Jede Investition ist einmalig.

export const UPGRADES = [
  {
    id: 'preheater5', name: '5. Vorwärmerstufe', cost: 2_200_000,
    desc: 'Zusätzliche Zyklonstufe — senkt den Wärmebedarf um rund 150 kJ/kg.',
    available: s => s.upgrades.preheaterStages === 4,
    done: s => s.upgrades.preheaterStages >= 5,
    apply: s => { s.upgrades.preheaterStages = 5; },
  },
  {
    id: 'preheater6', name: '6. Vorwärmerstufe', cost: 2_900_000,
    desc: 'Sechsstufiger Vorwärmer für maximale Wärmerückgewinnung.',
    available: s => s.upgrades.preheaterStages === 5,
    done: s => s.upgrades.preheaterStages >= 6,
    apply: s => { s.upgrades.preheaterStages = 6; },
  },
  {
    id: 'coolerHE', name: 'Hocheffizienz-Klinkerkühler', cost: 1_700_000,
    desc: 'Moderner Rostkühler — Wärmerückgewinnung steigt auf 78 %.',
    available: s => s.upgrades.coolerEff < 0.78,
    done: s => s.upgrades.coolerEff >= 0.78,
    apply: s => { s.upgrades.coolerEff = 0.78; },
  },
  {
    id: 'altFuel', name: 'Ersatzbrennstoff-Dosieranlage', cost: 1_300_000,
    desc: 'Erlaubt einen RDF-Anteil von bis zu 60 % im Brennstoffmix.',
    available: s => !s.upgrades.altFuelSystem,
    done: s => s.upgrades.altFuelSystem,
    apply: s => { s.upgrades.altFuelSystem = true; },
  },
  {
    id: 'whr', name: 'Abwärmenutzung (WHR)', cost: 3_100_000,
    desc: 'Stromerzeugung aus Ofenabwärme — etwa 30 kWh je t Klinker.',
    available: s => !s.upgrades.whr,
    done: s => s.upgrades.whr,
    apply: s => { s.upgrades.whr = true; },
  },
];

export function buyUpgrade(state, id) {
  const up = UPGRADES.find(u => u.id === id);
  if (!up) return { ok: false, msg: 'Unbekannt' };
  if (!up.available(state)) return { ok: false, msg: 'Nicht verfügbar' };
  if (state.money < up.cost) return { ok: false, msg: 'Zu wenig Kapital' };
  state.money -= up.cost;
  up.apply(state);
  return { ok: true, msg: up.name + ' gebaut' };
}

// Kosten, um ein Aggregat instand zu setzen (auf 100 %).
export function repairCost(unit) {
  return Math.round((100 - unit.condition) * 5200);
}
