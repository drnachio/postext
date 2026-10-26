// Text objects and their /ActualText spans, the text state of a line,
// CJK line text and compressed mark spacing (#1276: split out of primitives.ts).
import { type PDFFont, type Color, setTextMatrix, setTextRenderingMode, TextRenderingMode, setStrokingColor, setLineWidth, PDFOperator, setFontAndSize, pushGraphicsState, beginText, setFillingColor, endText, popGraphicsState, PDFHexString, PDFOperatorNames, PDFName } from 'pdf-lib';
import { fileRuns } from '../../faceFiles.js';
import type { PageCtx, TextOutline } from '../primitives.js';
import { opt, alphaStateOp, alphaOf } from './color.js';
import { fontKeyOn } from './measuredText.js';
import { shownRun } from './shapedRuns.js';
import type { TextShow } from './textShows.js';

/**
 * The operators pdf-lib's `drawText` emits, around the show-text operators
 * of a text: one, or one per file of a face made of several (each after
 * its own `Tf`; the pen carries over). With `actualText` the show-text
 * operators sit in a `/Span` marked-content sequence whose `/ActualText` is
 * that text (PDF 1.7 §14.9.4), inside the text object, where readers expect
 * it: copying, text extraction and assistive technology read it instead of
 * the glyphs. The span has no MCID, so in a tagged PDF it nests in the
 * structure sequence open around it.
 *
 * On a mirrored page (`ctx.mirror`) the text matrix turns the glyphs back
 * about the run's box, `[xPx, xPx + advancePx]` (`advancePx`, else the
 * advance {@link drawTextPx} measured): the pen starts at the box's right
 * edge and runs leftwards in the flow, which the page's mirror shows
 * left to right on the sheet.
 */
export function pushTextObject(
  ctx: PageCtx,
  shows: readonly TextShow[],
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  outline?: TextOutline,
  actualText?: string,
  advancePx?: number,
): void {
  const { scale, pageHeightPt } = ctx;
  outline ??= ctx.textOutline;
  const textMatrix = ctx.mirror
    ? setTextMatrix(-1, 0, 0, 1, (xPx + (advancePx ?? ctx.runAdvancePx ?? 0)) * scale, pageHeightPt - baselinePx * scale)
    : setTextMatrix(1, 0, 0, 1, xPx * scale, pageHeightPt - baselinePx * scale);
  // Text render mode 2 fills then strokes the glyphs; mode 1 only strokes.
  const outlineOps = outline?.invisible
    ? [setTextRenderingMode(TextRenderingMode.Invisible)]
    : outline && outline.widthPx > 0
      ? [
          setStrokingColor(outline.color),
          setLineWidth(outline.widthPx * scale),
          setTextRenderingMode(outline.hollow ? TextRenderingMode.Outline : TextRenderingMode.FillAndOutline),
        ]
      : [];
  // The first show's font is set with the text matrix; each later show in
  // another file of the face switches to it.
  const first = shows[0]?.font ?? font;
  const body: PDFOperator[] = [];
  let current = first;
  for (const show of shows) {
    if (show.font !== current) {
      body.push(setFontAndSize(fontKeyOn(ctx.page, show.font), sizePx * scale));
      current = show.font;
    }
    body.push(show.op);
  }
  // The operators pdf-lib's `drawText` emits, with the encoding cached.
  ctx.page.pushOperators(
    pushGraphicsState(),
    // The outline's own alpha is the stroke alpha of the glyphs.
    ...opt(alphaStateOp(ctx, alphaOf(color), outlineOps.length > 0 ? alphaOf(outline!.color) : 1)),
    ...outlineOps,
    beginText(),
    setFillingColor(color),
    setFontAndSize(fontKeyOn(ctx.page, first), sizePx * scale),
    textMatrix,
    ...(actualText === undefined ? body : withActualText(ctx, actualText, body)),
    endText(),
    popGraphicsState(),
  );
}

export type OperatorArg = Parameters<typeof PDFOperator.of>[1] extends (infer A)[] | undefined ? A : never;

/** `shows` inside a `/Span` whose `/ActualText` is `text`. */
export function withActualText(ctx: PageCtx, text: string, shows: readonly PDFOperator[]): PDFOperator[] {
  // A property list (`<< /ActualText … >>`) is an inline dictionary operand
  // of `BDC`; pdf-lib types operator arguments narrowly but serialises it.
  const props = ctx.page.doc.context.obj({ ActualText: PDFHexString.fromText(text) }) as unknown as OperatorArg;
  return [
    PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Span'), props]),
    ...shows,
    PDFOperator.of(PDFOperatorNames.EndMarkedContent),
  ];
}

/**
 * Open a `/Span` marked-content sequence whose `/ActualText` is `text`
 * around everything painted until {@link endActualTextSpan}: a whole line
 * set in pieces. A composed CJK line is painted segment by segment with
 * gaps between them — characters spread for justification, the space
 * between Han and Latin — which text extraction reads as word spaces
 * ("我 们 用 iPhone"); the span gives it the line as written. The tagger's
 * open sequence is closed first, and again before the span ends, so the
 * structure's sequences nest inside it.
 */
export function beginActualTextSpan(ctx: PageCtx, text: string, state: LineTextState): void {
  ctx.tags?.close();
  ctx.readSpans = (ctx.readSpans ?? 0) + 1;
  const props = ctx.page.doc.context.obj({ ActualText: PDFHexString.fromText(text) }) as unknown as OperatorArg;
  ctx.page.pushOperators(
    ...lineTextState(ctx, state),
    PDFOperator.of(PDFOperatorNames.BeginMarkedContentSequence, [PDFName.of('Span'), props]),
  );
}

/** Where a line's text starts and what it is set in: the face and size of
 *  its first text, and that text (which file of a face made of several
 *  draws it). */
export interface LineTextState {
  font: PDFFont;
  text: string;
  sizePx: number;
  xPx: number;
  baselinePx: number;
}

/** A text object that shows nothing and leaves the line's font, size and
 *  position as the text state: every piece of a line restores the
 *  graphics state it painted in, and a reader that places an
 *  `/ActualText` with the text state in force where the span begins or
 *  ends (poppler) would otherwise give the line no height and misplace it
 *  in reading order. The font is the file the line's first text is drawn
 *  from, so nothing is embedded for it. */
function lineTextState(ctx: PageCtx, state: LineTextState): PDFOperator[] {
  const { scale, pageHeightPt } = ctx;
  const font = fileRuns(state.font, state.text)[0]?.font ?? state.font;
  return [
    beginText(),
    setFontAndSize(fontKeyOn(ctx.page, font), state.sizePx * scale),
    setTextMatrix(1, 0, 0, 1, state.xPx * scale, pageHeightPt - state.baselinePx * scale),
    endText(),
  ];
}

/** The text a composed CJK line is read as when its segments are painted
 *  apart (see {@link beginActualTextSpan}): the segments' text, when one
 *  of them carries tracking, is a Han–Latin space, is a mark that gave up
 *  blank (its glyph painted over its neighbour's box, `inkOffset`), hangs,
 *  is a ruby base (the line reads its base, not the reading painted over
 *  it), a warichu note's part (read once, upper row first) or a character
 *  with kanbun marks (read with its 送り仮名, {@link readText}); else
 *  undefined. */
export function cjkLineText(segments: readonly { text: string; tracking?: number; autospace?: boolean; inkOffset?: number; hangs?: boolean; ruby?: unknown; warichu?: unknown; kunten?: { okuri?: string } }[]): string | undefined {
  return segments.some((s) => s.autospace || s.tracking !== undefined || s.inkOffset !== undefined || s.hangs || s.ruby || s.warichu || s.kunten)
    ? segments.map(readText).join('')
    : undefined;
}

/** A segment's text as it is read: a character with kanbun marks (#430)
 *  is followed by its 送り仮名 (`學ビテ`, as kanbun is typed with them);
 *  its 返り点 are reading-order marks, left out. */
export function readText(s: { text: string; kunten?: { okuri?: string } }): string {
  return s.kunten?.okuri ? s.text + s.kunten.okuri : s.text;
}

/**
 * The character spacing (`Tc`, px) a CJK mark that gave up blank is shown
 * with (`inkOffset` set): painted `-inkOffset` before its box, its glyph
 * then advances to where its segment ends, so the box a reader gives the
 * glyph (its advance plus `Tc`) never runs over the next character's —
 * poppler read a compressed `：` over the `「` after it as a line break.
 * Undefined for any other segment, or when the font cannot measure it.
 */
export function compressedMarkSpacingPx(
  font: PDFFont,
  seg: { text: string; width: number; inkOffset?: number; inkScale?: number },
  sizePx: number,
): number | undefined {
  if (seg.inkOffset === undefined || !(sizePx > 0)) return undefined;
  let advance = 0;
  let glyphs = 0;
  for (const { font: file, text } of fileRuns(font, seg.text)) {
    const run = shownRun(file, text);
    if (!run) return undefined;
    advance += run.advance;
    glyphs += run.glyphs;
  }
  // Character spacing follows every glyph: only a mark shown as one.
  if (glyphs !== 1) return undefined;
  // A stretched glyph (`inkScale`, shown with `Tz`): the scaling applies
  // to the character spacing as well.
  return (seg.width - seg.inkOffset) / (seg.inkScale ?? 1) - (advance / 1000) * sizePx;
}

/** Close the span {@link beginActualTextSpan} opened, with the line's text
 *  state in force (see `lineTextState`). */
export function endActualTextSpan(ctx: PageCtx, state: LineTextState): void {
  ctx.tags?.close();
  ctx.readSpans = Math.max(0, (ctx.readSpans ?? 0) - 1);
  ctx.page.pushOperators(
    ...lineTextState(ctx, state),
    PDFOperator.of(PDFOperatorNames.EndMarkedContent),
  );
}
