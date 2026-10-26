import type { Dimension, DimensionUnit } from 'postext';

/** Points per unit. em/rem assume a 12 pt reference — only used where a
 *  relative length has to be drawn or converted without its context. */
export const TO_PT: Record<DimensionUnit, number> = {
  pt: 1,
  mm: 2.83465,
  cm: 28.3465,
  in: 72,
  px: 0.75,
  em: 12,
  rem: 12,
};

export function toPt(d: Dimension): number {
  return d.value * TO_PT[d.unit];
}

export function convertDimension(val: number, from: DimensionUnit, to: DimensionUnit): number {
  const pts = val * TO_PT[from];
  return Math.round((pts / TO_PT[to]) * 100) / 100;
}

/** "10.5" / "10,5" — at most two decimals, in the reader's locale. */
export function formatNumber(n: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(n);
}
