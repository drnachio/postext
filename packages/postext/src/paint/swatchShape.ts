/**
 * The geometry of an inline colour swatch with a shape of its own
 * (`:swatch{size=… border=… radius=… gap=…}`, #1104), shared by the
 * canvas, HTML and PDF painters so the three draw one square. A swatch
 * without one keeps the square each painter has always drawn.
 */

import type { VDTSwatch } from '../vdt.js';

/** Whether a swatch segment carries a shape of its own. */
export function hasSwatchShape(swatch: VDTSwatch): boolean {
  return swatch.side !== undefined || swatch.borderWidth !== undefined || swatch.borderColor !== undefined || swatch.radius !== undefined;
}

/** Where a shaped swatch's square sits (px, top-down): its top-left
 *  corner, side, outline width and corner radius. */
export interface SwatchGeometry {
  x: number;
  y: number;
  side: number;
  stroke: number;
  radius: number;
}

/** The square of a swatch segment `width` px wide at `x` on `baseline`:
 *  `side` wide (the whole width when unset), standing on the baseline, at
 *  the segment's start, or at its end when it is set right to left (the
 *  gap after the square on its left). The outline is 6 % of the side, at
 *  least half a pixel, unless the swatch sets its own. */
export function swatchGeometry(swatch: VDTSwatch, x: number, baseline: number, width: number, rtl: boolean): SwatchGeometry {
  const side = Math.min(swatch.side ?? width, width);
  const stroke = Math.min(swatch.borderWidth ?? Math.max(0.5, side * 0.06), side / 2);
  return {
    x: rtl ? x + width - side : x,
    y: baseline - side,
    side,
    stroke,
    radius: Math.min(swatch.radius ?? 0, side / 2),
  };
}
