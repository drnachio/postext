import type { VDTLineSegment } from '../vdt';
import type { MarkCutRule } from '../measure/markCuts';
import { segmentOrientation } from '../writingMode';
import { fillFlowText, verticalPaintActive } from './verticalText';

/**
 * Paint a text segment's glyphs at `x` (its box's start) on `baseline`:
 * `fillFlowText` at `x + inkOffset`, shifted by `baselineShift`, in the
 * orientation its author forced down a vertical line (`tcy` /
 * `orientation`), and stretched along the line by `inkScale` when the
 * segment carries one (a dash of a Chinese 破折号, see
 * `VDTLineSegment.inkScale`). Down a vertical line a dash takes its
 * vertical form instead, and the stretch is never applied there.
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
  if (seg.inkScale === undefined || verticalPaintActive()) {
    fillFlowText(ctx, seg.text, px, py, 'fill', undefined, cuts, segmentOrientation(seg));
    return;
  }
  ctx.save();
  ctx.translate(px, py);
  ctx.scale(seg.inkScale, 1);
  fillFlowText(ctx, seg.text, 0, 0, 'fill', undefined, cuts);
  ctx.restore();
}
