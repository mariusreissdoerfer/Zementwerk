// Wirtschaftsmodell: Kosten, Erlöse, Markt und CO2-Zertifikate.

import { MATERIALS, ADDITIVES } from '../data/materials.js?v=18';
import { FUELS } from '../data/fuels.js?v=18';
import { clamp } from './physics.js?v=18';

export const ECON = {
  electricity: 95,        // €/MWh
  personnelPerHour: 1300, // fixe Lohnkosten je Stunde
  co2FreeAllowance: 42,   // t CO2/h kostenlos zugeteilt (EU-ETS)
};

export function rawMaterialCost(rawMeal_t, recipe) {
  let c = 0;
  for (const id in recipe) c += recipe[id] * rawMeal_t * (MATERIALS[id]?.cost || 0);
  return c;
}

export function additiveCost(gypsum_t, scm_t, scmType) {
  return gypsum_t * ADDITIVES.gypsum.cost + scm_t * (ADDITIVES[scmType]?.cost || 0);
}

export function fuelCost(fuelMass_t, fuelMix) {
  let c = 0;
  for (const f in fuelMix) c += fuelMix[f] * fuelMass_t * (FUELS[f]?.cost || 0);
  return c;
}

// Kosten der CO2-Zertifikate: nur die Menge über der kostenlosen Zuteilung zählt.
export function co2Cost(co2_t, certPrice) {
  const billable = Math.max(0, co2_t - ECON.co2FreeAllowance);
  return billable * certPrice;
}

// Wartungskosten je Stunde — steigen mit Verschleiß der Aggregate.
export function maintenanceCost(units) {
  let c = 0;
  for (const id in units) c += (100 - units[id].condition) * 11;
  return c;
}

// Marktbewegung — einmal pro Tag aufgerufen (Random Walk).
export function updateMarket(market) {
  market.priceFactor = clamp(market.priceFactor + (Math.random() - 0.5) * 0.09, 0.78, 1.30);
  market.demand = clamp(market.demand + (Math.random() - 0.5) * 26, 55, 195);
  market.certPrice = clamp(market.certPrice + (Math.random() - 0.5) * 10, 45, 150);
}
