import type { Color, PDFFont } from 'pdf-lib';
import { formNumberStyle, numberFieldText, type VDTChip, type VDTChipRun } from 'postext';
import { parseFontString } from '../../fontString.js';
import type { FontCache } from '../../fontCache.js';
import { type PageCtx, drawChipBoxPx, drawLinePx, drawTextDotsPx, drawTextPx, invisibleText } from '../primitives.js';
import { tagArtifact, tagContent, type StructElem } from '../structure/tagging.js';
import { drawRightToLeftRun } from '../text/rtlRun.js';
import { paintChipReadings } from '../text/annotations.js';
import { sheetRect } from './blockRender/segments.js';
import { textAdvancePx } from '../primitives/shapedRuns.js';

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
  // The lines through its struck-through words (`~~…~~`), drawn with the
  // box: a layout artifact, the words stay plain text.
  if (!chip.blank) drawChipStrikesPx(ctx, chip, xPx, baselinePx, colorFor);
  // The readings of its ruby words, over a blank too (#1244).
  if (chip.readings && chip.runs[0]) {
    tagContent(ctx, elem);
    paintChipReadings(ctx, chip.readings, xPx + chip.marginLeft, baselinePx, colorFor(chip.runs[0]), fontCache, fallbackFont);
  }
  // A blank's answer is laid out, never painted (#1227): the box alone.
  if (chip.blank) return;
  // A form field (#1445): the box, and the field's widget on it holding the
  // words as its value. In a print standard the words are painted.
  if (chip.field && ctx.forms) {
    const { scale, pageHeightPt } = ctx;
    const left = xPx + chip.marginLeft, top = baselinePx - chip.ascent;
    const rect = sheetRect(ctx, [left * scale, pageHeightPt - (baselinePx + chip.descent) * scale, (left + chip.boxWidth) * scale, pageHeightPt - top * scale]);
    ctx.forms.add(ctx.page, rect, chip.field, chip.runs.map((r) => r.text).join('').trim(), (chip.field.sizePx ?? fallbackSize) * scale, chip.field.fontString ?? chip.runs[0]?.fontString);
    return;
  }
  tagContent(ctx, elem);
  // A number field painted for print (#1445): its value in the field's
  // format, set to the box's end, as the form and the canvas show it.
  const first = chip.runs[0];
  const shown = first ? numberFieldText(chip.field, chip.runs.map((r) => r.text).join(''), ctx.fieldNumbers ?? formNumberStyle(undefined, undefined)) : undefined;
  if (first && shown !== undefined) {
    const font = fontCache.get(first.fontString) ?? fallbackFont;
    const size = parseFontString(first.fontString)?.sizePx ?? fallbackSize;
    const end = xPx + chip.marginLeft + chip.boxWidth - chip.borderWidth - (chip.field?.padPx ?? chip.paddingX);
    drawTextPx(ctx, shown, end - textAdvancePx(font, shown, size).advance, baselinePx, font, size, colorFor(first));
    return;
  }
  paintChipRuns(ctx, chip, xPx, baselinePx, fontCache, fallbackFont, fallbackSize, colorFor);
}

/** The lines through a chip's struck-through words (`VDTChip.strikes`),
 *  in the colour of its first run. */
export function drawChipStrikesPx(ctx: PageCtx, chip: VDTChip, xPx: number, baselinePx: number, colorFor: (run: VDTChipRun) => Color): void {
  if (!chip.strikes || !chip.runs[0]) return;
  const textX = xPx + chip.marginLeft + chip.borderWidth + chip.paddingX;
  const color = colorFor(chip.runs[0]);
  for (const s of chip.strikes) drawLinePx(ctx, textX + s.x, baselinePx + s.y, textX + s.x + s.length, baselinePx + s.y, color, s.thickness);
}

/**
 * The words of a chip (its runs, in paint order), from the segment's left
 * edge `xPx` on the baseline, joining whatever sequence is open. Text
 * extraction reads `actualText` over each run when it is given (`''` for a
 * silent block). Used by {@link paintChip} and by the design text painter,
 * which tags the box itself (#1162).
 */
export function paintChipRuns(
  ctx: PageCtx,
  chip: VDTChip,
  xPx: number,
  baselinePx: number,
  fontCache: FontCache,
  fallbackFont: PDFFont,
  fallbackSize: number,
  colorFor: (run: VDTChipRun) => Color,
  actualText?: string,
): void {
  let tx = xPx + chip.marginLeft + chip.borderWidth + chip.paddingX;
  // The runs in the chip's paint order (`VDTChip.order`), a right-to-left
  // one shaped so.
  const order = chip.order && chip.order.length === chip.runs.length ? chip.order : undefined;
  for (let k = 0; k < chip.runs.length; k++) {
    const run = chip.runs[order ? order[k]! : k]!;
    const font = fontCache.get(run.fontString) ?? fallbackFont;
    const size = parseFontString(run.fontString)?.sizePx ?? fallbackSize;
    const y = baselinePx + (run.baselineShift ?? 0);
    const color = colorFor(run);
    // Letters to trace (#1017): the dots, the text invisible under them.
    const outline = chip.dotted && drawTextDotsPx(ctx, run.text, tx, y, run.fontString, chip.dotted, color, run.rtl === true) ? invisibleText(color) : undefined;
    if (run.rtl && actualText !== undefined) drawTextPx(ctx, run.text, tx, y, font, size, color, outline, actualText, undefined, 'rtl');
    else if (run.rtl) drawRightToLeftRun(ctx, run.text, tx, y, font, size, color, outline);
    else drawTextPx(ctx, run.text, tx, y, font, size, color, outline, actualText);
    tx += run.width;
  }
}
