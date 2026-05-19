// Orchestrator der Prozesssimulation: ein Tick = eine Betriebsstunde.

import {
  clamp, normalize, blendComposition, clinkerComposition, rawMealPerClinker,
  lsf, silicaModulus, aluminaModulus, bogue, freeLime, kilnTemperature,
  specificHeat, mixNCV, blaine, strength28, electricalEnergy, processCO2, fuelCO2,
} from './physics.js?v=17';
import { MATERIALS } from '../data/materials.js?v=17';
import { FUELS } from '../data/fuels.js?v=17';
import { classifyCement, strengthClass, PRICE_BY_CLASS } from '../data/cementTypes.js?v=17';
import {
  ECON, rawMaterialCost, additiveCost, fuelCost, co2Cost, maintenanceCost, updateMarket,
} from './economy.js?v=17';
import { unitAvailability, tickDisturbances, maybeTriggerEvent } from './events.js?v=17';
import { checkMissions } from '../game/scenarios.js?v=17';
import { fmtMoney } from '../util.js?v=17';

// Auslegungskapazitäten der Aggregate [t/h]
export const CAP = { crusher: 420, rawmill: 230, kiln: 165, cementmill: 185 };

// Effektive Kapazität: sinkt mit Verschleiß auf bis zu 40 %.
function effCap(unit, base) {
  return base * (0.40 + 0.60 * unit.condition / 100);
}

// Reines Qualitäts-/Intensitätsmodell — ohne Silo-/Geld-/Zeit-Effekte.
// Wird auch von der UI für die Live-Vorschau bei Regleränderungen genutzt.
export function qualityModel(state) {
  const c = state.controls, u = state.units, up = state.upgrades;

  const recipe = normalize(c.recipe);
  const rawComp = blendComposition(MATERIALS, recipe);
  const clinkerComp = clinkerComposition(rawComp);
  const lsfVal = lsf(clinkerComp);
  const smVal = silicaModulus(clinkerComp);
  const amVal = aluminaModulus(clinkerComp);
  const rmPerClinker = rawMealPerClinker(rawComp);

  const flVal = freeLime(lsfVal, c.rawMealFineness, c.burningIntensity, u.kiln.condition);
  const phases = bogue(clinkerComp, flVal);

  const loadFactor = clamp(c.productionRate / CAP.kiln, 0, 1.6);
  const q = specificHeat(up.preheaterStages, up.coolerEff, u.kiln.condition, c.burningIntensity, loadFactor);

  // Brennstoffmix — RDF-Anteil ist ohne Dosieranlage begrenzt.
  const rdfMax = up.altFuelSystem ? 0.60 : 0.15;
  const fuelMix = normalize({
    coal: Math.max(0, c.fuelMix.coal),
    petcoke: Math.max(0, c.fuelMix.petcoke),
    rdf: Math.min(Math.max(0, c.fuelMix.rdf), rdfMax),
  });
  const ncv = mixNCV(fuelMix);

  // CO2-Intensität
  const fuelPerClinker_kg = ncv > 0 ? q / ncv * 1000 : 0;
  let fuelCO2perClinker = 0;
  for (const f in fuelMix) fuelCO2perClinker += fuelMix[f] * fuelPerClinker_kg * FUELS[f].co2;
  const co2PerClinker = 525 + fuelCO2perClinker;

  const thermalRDF = ncv > 0 ? fuelMix.rdf * FUELS.rdf.ncv / ncv * 100 : 0;

  const cr = normalize({
    clinker: c.cementRecipe.clinker,
    gypsum: c.cementRecipe.gypsum,
    scm: c.cementRecipe.scm,
  });
  const blaineVal = blaine(c.cementFineness);
  const str = strength28(phases.C3S, blaineVal, flVal, cr.clinker);
  const sClass = strengthClass(str);
  const cementType = classifyCement(cr.clinker, c.scmType);
  const co2PerT = co2PerClinker * cr.clinker;

  return {
    recipe, rawComp, clinkerComp, lsf: lsfVal, sm: smVal, am: amVal,
    rmPerClinker, freeLime: flVal, phases, specHeat: q, fuelMix, ncv,
    co2PerClinker, co2PerT, thermalRDF, cr, blaine: blaineVal,
    strength: str, strengthClass: sClass, cementType, clinkerFrac: cr.clinker,
    kilnTemp: kilnTemperature(c.burningIntensity, u.kiln.condition), loadFactor,
  };
}

// Führt eine Betriebsstunde aus. Mutiert state, liefert Hinweise (Toasts).
export function simulate(state) {
  const notes = [];
  const c = state.controls, u = state.units, up = state.upgrades;
  const avail = unitAvailability(state);
  const Q = qualityModel(state);

  // --- Rohmühle -> Rohmehl-Silo ---
  const rawmillMax = effCap(u.rawmill, CAP.rawmill) * avail.rawmill;
  const crusherMax = effCap(u.crusher, CAP.crusher) * avail.crusher;
  let rawMealOut = Math.min(c.rawMillRate, rawmillMax, crusherMax);
  const reserveLimit = Math.min(...Object.keys(Q.recipe).map(
    id => Q.recipe[id] > 0 ? state.reserves[id] / Q.recipe[id] : Infinity));
  rawMealOut = Math.max(0, Math.min(
    rawMealOut, reserveLimit, state.silos.rawMeal.cap - state.silos.rawMeal.level));
  for (const id in Q.recipe) {
    state.reserves[id] = Math.max(0, state.reserves[id] - Q.recipe[id] * rawMealOut);
  }
  state.silos.rawMeal.level += rawMealOut;

  // --- Vorwärmer + Calcinator + Drehrohrofen -> Klinker-Silo ---
  const kilnMax = effCap(u.kiln, CAP.kiln)
    * avail.kiln * avail.preheater * avail.calciner * avail.cooler;
  const clinkerTarget = Math.min(c.productionRate, kilnMax);
  let clinkerOut = Math.min(clinkerTarget, state.silos.rawMeal.level / Q.rmPerClinker);
  const clinkerSpace = state.silos.clinker.cap - state.silos.clinker.level;
  clinkerOut = Math.max(0, Math.min(clinkerOut, clinkerSpace));
  const rawMealUsed = clinkerOut * Q.rmPerClinker;
  state.silos.rawMeal.level -= rawMealUsed;
  state.silos.clinker.level += clinkerOut;
  const loadFactor = clinkerOut / CAP.kiln;

  // --- Brennstoff & CO2 (absolut, je Stunde) ---
  const heatkJ = Q.specHeat * clinkerOut * 1000;
  const fuelMass = Q.ncv > 0 ? heatkJ / Q.ncv / 1000 : 0;
  const co2Process = processCO2(clinkerOut);
  const co2Fuel = fuelCO2(fuelMass, Q.fuelMix);
  const co2Total = co2Process + co2Fuel;

  // --- Zementmühle -> Zement-Silo ---
  const cementmillMax = effCap(u.cementmill, CAP.cementmill) * avail.cementmill;
  const cementTarget = Math.min(c.cementMillRate, cementmillMax);
  let cementOut = Q.cr.clinker > 0
    ? Math.min(cementTarget, state.silos.clinker.level / Q.cr.clinker)
    : 0;
  const cementSpace = state.silos.cement.cap - state.silos.cement.level;
  cementOut = Math.max(0, Math.min(cementOut, cementSpace));
  const clinkerUsed = cementOut * Q.cr.clinker;
  const gypsumUsed = cementOut * Q.cr.gypsum;
  const scmUsed = cementOut * Q.cr.scm;
  state.silos.clinker.level -= clinkerUsed;
  state.silos.cement.level += cementOut;

  // --- Strom ---
  const elecB = electricalEnergy({
    rawMeal: rawMealOut, clinker: clinkerOut, cement: cementOut,
    rawMealFineness: c.rawMealFineness, cementFineness: c.cementFineness, millType: c.millType,
  });
  const whrCut = up.whr ? clinkerOut * 0.030 : 0;
  const elec = Math.max(0, elecB.total - whrCut);

  // --- Versand / Verkauf ---
  const demand = state.market.demand;
  const sold = Math.min(state.silos.cement.level, demand);
  state.silos.cement.level -= sold;
  const unitPrice = (PRICE_BY_CLASS[Q.strengthClass] || 0) * state.market.priceFactor;
  const revenue = sold * unitPrice;

  // --- Kosten & Kassensturz ---
  const costs = {
    raw: rawMaterialCost(rawMealOut, Q.recipe),
    add: additiveCost(gypsumUsed, scmUsed, c.scmType),
    fuel: fuelCost(fuelMass, Q.fuelMix),
    elec: elec * ECON.electricity,
    co2: co2Cost(co2Total, state.market.certPrice),
    pers: ECON.personnelPerHour,
    maint: maintenanceCost(u),
  };
  const costTotal = costs.raw + costs.add + costs.fuel + costs.elec
    + costs.co2 + costs.pers + costs.maint;
  state.money += revenue - costTotal;

  // --- Kosten je Aggregat (für die Detailpanels) ---
  const eP = ECON.electricity;
  const um = id => (100 - u[id].condition) * 11;          // Wartung je Aggregat
  const kilnElec = Math.max(0, elecB.kilnLine + elecB.misc - whrCut) * eP;
  const unitCosts = {
    quarry: { Rohstoffe: costs.raw },
    crusher: { Strom: elecB.crusher * eP, Wartung: um('crusher') },
    rawmill: { Strom: elecB.rawmill * eP, Wartung: um('rawmill') },
    preheater: { Wartung: um('preheater') },
    calciner: { Wartung: um('calciner') },
    kiln: { Brennstoff: costs.fuel, 'CO₂': costs.co2, Strom: kilnElec, Wartung: um('kiln') },
    cooler: { Strom: elecB.cooler * eP, Wartung: um('cooler') },
    cementmill: { Strom: elecB.cementmill * eP, Zumahlstoffe: costs.add, Wartung: um('cementmill') },
  };
  for (const id in unitCosts) {
    let t = 0;
    for (const k in unitCosts[id]) t += unitCosts[id][k];
    unitCosts[id].total = t;
  }

  // --- Verschleiß ---
  const wear = (unit, a) => { unit.condition = Math.max(0, unit.condition - a); };
  if (rawMealOut > 0) { wear(u.rawmill, 0.05); wear(u.crusher, 0.03); }
  if (clinkerOut > 0) {
    wear(u.kiln, 0.035 + 0.06 * c.burningIntensity);
    wear(u.preheater, 0.022); wear(u.calciner, 0.024); wear(u.cooler, 0.030);
  }
  if (cementOut > 0) wear(u.cementmill, 0.05);

  // --- Zeitfortschritt ---
  state.time.tick++;
  state.time.hour++;
  for (const e of tickDisturbances(state)) {
    notes.push({ type: 'good', msg: 'Behoben: ' + e.name });
  }
  let newDay = false;
  if (state.time.hour >= 24) { state.time.hour = 0; state.time.day++; newDay = true; }

  // --- Metriken zusammenstellen ---
  state.metrics = {
    ...Q,
    rawMealOut, clinkerOut, cementOut, sold, demand, fuelMass,
    co2Process, co2Fuel, co2Total, elec,
    elecPerT: cementOut > 0 ? elec * 1000 / cementOut : 0,
    unitPrice, revenue, costTotal, costs, unitCosts,
    profitHour: revenue - costTotal,
    avail, loadFactor,
  };

  // --- Tageswechsel: Finanzen, Markt, Störungen ---
  if (newDay) {
    state.finance.lastProfit = state.money - state.finance.dayStartMoney;
    state.finance.dayStartMoney = state.money;
    updateMarket(state.market);
    const ev = maybeTriggerEvent(state);
    if (ev) notes.push({ type: 'bad', msg: 'Störung: ' + ev.name });
  }

  // --- Missionen prüfen ---
  for (const m of checkMissions(state)) {
    notes.push({ type: 'good', msg: 'Mission erfüllt: ' + m.title + ' (+' + fmtMoney(m.reward) + ')' });
  }

  // --- Ereignisprotokoll ---
  for (const n of notes) {
    state.log.unshift({ day: state.time.day, hour: state.time.hour, msg: n.msg, type: n.type });
  }
  if (state.log.length > 40) state.log.length = 40;

  return notes;
}
