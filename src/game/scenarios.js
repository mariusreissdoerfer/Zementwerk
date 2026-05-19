// Missionen / Challenges. Jede Mission wird erfüllt, sobald ihr Check einmal zutrifft.

export const MISSIONS = [
  {
    id: 'lsf', title: 'Rezeptur im Griff', reward: 150000,
    desc: 'Halte den Kalkstandard (LSF) im Zielfenster 92–98.',
    check: (s, m) => m && m.lsf >= 92 && m.lsf <= 98,
  },
  {
    id: 'strength', title: 'Solide Festigkeit', reward: 180000,
    desc: 'Produziere Zement der Festigkeitsklasse 42,5 oder höher.',
    check: (s, m) => m && (m.strengthClass === '42,5' || m.strengthClass === '52,5'),
  },
  {
    id: 'heat', title: 'Energie sparen', reward: 220000,
    desc: 'Senke den spezifischen Wärmebedarf unter 3300 kJ/kg Klinker.',
    check: (s, m) => m && m.specHeat < 3300,
  },
  {
    id: 'load', title: 'Volllast', reward: 230000,
    desc: 'Fahre die Ofenlinie auf 140 t Klinker/h.',
    check: (s, m) => m && m.clinkerOut >= 140,
  },
  {
    id: 'rdf', title: 'Grüner brennen', reward: 280000,
    desc: 'Erreiche eine thermische Ersatzbrennstoff-Quote über 25 %.',
    check: (s, m) => m && m.thermalRDF > 25,
  },
  {
    id: 'co2', title: 'CO₂ runter', reward: 320000,
    desc: 'Drücke die CO₂-Intensität unter 680 kg/t Zement.',
    check: (s, m) => m && m.co2PerT > 0 && m.co2PerT < 680,
  },
  {
    id: 'cem3', title: 'Hochofenzement', reward: 300000,
    desc: 'Stelle einen Zement vom Typ CEM III her.',
    check: (s, m) => m && m.cementType && m.cementType.code.startsWith('CEM III'),
  },
  {
    id: 'rich', title: 'Werk auf Kurs', reward: 600000,
    desc: 'Bringe den Kontostand auf 9 Mio €.',
    check: (s) => s.money >= 9_000_000,
  },
];

// Prüft alle offenen Missionen. Gibt neu erfüllte Missionen zurück.
export function checkMissions(state) {
  const done = [];
  for (const m of MISSIONS) {
    if (state.missions.completed.includes(m.id)) continue;
    if (m.check(state, state.metrics)) {
      state.missions.completed.push(m.id);
      state.money += m.reward;
      done.push(m);
    }
  }
  return done;
}
