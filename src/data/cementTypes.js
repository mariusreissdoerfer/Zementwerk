// Zementsorten-Klassifizierung nach Klinkeranteil und Zumahlstoff (vereinfacht nach EN 197-1).

export function classifyCement(clinkerFrac, scmType) {
  const k = clinkerFrac;
  if (k >= 0.95) return { code: 'CEM I', name: 'Portlandzement' };
  if (k >= 0.80) return { code: 'CEM II/A', name: 'Portlandkompositzement' };
  if (k >= 0.65) {
    return { code: 'CEM II/B', name: 'Portlandkompositzement' };
  }
  if (scmType === 'slag') {
    if (k >= 0.35) return { code: 'CEM III/A', name: 'Hochofenzement' };
    if (k >= 0.20) return { code: 'CEM III/B', name: 'Hochofenzement' };
    return { code: 'CEM III/C', name: 'Hochofenzement' };
  }
  return { code: 'CEM (Sonder)', name: 'Kompositzement' };
}

// Basis-Marktpreis je Festigkeitsklasse (€/t Zement)
export const PRICE_BY_CLASS = {
  '52,5': 118,
  '42,5': 96,
  '32,5': 78,
  'Ausschuss': 0,
};

export function strengthClass(strength28) {
  if (strength28 >= 52.5) return '52,5';
  if (strength28 >= 42.5) return '42,5';
  if (strength28 >= 32.5) return '32,5';
  return 'Ausschuss';
}
