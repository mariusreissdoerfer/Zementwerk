// Physikalisch-chemische Formeln des Zementwerks (Mix-Modell).
// Alle Funktionen sind rein (ohne Seiteneffekte) und damit leicht testbar.

import { OXIDES } from '../data/materials.js?v=5';
import { FUELS } from '../data/fuels.js?v=5';

export const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Normalisiert ein {key:zahl}-Objekt so, dass die Summe 1 ergibt.
export function normalize(obj) {
  let sum = 0;
  for (const k in obj) sum += Math.max(0, obj[k]);
  const out = {};
  for (const k in obj) out[k] = sum > 0 ? Math.max(0, obj[k]) / sum : 0;
  return out;
}

// Gewichtete Oxid-Zusammensetzung einer Materialmischung.
export function blendComposition(materials, fractions) {
  const out = {};
  for (const ox of OXIDES) {
    let s = 0;
    for (const id in fractions) {
      const m = materials[id];
      if (m) s += fractions[id] * (m.comp[ox] || 0);
    }
    out[ox] = s;
  }
  return out;
}

// Klinker-Zusammensetzung: Glühverlust (CO2 + H2O) wird ausgetrieben, Rest neu normiert.
export function clinkerComposition(rawComp) {
  const keep = 1 - rawComp.LOI;
  const out = {};
  for (const ox of OXIDES) {
    out[ox] = ox === 'LOI' ? 0 : (keep > 0 ? rawComp[ox] / keep : 0);
  }
  return out;
}

// Massenverhältnis Rohmehl je Tonne Klinker (aus dem Glühverlust).
export function rawMealPerClinker(rawComp) {
  return 1 / Math.max(0.5, 1 - rawComp.LOI);
}

// --- Qualitätskennzahlen (Eingang als Massenanteile; Verhältnisse sind skaleninvariant) ---
export function lsf(c) {            // Kalkstandard nach Lea & Parker
  const d = 2.8 * c.SiO2 + 1.18 * c.Al2O3 + 0.65 * c.Fe2O3;
  return d > 0 ? 100 * c.CaO / d : 0;
}
export function silicaModulus(c) {  // Silikatmodul
  const d = c.Al2O3 + c.Fe2O3;
  return d > 0 ? c.SiO2 / d : 0;
}
export function aluminaModulus(c) { // Tonerdemodul
  return c.Fe2O3 > 0 ? c.Al2O3 / c.Fe2O3 : 0;
}

// Klinkerphasen nach Bogue (Eingang Massenanteile -> Ergebnis in %).
export function bogue(c, freeLimePct) {
  const CaO = Math.max(0, c.CaO * 100 - freeLimePct);
  const SiO2 = c.SiO2 * 100, Al2O3 = c.Al2O3 * 100, Fe2O3 = c.Fe2O3 * 100;
  const C3S = Math.max(0, 4.071 * CaO - 7.600 * SiO2 - 6.718 * Al2O3 - 1.430 * Fe2O3);
  const C2S = Math.max(0, 2.867 * SiO2 - 0.7544 * C3S);
  const C3A = Math.max(0, 2.650 * Al2O3 - 1.692 * Fe2O3);
  const C4AF = Math.max(0, 3.043 * Fe2O3);
  return { C3S, C2S, C3A, C4AF };
}

// Freikalk (freies CaO) in %: steigt mit LSF & grober Rohmehlfeinheit, sinkt mit
// stärkerer Brennintensität. Gute Werte ~0,5-1,5 %.
export function freeLime(lsfVal, rawMealFineness, burningIntensity, kilnCondition) {
  const base = 0.8;
  const fLsf = 0.13 * Math.max(0, lsfVal - 92);
  const fCoarse = 1.7 * (1 - rawMealFineness);
  const fWear = 0.018 * (100 - kilnCondition);
  const fBurn = 2.7 * burningIntensity;
  return clamp(base + fLsf + fCoarse + fWear - fBurn, 0.15, 9);
}

// Sintertemperatur im Ofen [°C] (nur Anzeige/Optik).
export function kilnTemperature(burningIntensity, kilnCondition) {
  return Math.round(1360 + 150 * burningIntensity - 0.6 * (100 - kilnCondition));
}

// Spezifischer Brennstoffwärmebedarf [kJ/kg Klinker].
export function specificHeat(preheaterStages, coolerEff, kilnCondition, burningIntensity, loadFactor) {
  const stageBase = { 4: 3300, 5: 3150, 6: 3010 }[preheaterStages] || 3300;
  const coolerPen = (0.80 - coolerEff) * 900;
  const wearPen = 4.0 * (100 - kilnCondition);
  const burnPen = 260 * burningIntensity;
  let loadPen = 0;
  if (loadFactor > 1)        loadPen = (loadFactor - 1) * 1300;
  else if (loadFactor < 0.6) loadPen = (0.6 - loadFactor) * 800;
  return Math.round(stageBase + coolerPen + wearPen + burnPen + loadPen);
}

// Gewichteter Heizwert eines Brennstoffmixes [kJ/kg].
export function mixNCV(fuelMix) {
  let v = 0;
  for (const f in fuelMix) v += fuelMix[f] * (FUELS[f]?.ncv || 0);
  return v;
}

// Blaine-Feinheit des Zements [cm²/g] aus dem Mahlfeinheit-Regler 0..1.
export function blaine(fineness) {
  return Math.round(2800 + fineness * 2200);
}

// 28-Tage-Druckfestigkeit [MPa] aus Klinkerphasen, Feinheit, Freikalk, Klinkeranteil.
export function strength28(C3S, blaineVal, freeLimePct, clinkerFrac) {
  let s = 0.34 * C3S + 0.0060 * blaineVal - 2.2 * Math.max(0, freeLimePct - 2);
  s *= (0.55 + 0.45 * clinkerFrac);
  return Math.max(0, s);
}

// Elektrischer Energiebedarf [kWh] für eine Stunde Betrieb.
export function electricalEnergy({ rawMeal, clinker, cement, rawMealFineness, cementFineness, vrm }) {
  const millFactor = vrm ? 0.72 : 1;             // Vertikalrollenmühle spart Strom
  const eRawmill = rawMeal * (14 + 12 * rawMealFineness) * millFactor;
  const eCrusher = rawMeal * 1.6;
  const eKilnLine = clinker * 26;
  const eCooler = clinker * 5;
  const eCementmill = cement * (26 + 24 * cementFineness) * millFactor;
  const eMisc = 9 * Math.max(rawMeal, clinker, cement);
  return (eRawmill + eCrusher + eKilnLine + eCooler + eCementmill + eMisc) / 1000; // MWh
}

// CO2 aus der Entsäuerung des Kalksteins [t] je Stunde.
export function processCO2(clinker_t) {
  return clinker_t * 0.525;
}

// CO2 aus der Brennstoffverbrennung [t] je Stunde.
export function fuelCO2(fuelMass_t, fuelMix) {
  let co2 = 0;
  for (const f in fuelMix) {
    co2 += fuelMix[f] * fuelMass_t * (FUELS[f]?.co2 || 0);
  }
  return co2;
}
