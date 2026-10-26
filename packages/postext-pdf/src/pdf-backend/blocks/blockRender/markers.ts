// List bullets and marker runs, drop caps and strikethrough
// (#1276: split out of blockRender.ts).
import type { PDFFont, Color } from 'pdf-lib';
import { type VDTBlock, markerRuns, joinsLetters, markerSetText, type VDTDropCap } from 'postext';
import { parseFontString } from '../../../fontString.js';
import { FontCache } from '../../../fontCache.js';
import { type PageCtx, colorFromHex, drawTextPx, textAdvancePx, drawLinePx } from '../../primitives.js';
import { drawTaskBoxPx } from '../taskBox.js';
import { drawRightToLeftRun } from '../../text/rtlRun.js';
import { type StructElem, tagContent, tagArtifact } from '../../structure/tagging.js';
import { shapesAsCanvas, withinWideText } from '../../../shapingLanguage.js';

export function renderBullet(ctx: PageCtx, block: VDTBlock, fontCache: FontCache, elem: StructElem | undefined): void {
  // A task item's drawn box (#765): paths in its `Lbl`, which reads as the
  // character the box stands for.
  if (block.bulletBox) {
    tagContent(ctx, elem);
    drawTaskBoxPx(ctx, block);
    return;
  }
  if (
    !block.bulletText ||
    !block.bulletFontString ||
    block.bulletOffsetX === undefined
  ) {
    return;
  }
  const firstLine = block.lines[0];
  if (!firstLine) return;
  const font = fontCache.get(block.bulletFontString);
  if (!font) return;
  const size = parseFontString(block.bulletFontString)?.sizePx ?? 0;
  const colorHex = block.bulletColor ?? block.color;
  const color = colorFromHex(colorHex, ctx.colorSpace);

  // Canvas uses `textBaseline='middle'` at bulletY; pdf-lib draws from the
  // alphabetic baseline. Shift the baseline down by ~0.3em so the em-square
  // midline aligns at bulletY, matching canvas placement within hinting tolerance.
  // A marker set as text (a contents number) has its baseline at
  // `bulletBaselineY` (postext 1.5); `bulletY` stays its em-box midpoint.
  const baselineY = block.bulletBaselineY;
  const onBaseline = baselineY !== undefined;
  const midY = block.bulletY ?? firstLine.baseline;
  const baselinePx = onBaseline ? baselineY : midY + size * 0.3;
  tagContent(ctx, elem);
  // Ordered-list separator styled apart from the number (own font/colour),
  // with the prefix run before the number in the same style: drawn in
  // reading order, prefix, number, separator, so text extraction reads
  // （一） and not 一）（.
  const sepFontString = block.separatorText && block.separatorX !== undefined ? block.separatorFontString ?? block.bulletFontString : undefined;
  const sepFont = sepFontString !== undefined ? fontCache.get(sepFontString) : undefined;
  const sepSize = sepFontString !== undefined ? parseFontString(sepFontString)?.sizePx ?? size : size;
  const sepColor = colorFromHex(block.separatorColor ?? colorHex, ctx.colorSpace);
  const sepY = onBaseline ? baselineY : midY + sepSize * 0.3;
  // A marker of a right-to-left item reads in its direction (#664).
  const put = (text: string, x: number, y: number, f: PDFFont, s: number, c: Color): void => {
    if (block.bulletDirection) drawMarkerRuns(ctx, text, x, y, f, s, c, block.bulletDirection);
    else drawTextPx(ctx, text, x, y, f, s, c);
  };
  if (sepFont && block.prefixText && block.prefixX !== undefined) {
    put(block.prefixText, block.prefixX, sepY, sepFont, sepSize, sepColor);
  }
  put(block.bulletText, block.bulletOffsetX, baselinePx, font, size, color);
  if (sepFont && block.separatorText && block.separatorX !== undefined) {
    put(block.separatorText, block.separatorX, sepY, sepFont, sepSize, sepColor);
  }
}

/** A character past Latin-1: a text that holds one is cut into script
 *  runs by the canvas (see `shapingLanguage.ts`). */
const WIDE_MARKER_RE = /[^\u0000-\u00FF]/;

/**
 * A marker that reads right to left (`VDTBlock.bulletDirection`, #664) at
 * `xPx`, its left edge in the flow: its runs (`markerRuns`, one bidi level
 * each, in visual order from the sheet's left) stand one after the other
 * along the flow's x axis, which on a mirrored page runs from the sheet's
 * right, each as wide as the face sets it; a right-to-left run is shaped
 * so and its brackets mirrored. They are drawn in reading order, so text
 * extraction reads `1-` whatever side the hyphen stands on.
 */
function drawMarkerRuns(ctx: PageCtx, text: string, xPx: number, baselinePx: number, font: PDFFont, sizePx: number, color: Color, direction: 'rtl' | 'rtl-arabic'): void {
  const draw = (): void => {
    const runs = markerRuns(text, direction);
    if (ctx.mirror) runs.reverse();
    let at = xPx;
    const placed = runs.map((run) => {
      const x = at;
      at += textAdvancePx(font, run.text, sizePx, joinsLetters(run.text) ? 0 : ctx.trackingPx ?? 0).advance;
      return { run, x };
    });
    placed.sort((a, b) => a.run.start - b.run.start);
    for (const { run, x } of placed) {
      if (run.rtl) drawRightToLeftRun(ctx, run.text, x, baselinePx, font, sizePx, color);
      else drawTextPx(ctx, run.text, x, baselinePx, font, sizePx, color);
    }
  };
  // In a document shaped in its own language the layout measures the
  // marker, and the canvas paints it, as one text set right to left
  // (`markerSetText`, #770). A run of it with no letter is shaped there as
  // a piece of that text, not as a word of its own: when the text holds a
  // character past U+00FF (an Arabic letter or digit, the Arabic letter
  // mark before European digits read as an Arabic number) such a piece
  // has no script and takes the face's default forms. Amiri bold: `(١)`
  // is 1.501 em wide so, and 1.153 em with its brackets in Latin forms.
  if (shapesAsCanvas() && WIDE_MARKER_RE.test(markerSetText(text, direction))) withinWideText(true, draw);
  else draw();
}

/** The first line of a paragraph a drop cap opens (#623): its first
 *  `rest` characters finish the word the initial starts, and the first of
 *  its text segments reads as `prefix` (the whole word, a word space after
 *  a one-letter one) followed by its own text past them, so copying and
 *  text extraction read the word once, where the line is. `elem` is the
 *  word's `Span` in a tagged render. */
export interface CapLead {
  prefix: string;
  rest: number;
  elem?: StructElem;
}

export function dropCapLead(cap: VDTDropCap, elem: StructElem | undefined): CapLead {
  const prefix = cap.wordRest > 0 ? cap.word : `${cap.word} `;
  return { prefix, rest: cap.wordRest, ...(elem ? { elem: elem.child('Span', { actualText: prefix }) } : {}) };
}

/** A paragraph's drop cap (#623) and an opening mark hung before it, part
 *  of the paragraph's text in a tagged render, read as nothing (the first
 *  line reads the word whole, see {@link CapLead}). */
export function renderDropCap(ctx: PageCtx, cap: VDTDropCap, fontCache: FontCache, elem: StructElem | undefined): void {
  const color = colorFromHex(cap.color, ctx.colorSpace);
  const paint = (text: string, fontString: string, x: number, baseline: number): void => {
    const font = fontCache.get(fontString);
    if (!font) return;
    const size = parseFontString(fontString)?.sizePx ?? 0;
    tagContent(ctx, elem);
    drawTextPx(ctx, text, x, baseline, font, size, color, undefined, '');
  };
  if (cap.hang) paint(cap.hang.text, cap.hang.fontString, cap.hang.x, cap.hang.baselineY);
  paint(cap.text, cap.fontString, cap.x, cap.baselineY);
}

export function renderStrikethrough(ctx: PageCtx, block: VDTBlock): void {
  if (!block.strikethroughText) return;
  tagArtifact(ctx, { type: 'Layout' });
  const color = colorFromHex(block.color, ctx.colorSpace);
  const thickness = Math.max(
    1,
    block.lines[0]?.bbox.height ? block.lines[0].bbox.height * 0.05 : 1,
  );
  for (const line of block.lines) {
    const y = line.baseline - line.bbox.height * 0.28;
    drawLinePx(ctx, line.bbox.x, y, line.bbox.x + line.bbox.width, y, color, thickness);
  }
}
