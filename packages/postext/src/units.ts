import type { Dimension } from './types';

/**
 * Convert a Dimension to pixels at a given DPI.
 *
 * For relative units (em, rem) the caller must supply baseFontSizePx —
 * the resolved font-size of the element the dimension is relative to.
 */
export function dimensionToPx(
  dim: Dimension,
  dpi: number,
  baseFontSizePx?: number,
): number {
  switch (dim.unit) {
    case 'cm':
      return (dim.value / 2.54) * dpi;
    case 'mm':
      return (dim.value / 25.4) * dpi;
    case 'in':
      return dim.value * dpi;
    case 'pt':
      return (dim.value / 72) * dpi;
    case 'px':
      return dim.value;
    case 'em':
    case 'rem':
      if (baseFontSizePx === undefined) {
        throw new Error(
          `dimensionToPx: baseFontSizePx is required for unit "${dim.unit}"`,
        );
      }
      return dim.value * baseFontSizePx;
  }
}
