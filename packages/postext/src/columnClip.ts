import type { BoundingBox, VDTBlock, VDTColumn } from './vdt';
import { dimensionToPx } from './units';
import { lineInkExtent } from './lineInk';

/** How far the design overlays of `blocks` reach past `x0` on the left and
 *  `x1` on the right, in px (0 when they stay inside). */
export function designOverlayOverhang(blocks: readonly VDTBlock[], x0: number, x1: number): [number, number] {
  let left = 0;
  let right = 0;
  for (const block of blocks) {
    if (!block.designOverlay || block.hidden) continue;
    for (const b of block.designOverlay.blocks) {
      left = Math.max(left, x0 - b.bbox.x);
      right = Math.max(right, b.bbox.x + b.bbox.width - x1);
    }
  }
  return [left, right];
}

/** How far the marks hung past the end of their lines
 *  (`cjk.hangingPunctuation`) in `blocks` reach past `x1`, in px (0 when
 *  none does). Only the CJK composer hangs a mark, so no other line is
 *  looked into. */
export function hangingPunctuationOverhang(blocks: readonly VDTBlock[], x1: number): number {
  let right = 0;
  for (const block of blocks) {
    if (block.hidden || !block.lines) continue;
    for (const line of block.lines) {
      if (!line.cjkComposed) continue;
      const segments = line.segments;
      if (!segments || !segments[segments.length - 1]?.hangs) continue;
      const { hang } = lineInkExtent(line, 0);
      right = Math.max(right, line.bbox.x + line.bbox.width + hang - x1);
    }
  }
  return right;
}

/** How far the design overlays of the heading blocks among `blocks` reach
 *  above `y0`, in px (0 when they stay below it). */
export function headingDesignOverhangAbove(blocks: readonly VDTBlock[], y0: number): number {
  let above = 0;
  for (const block of blocks) {
    if (block.type !== 'heading' || !block.designOverlay || block.hidden) continue;
    for (const b of block.designOverlay.blocks) above = Math.max(above, y0 - b.bbox.y);
  }
  return above;
}

/** How far the first block of a column starts above `y0`, in px (0 when it
 *  does not, and for a box frame, which is cut at the column's top). The
 *  first block of a column under a page-span opener may sit up to a line
 *  above the column's top, level with the first block under the opener in
 *  the opener's column, while the column itself starts on the grid
 *  (EF-139). */
function firstBlockAbove(blocks: readonly VDTBlock[], y0: number): number {
  const first = blocks.find((b) => !b.hidden);
  if (!first?.bbox || first.type === 'callout') return 0;
  return Math.max(0, y0 - first.bbox.y);
}

/**
 * The rectangle a renderer clips a column's blocks to. It is the column's
 * bbox widened horizontally by a small buffer (2pt) so that glyph ink
 * extending past its advance width (the tail of an "s" at the column edge)
 * is not chopped; the gutters between columns absorb it. A block's design
 * overlay may hang past the column on purpose — a callout's corner badge
 * sits half outside its box, a heading tab juts into the margin — so the
 * clip also grows to take in every overlay block of the column. A heading's
 * design may also reach above the column — a band anchored to the top of
 * the page or of the bleed — and the clip grows up to take that in too
 * (EF-113), and so does the first block of a column under a page-span
 * opener set a little above the column's top (EF-139). A CJK mark hung
 * past the end of its line widens it on the right
 * (`cjk.hangingPunctuation`); `hanging` false says no line of the document
 * hangs one (its `cjk.hangingPunctuation` is `'none'`), and the lines are
 * not looked into. The column's foot stays the edge: the flow ends there,
 * and a design reaching past it is cut and reported
 * (`collectHeadingDesignCuts`).
 * A box frame (a callout) is cut at the column's top as well, with the text
 * inside it. Shared by the canvas and PDF backends so both paint the same
 * thing.
 */
export function columnClipRect(col: VDTColumn, dpi: number, hanging = true): BoundingBox {
  const overhang = dimensionToPx({ value: 2, unit: 'pt' }, dpi);
  const [left, overlayRight] = designOverlayOverhang(col.blocks, col.bbox.x, col.bbox.x + col.bbox.width);
  // A mark hung past the measure is shown whole.
  const right = Math.max(overlayRight, hanging ? hangingPunctuationOverhang(col.blocks, col.bbox.x + col.bbox.width) : 0);
  const above = Math.max(headingDesignOverhangAbove(col.blocks, col.bbox.y), firstBlockAbove(col.blocks, col.bbox.y));
  return {
    x: col.bbox.x - overhang - left,
    y: col.bbox.y - above,
    width: col.bbox.width + overhang * 2 + left + right,
    height: col.bbox.height + above,
  };
}
