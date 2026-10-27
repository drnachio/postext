import type { BoundingBox, VDTBlock, VDTColumn } from '../vdt.js';
import { dimensionToPx } from '../units.js';
import { lineInkExtent } from './lineInk.js';
import { markInkOverhang } from '../marks/arabicMarks.js';
import { fontEm } from '../measure/vertical.js';

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

/** How far the caption, the note and the caption bar of the resource
 *  blocks among `blocks` reach past `x0` on the left and `x1` on the
 *  right, in px (0 when they stay inside): a resource set in the text
 *  with its caption in the side column (`placement.captionSide`, #729). */
export function resourceCaptionOverhang(blocks: readonly VDTBlock[], x0: number, x1: number): [number, number] {
  let left = 0;
  let right = 0;
  const take = (x: number, width: number): void => {
    left = Math.max(left, x0 - x);
    right = Math.max(right, x + width - x1);
  };
  for (const block of blocks) {
    const rb = block.resourceBlock;
    if (!rb || rb.rotation || block.hidden) continue;
    for (const line of rb.captionLines) take(line.bbox.x, line.bbox.width);
    for (const line of rb.noteLines ?? []) take(line.bbox.x, line.bbox.width);
    if (rb.captionBar) take(rb.captionBar.rect.x, rb.captionBar.rect.width);
  }
  return [left, right];
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

/** How far above its baseline, in ems of its largest font, the ink of a
 *  text line may rise: past the tallest glyph of any face in use (Bangers'
 *  `head.yMax` is 1.39 em, a Vietnamese capital with two stacked marks
 *  about 1.3 em). The clip only shows ink, so it errs on the generous side. */
const TEXT_INK_REACH_EM = 2;

/** Blocks whose lines may show ink above the column's top: text set in the
 *  flow outside any box. A box (a callout, a listing) is cut at the top. */
const OPEN_TEXT_TYPES: ReadonlySet<string> = new Set(['paragraph', 'heading', 'listItem', 'blockquote']);

/**
 * How far the glyph ink of the lines at the head of a column may reach
 * above `y0`, its top, in px (0 when none may). A line's box starts at its
 * face's ascent, and the accented capitals of a display face rise past it
 * (Bangers sets them about 0.2 em above its ascent, #826): the column clip
 * takes in what the head lines may reach, {@link TEXT_INK_REACH_EM} above
 * their baselines. Only the blocks of open text before the first other
 * visible block are looked at: a box frame at the column's top stays cut
 * there, with the text inside it.
 */
export function textInkOverhangAbove(blocks: readonly VDTBlock[], y0: number): number {
  let above = 0;
  for (const block of blocks) {
    if (block.hidden) continue;
    if (!OPEN_TEXT_TYPES.has(block.type) || block.containerId !== undefined || !block.lines) break;
    const blockEm = block.fontString ? fontEm(block.fontString) : 0;
    let any = false;
    for (const line of block.lines) {
      let em = blockEm;
      for (const seg of line.segments ?? []) if (seg.fontString) em = Math.max(em, fontEm(seg.fontString));
      const reach = y0 - (line.baseline - TEXT_INK_REACH_EM * em);
      if (reach <= 0) break;
      above = Math.max(above, reach);
      any = true;
    }
    if (!any) break;
  }
  return above;
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
 * opener set a little above the column's top (EF-139). A resource set in
 * the text with its caption in the side column (#729) widens it to take in
 * the caption, the note and the caption bar. A CJK mark hung
 * past the end of its line widens it on the right
 * (`cjk.hangingPunctuation`); `hanging` false says no line of the document
 * hangs one (its `cjk.hangingPunctuation` is `'none'`), and the lines are
 * not looked into. The column's foot stays the edge: the flow ends there,
 * and a design reaching past it is cut and reported
 * (`collectHeadingDesignCuts`). Arabic vowel marks are the exception on
 * both edges: the marks of a column's first line may rise above its top
 * and those of its last line hang under its foot (`VDTLine.markInk`,
 * #376), and the clip grows to take them in. So does the ink of the text
 * lines at the column's head, which may rise above their boxes (a display
 * face's accented capitals, #826; `textInkOverhangAbove`).
 * A box frame (a callout) is cut at the column's top as well, with the text
 * inside it. Shared by the canvas and PDF backends so both paint the same
 * thing.
 */
export function columnClipRect(col: VDTColumn, dpi: number, hanging = true): BoundingBox {
  const overhang = dimensionToPx({ value: 2, unit: 'pt' }, dpi);
  const [overlayLeft, overlayRight] = designOverlayOverhang(col.blocks, col.bbox.x, col.bbox.x + col.bbox.width);
  const [captionLeft, captionRight] = resourceCaptionOverhang(col.blocks, col.bbox.x, col.bbox.x + col.bbox.width);
  // The buffer is kept past a side caption too.
  const left = Math.max(overlayLeft, captionLeft);
  // A mark hung past the measure is shown whole.
  const right = Math.max(overlayRight, captionRight, hanging ? hangingPunctuationOverhang(col.blocks, col.bbox.x + col.bbox.width) : 0);
  const [marksAbove, marksBelow] = markInkOverhang(col.blocks, col.bbox.y, col.bbox.y + col.bbox.height);
  const above = Math.max(
    headingDesignOverhangAbove(col.blocks, col.bbox.y),
    firstBlockAbove(col.blocks, col.bbox.y),
    marksAbove,
    textInkOverhangAbove(col.blocks, col.bbox.y),
  );
  return {
    x: col.bbox.x - overhang - left,
    y: col.bbox.y - above,
    width: col.bbox.width + overhang * 2 + left + right,
    height: col.bbox.height + above + marksBelow,
  };
}
