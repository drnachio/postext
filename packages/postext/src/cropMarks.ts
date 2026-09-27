import type { ResolvedPageConfig } from './types';
import { dimensionToPx } from './units';

/** One crop mark, in page px: a line on the prolongation of a trim edge,
 *  from its end nearer the trim (`x1`, `y1`) outwards (`x2`, `y2`). */
export interface CropMarkSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/**
 * The crop marks of a page laid out with `page.cutLines` on: two at each
 * trim corner, one on each trim edge's line, `markLength` long. A mark
 * starts `markOffset` outside the trim, or at the bleed edge when the bleed
 * is wider, so it never lies over art that runs into the bleed. The sheet
 * grows by `bleed + markOffset + markLength` on every side, so a mark never
 * runs past it. Empty when cut lines are off. The canvas and PDF backends
 * draw these.
 *
 * `trimOffset` is how far the trim box sits inside the sheet: pass the
 * document's `doc.trimOffset`, which also places the PDF's `TrimBox`, so
 * the marks and the box can never disagree. Left out, it is worked out
 * from `cutLines` as the layout does.
 */
export function cropMarkSegments(
  page: { width: number; height: number },
  pageConfig: Pick<ResolvedPageConfig, 'cutLines' | 'dpi'>,
  trimOffset?: number,
): CropMarkSegment[] {
  const { cutLines, dpi } = pageConfig;
  if (!cutLines.enabled) return [];
  const bleed = dimensionToPx(cutLines.bleed, dpi);
  const offset = dimensionToPx(cutLines.markOffset, dpi);
  const length = dimensionToPx(cutLines.markLength, dpi);
  // The trim box sits this far inside the sheet (see `computePageMetrics`).
  const inset = trimOffset ?? bleed + offset + length;
  const left = inset;
  const top = inset;
  const right = page.width - inset;
  const bottom = page.height - inset;
  const start = Math.max(bleed, offset);
  const end = start + length;
  const segments: CropMarkSegment[] = [];
  for (const [x, y] of [[left, top], [right, top], [left, bottom], [right, bottom]] as const) {
    const h = x === left ? -1 : 1;
    const v = y === top ? -1 : 1;
    segments.push({ x1: x + h * start, y1: y, x2: x + h * end, y2: y });
    segments.push({ x1: x, y1: y + v * start, x2: x, y2: y + v * end });
  }
  return segments;
}
