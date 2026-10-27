// Moving a laid-out box and its blocks to their place on the page, the
// logical sides of a box, and the line insets its text gets beside the
// rectangles it runs round (#1276: split out of calloutLayout.ts).
import { type ResolvedResourceBlock, type VDTBlock, type VDTDesignBlock, createBoundingBox, type VDTExclusionContour } from '../../../vdt.js';
import { contourInsetSteps } from '../../../contour/index.js';
import { shiftLineX, getMeasureDirection } from '../../../measure/rtl/bidiLines.js';
import type { LineInsetStep } from '../../../measure/types.js';
import { offsetPathBlock } from '../../../design/pathBlock.js';
import type { CalloutLayoutResult } from './inputs.js';

/** Shift a resolved resource block's caption/table geometry by `(ox, oy)`. */
export function offsetResourceBlock(rb: ResolvedResourceBlock, ox: number, oy: number): void {
  // A block set upright in a turned frame (#960) keeps its geometry in its
  // own frame; only that frame's origin moves.
  if (rb.rotation) {
    rb.rotation.originX += ox;
    rb.rotation.originY += oy;
    return;
  }
  for (const ln of rb.captionLines) { ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy; }
  for (const ln of rb.noteLines) { ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy; }
  for (const ln of rb.continuesLines) { ln.bbox.x += ox; ln.bbox.y += oy; ln.baseline += oy; }
  if (rb.captionBar) { rb.captionBar.rect.x += ox; rb.captionBar.rect.y += oy; }
  if (rb.table) {
    for (const cell of rb.table.cells) {
      cell.rect.x += ox; cell.rect.y += oy;
      if (cell.image) { cell.image.rect.x += ox; cell.image.rect.y += oy; }
      for (const cl of cell.lines) { cl.bbox.x += ox; cl.bbox.y += oy; cl.baseline += oy; }
    }
  }
}

/** Shift one block (lines, bullet, resource geometry) by `(ox, oy)`. */
export function offsetBlock(blk: VDTBlock, ox: number, oy: number): void {
  blk.bbox.x += ox;
  blk.bbox.y += oy;
  for (const line of blk.lines) {
    shiftLineX(line, ox);
    line.bbox.y += oy;
    line.baseline += oy;
  }
  if (blk.bulletOffsetX !== undefined) blk.bulletOffsetX += ox;
  if (blk.separatorX !== undefined) blk.separatorX += ox;
  if (blk.prefixX !== undefined) blk.prefixX += ox;
  if (blk.bulletY !== undefined) blk.bulletY += oy;
  if (blk.bulletBaselineY !== undefined) blk.bulletBaselineY += oy;
  if (blk.dropCap) {
    blk.dropCap.x += ox;
    blk.dropCap.baselineY += oy;
    if (blk.dropCap.hang) {
      blk.dropCap.hang.x += ox;
      blk.dropCap.hang.baselineY += oy;
    }
  }
  if (blk.resourceBlock) offsetResourceBlock(blk.resourceBlock, ox, oy);
  // A nested box's frame carries its decoration on the overlay.
  if (blk.designOverlay) {
    blk.designOverlay.bbox.x += ox;
    blk.designOverlay.bbox.y += oy;
    for (const b of blk.designOverlay.blocks) offsetDesignBlock(b, ox, oy);
  }
}

/** Shift one block of a design slot by `(ox, oy)`. */
export function offsetDesignBlock(b: VDTDesignBlock, ox: number, oy: number): void {
  // A vector shape (#1055): its box, outline and markers.
  if (b.kind === 'path') {
    offsetPathBlock(b, ox, oy);
    return;
  }
  b.bbox.x += ox;
  b.bbox.y += oy;
  if (b.kind === 'text') {
    for (const line of b.lines) line.baselineY += oy;
  }
  if (b.kind === 'box' && b.clip) {
    b.clip.x += ox;
    b.clip.y += oy;
  }
}

/** Move a laid-out callout from frame-relative to absolute page coordinates
 *  with the frame's top-left at `(x, y)`. */
export function offsetCalloutToAbsolute(result: CalloutLayoutResult, x: number, y: number): void {
  const { frame } = result;
  frame.bbox = createBoundingBox(x, y, result.width, result.totalHeight);
  if (frame.designOverlay) {
    frame.designOverlay.bbox.x += x;
    frame.designOverlay.bbox.y += y;
    for (const b of frame.designOverlay.blocks) offsetDesignBlock(b, x, y);
  }
  for (const child of result.children) offsetBlock(child, x, y);
}

/**
 * Reads a box's `'start'` / `'end'` sides (#371) as flow sides: `'left'` /
 * `'right'` for a box that runs with the document, the other way round for
 * one set against it (`direction`, the box's own). Any other side is kept.
 */
export function logicalSides(direction: 'ltr' | 'rtl' | undefined): <T extends string>(side: T | 'start' | 'end') => Exclude<T, 'start' | 'end'> | 'left' | 'right' {
  const turned = direction !== undefined && direction !== getMeasureDirection();
  return <T extends string>(side: T | 'start' | 'end') => {
    if (side === 'start') return turned ? 'right' : 'left';
    if (side === 'end') return turned ? 'left' : 'right';
    return side as Exclude<T, 'start' | 'end'>;
  };
}

/** A rectangle a box's text runs round (`CalloutLayoutInput.exclusions`),
 *  with the shape inside it a contour wrap runs round (#883). */
export interface BoxExclusion {
  x: number;
  y: number;
  width: number;
  height: number;
  contour?: VDTExclusionContour;
}

/** The line insets of a text set from `y0` in `[x, x + width]` with lines
 *  `lineHeight` apart, beside the rectangles of `exclusions` (#855): a line
 *  that meets one, even in part, is set short on the side the rectangle
 *  covers (the wider side left free when it stands inside the measure). */
export function exclusionInsets(
  exclusions: readonly BoxExclusion[],
  x: number,
  width: number,
  y0: number,
  lineHeight: number,
): LineInsetStep[] {
  const steps: LineInsetStep[] = [];
  if (!(lineHeight > 0)) return steps;
  const right = x + width;
  for (const ex of exclusions) {
    const exRight = ex.x + ex.width;
    if (exRight <= x + 0.01 || ex.x >= right - 0.01) continue;
    const bottom = ex.y + ex.height;
    if (bottom <= y0 + 0.01) continue;
    const from = Math.max(0, Math.floor((ex.y - y0 + 0.01) / lineHeight));
    const to = Math.ceil((bottom - y0 - 0.01) / lineHeight) - 1;
    if (to < from) continue;
    const roomLeft = ex.x - x;
    const roomRight = right - exRight;
    const coversLeft = roomLeft <= roomRight;
    if (ex.contour) {
      // A contour (#883): each line as short as the shape is wide beside it.
      steps.push(...contourInsetSteps(ex.contour, coversLeft ? 'left' : 'right', x, width, y0, lineHeight, from, to));
      continue;
    }
    steps.push({
      fromLine: from,
      toLine: to,
      startInsetPx: coversLeft ? Math.min(width, exRight - x) : 0,
      endInsetPx: coversLeft ? 0 : Math.min(width, right - ex.x),
    });
  }
  return steps;
}
