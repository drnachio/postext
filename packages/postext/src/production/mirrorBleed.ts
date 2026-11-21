/**
 * Mirror bleed: the design is drawn only a margin past the trim, and the
 * rest of the bleed (a case's turn-in, the board edge) is the design's
 * edge reflected outward. Along each side, the strip the margin leaves
 * between the trim and the end of the design is folded out again and
 * again, as a strip of paper: reflected, then copied, then reflected…, as
 * far as the sheet goes. In a corner both sides fold, which turns the
 * corner half a turn (the mirror of the mirror) instead of meeting in a
 * cross. Only the perimeter is filled: inner folds (the spine, the flaps)
 * keep the design itself.
 */

import type { SheetRect } from './geometry.js';

/** One band of an axis, `from` to `to` mm, and the map that fills it from
 *  the design: `x' = scale · x + shift`. */
export interface MirrorBand {
  from: number;
  to: number;
  scale: 1 | -1;
  shift: number;
}

/** How far each band's clip reaches past its edges, mm. */
const SEAM = 0.1;

/** The most bands a side folds into. */
const MAX_BANDS = 64;

/** An axis cut into bands: the design's own, from `start − margin` to
 *  `end + margin` (the trim's edges and the margin past them, within the
 *  sheet), and the folded bands before and after it out to 0 and
 *  `sheetEnd`. */
export function mirrorBands(start: number, end: number, sheetEnd: number, margin: number): { designed: [number, number]; before: MirrorBand[]; after: MirrorBand[] } {
  const d = Math.max(0.5, margin);
  const a = Math.max(0, start - d);
  const b = Math.min(sheetEnd, end + d);
  const before: MirrorBand[] = [];
  for (let i = 1; i <= MAX_BANDS && a - (i - 1) * d > 1e-6; i++) {
    const to = a - (i - 1) * d;
    before.push({
      from: Math.max(0, a - i * d),
      to,
      // An odd band reflects the strip about its own edge: x' = 2a − (i − 1)d − x.
      ...(i % 2 === 1 ? { scale: -1 as const, shift: 2 * a - (i - 1) * d } : { scale: 1 as const, shift: -i * d }),
    });
  }
  const after: MirrorBand[] = [];
  for (let i = 1; i <= MAX_BANDS && b + (i - 1) * d < sheetEnd - 1e-6; i++) {
    const from = b + (i - 1) * d;
    after.push({
      from,
      to: Math.min(sheetEnd, b + i * d),
      ...(i % 2 === 1 ? { scale: -1 as const, shift: 2 * b + (i - 1) * d } : { scale: 1 as const, shift: i * d }),
    });
  }
  return { designed: [a, b], before, after };
}

const n = (v: number): string => String(Math.round(v * 1000) / 1000);

/**
 * The mirror bleed of a sheet `width` × `height` mm whose trim is `trim`:
 * an SVG in mm that paints `content` (SVG of the sheet's background and
 * movable elements, in sheet mm) folded into every band past the design
 * margin, each band clipped to itself. Undefined when the design margin
 * reaches the sheet's edge on every side (nothing to fill). `defs` are
 * the clip paths `content` uses.
 */
export function mirrorBleedSvg(
  sheet: { width: number; height: number; trim: SheetRect },
  margin: number,
  content: string,
  defs = '',
): { svg: string; designed: SheetRect } | undefined {
  const t = sheet.trim;
  const xs = mirrorBands(t.x, t.x + t.width, sheet.width, margin);
  const ys = mirrorBands(t.y, t.y + t.height, sheet.height, margin);
  if (xs.before.length + xs.after.length + ys.before.length + ys.after.length === 0) return undefined;
  const centreX: MirrorBand = { from: xs.designed[0], to: xs.designed[1], scale: 1, shift: 0 };
  const centreY: MirrorBand = { from: ys.designed[0], to: ys.designed[1], scale: 1, shift: 0 };
  const clips: string[] = [];
  const uses: string[] = [];
  for (const bx of [...xs.before, centreX, ...xs.after]) {
    for (const by of [...ys.before, centreY, ...ys.after]) {
      if (bx === centreX && by === centreY) continue;
      const id = `mb${clips.length}`;
      // Each band a tenth of a millimetre wider all round: next to a seam
      // both bands show the same point of the design, and the overlap
      // keeps a hairline from opening between them.
      clips.push(`<clipPath id="${id}" clipPathUnits="userSpaceOnUse"><rect x="${n(bx.from - SEAM)}" y="${n(by.from - SEAM)}" width="${n(bx.to - bx.from + 2 * SEAM)}" height="${n(by.to - by.from + 2 * SEAM)}"/></clipPath>`);
      uses.push(`<g clip-path="url(#${id})"><g transform="matrix(${bx.scale} 0 0 ${by.scale} ${n(bx.shift)} ${n(by.shift)})"><use href="#mirror-content"/></g></g>`);
    }
  }
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${n(sheet.width)}mm" height="${n(sheet.height)}mm" viewBox="0 0 ${n(sheet.width)} ${n(sheet.height)}">`
    + `<defs>${defs}${clips.join('')}<g id="mirror-content">${content}</g></defs>`
    + uses.join('')
    + '</svg>';
  return {
    svg,
    designed: { x: xs.designed[0], y: ys.designed[0], width: xs.designed[1] - xs.designed[0], height: ys.designed[1] - ys.designed[0] },
  };
}
