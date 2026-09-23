import type { Color, PDFFont } from 'pdf-lib';
import type { VDTChip, VDTChipRun } from 'postext';
import { parseFontString } from '../fontString';
import type { FontCache } from '../fontCache';
import { type PageCtx, drawChipBoxPx, drawTextPx } from './primitives';
import { tagArtifact, tagContent, type StructElem } from './tagging';

/**
 * Inline chip (`:chip[…]`): the box, flagged as a layout artifact in a
 * tagged render, then the words as real text joining `elem` — selectable
 * and read in order with the rest of the line. Without `elem` the drawing
 * joins whatever sequence is open. Shared with the resource-line painter.
 */
export function paintChip(
  ctx: PageCtx,
  chip: VDTChip,
  xPx: number,
  baselinePx: number,
  fontCache: FontCache,
  fallbackFont: PDFFont,
  fallbackSize: number,
  elem: StructElem | undefined,
  colorFor: (run: VDTChipRun) => Color,
): void {
  if (elem) tagArtifact(ctx, { type: 'Layout' });
  drawChipBoxPx(ctx, chip, xPx, baselinePx);
  tagContent(ctx, elem);
  let tx = xPx + chip.marginLeft + chip.borderWidth + chip.paddingX;
  for (const run of chip.runs) {
    const font = fontCache.get(run.fontString) ?? fallbackFont;
    const size = parseFontString(run.fontString)?.sizePx ?? fallbackSize;
    drawTextPx(ctx, run.text, tx, baselinePx + (run.baselineShift ?? 0), font, size, colorFor(run));
    tx += run.width;
  }
}
