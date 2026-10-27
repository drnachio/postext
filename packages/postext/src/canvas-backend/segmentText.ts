import type { VDTLineSegment } from '../vdt.js';
import type { MarkCutRule } from '../measure/cjk/markCuts.js';
import { hasCJK } from '../measure/cjk/cjk.js';
import { segmentOrientation } from '../writing/writingMode.js';
import { fillFlowText, verticalPaintActive } from './verticalText.js';
import { fillTrackedWord } from './trackedText.js';
import { inSegmentLanguage } from './wordRuns.js';
import { letterSpacingOf, restoreContext, saveContext } from './contextState.js';
import { fillContextText } from './contextText.js';
import { fillCellRuns } from './cellText.js';

/**
 * Paint `text` of a line set word by word (not `VDTLine.cjkComposed`) on
 * a horizontal page: `ctx.fillText`, as the canvas painted every line
 * before the CJK features, unless the text holds CJK characters, whose
 * marks that meet are then painted apart where the line was measured apart
 * (`fillFlowText` under the `'words'` rule, see `markCuts`). Text with no
 * CJK is never cut under that rule, so it costs one `hasCJK` test.
 */
export function fillWordsText(ctx: CanvasRenderingContext2D, text: string, x: number, baseline: number): void {
  if (hasCJK(text)) fillFlowText(ctx, text, x, baseline, 'fill', undefined, 'words');
  else fillContextText(ctx, text, x, baseline);
}

/**
 * Paint a text segment's glyphs at `x` (its box's start) on `baseline`:
 * `fillFlowText` at `x + inkOffset`, shifted by `baselineShift`, in the
 * orientation its author forced down a vertical line (`tcy` /
 * `orientation`), and stretched along the line by `inkScale` when the
 * segment carries one (a dash of a Chinese 破折号, see
 * `VDTLineSegment.inkScale`). Down a vertical line such a dash is painted
 * turned with the frame (sideways), so the stretch runs down the column
 * and the pair prints as one rule.
 */
export function fillSegmentText(
  ctx: CanvasRenderingContext2D,
  seg: VDTLineSegment,
  x: number,
  baseline: number,
  cuts: MarkCutRule,
): void {
  // In the segment's own language when it names one, as a word of a line
  // set word by word is (`fillSegmentWord`): the composer measured it so.
  inSegmentLanguage(ctx, seg, () => fillSegmentGlyphs(ctx, seg, x, baseline, cuts));
}

function fillSegmentGlyphs(
  ctx: CanvasRenderingContext2D,
  seg: VDTLineSegment,
  x: number,
  baseline: number,
  cuts: MarkCutRule,
): void {
  const px = x + (seg.inkOffset ?? 0);
  const py = baseline + (seg.baselineShift ?? 0);
  if (seg.inkScale === undefined) {
    // A Western run of a tracked line of the CJK composer keeps its
    // ligatures, as it was measured (#703). Down a vertical line the
    // vertical painter does it for each sideways run.
    const tracking = !verticalPaintActive() && !seg.rtl && !hasCJK(seg.text) ? letterSpacingOf(ctx) : 0;
    if (tracking !== 0) fillTrackedWord(ctx, seg.text, px, py, tracking, (piece, x, y) => fillFlowText(ctx, piece, x, y, 'fill', undefined, cuts));
    // The cells of a line of the composer where it measured them, one by
    // one: cut where the browser would kern a kana against its neighbour
    // (#770, `cellText.ts`).
    else if (cuts !== 'composed' || verticalPaintActive() || seg.rtl || !fillCellRuns(ctx, seg.text, px, py, (run, x, y) => fillContextText(ctx, run, x, y))) {
      fillFlowText(ctx, seg.text, px, py, 'fill', undefined, cuts, segmentOrientation(seg));
    }
    return;
  }
  saveContext(ctx);
  ctx.translate(px, py);
  ctx.scale(seg.inkScale, 1);
  fillFlowText(ctx, seg.text, 0, 0, 'fill', undefined, cuts, verticalPaintActive() ? 'sideways' : undefined);
  restoreContext(ctx);
}
