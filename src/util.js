// Kleine Formatierungshelfer.

export const fmtMoney = (v) => {
  const a = Math.abs(v);
  let s;
  if (a >= 1e6) s = (v / 1e6).toFixed(2).replace('.', ',') + ' Mio';
  else if (a >= 1e3) s = Math.round(v / 1e3) + 'k';
  else s = Math.round(v).toString();
  return s + ' €';
};

export const fmtInt = (v) => Math.round(v).toLocaleString('de-DE');
export const fmt1 = (v) => (Math.round(v * 10) / 10).toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
export const fmt0 = (v) => Math.round(v).toString();
export const fmt2 = (v) => (Math.round(v * 100) / 100).toLocaleString('de-DE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const pct = (v) => Math.round(v) + ' %';
