// Zentraler Spielstand inkl. Speichern/Laden (localStorage).

export const SAVE_KEY = 'zementwerk_save_v2';

export function defaultState() {
  return {
    version: 2,
    time: { tick: 0, hour: 6, day: 1 },
    speed: 1,
    money: 5_000_000,

    controls: {
      productionRate: 105,        // Soll t Klinker/h
      rawMealFineness: 0.62,      // 0 grob .. 1 fein
      burningIntensity: 0.55,     // 0 .. 1
      fuelMix: { coal: 0.60, petcoke: 0.30, rdf: 0.10 },
      recipe: { limestone: 0.845, clay: 0.130, sand: 0.015, ironOre: 0.010 },
      cementRecipe: { clinker: 0.90, gypsum: 0.05, scm: 0.05 },
      scmType: 'slag',
      cementFineness: 0.55,
      rawMillRate: 175,           // Soll t Rohmehl/h
      cementMillRate: 120,        // Soll t Zement/h
    },

    units: {
      quarry: { condition: 100 }, crusher: { condition: 96 }, rawmill: { condition: 93 },
      blending: { condition: 100 }, preheater: { condition: 91 }, calciner: { condition: 92 },
      kiln: { condition: 86 }, cooler: { condition: 89 }, clinkersilo: { condition: 100 },
      cementmill: { condition: 90 }, cementsilo: { condition: 100 }, dispatch: { condition: 100 },
    },

    silos: {
      rawMeal: { level: 2800, cap: 9000 },
      clinker: { level: 4200, cap: 16000 },
      cement: { level: 3200, cap: 20000 },
    },

    reserves: { limestone: 4_000_000, clay: 900_000, sand: 170_000, ironOre: 70_000 },
    market: { priceFactor: 1.0, demand: 120, certPrice: 85 },
    upgrades: {
      preheaterStages: 4, coolerEff: 0.66, dustFilter: 1,
      whr: false, vrm: false, altFuelSystem: false,
    },

    missions: { completed: [], stars: {} },
    events: { active: [] },
    finance: { dayStartMoney: 5_000_000, lastProfit: 0 },
    log: [],
    metrics: null,
    tutorialDone: false,
  };
}

export function saveState(state) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(state));
  } catch (e) { /* Speicher voll / nicht verfügbar — ignorieren */ }
}

export function loadState() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const s = JSON.parse(raw);
    if (!s || s.version !== 2) return null;
    return s;
  } catch (e) { return null; }
}

export function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* ignore */ }
}
