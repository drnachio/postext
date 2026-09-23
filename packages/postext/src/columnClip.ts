import type { BoundingBox, VDTBlock, VDTColumn } from './vdt';
import { dimensionToPx } from './units';

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

/**
 * The rectangle a renderer clips a column's blocks to. It is the column's
 * bbox widened horizontally by a small buffer (2pt) so that glyph ink
 * extending past its advance width (the tail of an "s" at the column edge)
 * is not chopped; the gutters between columns absorb it. A block's design
 * overlay may hang past the column on purpose — a callout's corner badge
 * sits half outside its box, a heading tab juts into the margin — so the
 * clip also grows to take in every overlay block of the column. Shared by
 * the canvas and PDF backends so both paint the same thing.
 */
export function columnClipRect(col: VDTColumn, dpi: number): BoundingBox {
  const overhang = dimensionToPx({ value: 2, unit: 'pt' }, dpi);
  const [left, right] = designOverlayOverhang(col.blocks, col.bbox.x, col.bbox.x + col.bbox.width);
  return {
    x: col.bbox.x - overhang - left,
    y: col.bbox.y,
    width: col.bbox.width + overhang * 2 + left + right,
    height: col.bbox.height,
  };
}
