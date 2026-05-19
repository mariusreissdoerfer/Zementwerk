// Rohstoffe & Zumahlstoffe mit Oxid-Zusammensetzung (Massenanteile).
// comp-Anteile summieren je Material zu 1.0 (inkl. Glühverlust LOI).

export const OXIDES = ['CaO', 'SiO2', 'Al2O3', 'Fe2O3', 'MgO', 'LOI', 'other'];

// Rohstoffe für die Rohmehl-Rezeptur
export const MATERIALS = {
  limestone: {
    name: 'Kalkstein',
    short: 'Kalk',
    comp: { CaO: .478, SiO2: .055, Al2O3: .018, Fe2O3: .009, MgO: .012, LOI: .388, other: .040 },
    cost: 6,   // €/t aus eigenem Steinbruch
  },
  clay: {
    name: 'Ton / Mergel',
    short: 'Ton',
    comp: { CaO: .020, SiO2: .560, Al2O3: .170, Fe2O3: .075, MgO: .020, LOI: .090, other: .065 },
    cost: 9,
  },
  sand: {
    name: 'Quarzsand (SiO₂-Korrektur)',
    short: 'Sand',
    comp: { CaO: .005, SiO2: .920, Al2O3: .030, Fe2O3: .015, MgO: .003, LOI: .005, other: .022 },
    cost: 15,
  },
  ironOre: {
    name: 'Eisenerz (Fe₂O₃-Korrektur)',
    short: 'Erz',
    comp: { CaO: .020, SiO2: .090, Al2O3: .030, Fe2O3: .780, MgO: .010, LOI: .020, other: .050 },
    cost: 40,
  },
};

// Zumahlstoffe für die Zementmühle
export const ADDITIVES = {
  gypsum:          { name: 'Gips (Sulfatträger)', cost: 26 },
  slag:            { name: 'Hüttensand',          cost: 34 },
  flyash:          { name: 'Flugasche',           cost: 17 },
  limestonePowder: { name: 'Kalksteinmehl',       cost: 11 },
};
