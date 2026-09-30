import type { VDTLineSegment } from '../vdt';
import type { MarkCutRule } from '../measure/markCuts';
import { hasCJK } from '../measure/cjk';
import { segmentOrientation } from '../writingMode';
import { fillFlowText, verticalPaintActive } from './verticalText';

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
  else ctx.fillText(text, x, baseline);
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
  const px = x + (seg.inkOffset ?? 0);
  const py = baseline + (seg.baselineShift ?? 0);
  if (seg.inkScale === undefined) {
    fillFlowText(ctx, seg.text, px, py, 'fill', undefined, cuts, segmentOrientation(seg));
    return;
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(seg.inkScale, 1);
  fillFlowText(ctx, seg.text, 0, 0, 'fill', undefined, cuts, verticalPaintActive() ? 'sideways' : undefined);
  ctx.restore();
}
