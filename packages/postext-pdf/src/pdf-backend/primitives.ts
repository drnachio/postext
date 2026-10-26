import { type PDFPage, setCharacterSpacing, type Color, PDFOperator, pushGraphicsState, setStrokingColor, setLineWidth, setLineCap, LineCapStyle, moveTo, lineTo, stroke, popGraphicsState, type PDFFont } from 'pdf-lib';
import type { ColorMode } from '../print/colorMode.js';
import { type CjkRegion, type ScriptContext, scriptContextUntracked, type VDTTextDots, textDots, joinsLetters, type ForcedOrientation } from 'postext';
import type { PageTagger } from './structure/tagging.js';
import type { ResourceImageMap } from './blocks/renderResourceBlock.js';
import { withShapingScript, shapingLanguage } from '../shapingLanguage.js';
import { pushTextObject, beginActualTextSpan, endActualTextSpan } from './primitives/actualText.js';
import { opt, alphaStateOp, alphaOf } from './primitives/color.js';
import type { PdfMatrix } from './primitives/matrix.js';
import { measuredTextShows } from './primitives/measuredText.js';
import { textAdvancePx } from './primitives/shapedRuns.js';
import { textShows, letterTrackingTj } from './primitives/textShows.js';

export { applyMatrix, pushTransform, popTransform, quarterTurnMatrix, mirrorMatrix, counterFlipPx, composeMatrix, pushFrame, popFrame, mapPointPt, outerRectMap, mapRectThrough } from './primitives/matrix.js';
export type { PdfMatrix } from './primitives/matrix.js';
export { drawSwatchPx, drawShapedSwatchPx, fillRectPx, fillRectsPx, drawLinePx, pushClipRect, popClip, pushClipOutline, fillOutlinePx, drawChipBoxPx, strokeOutlinePx } from './primitives/shapes.js';
export { makeScale, whiteColor, colorFromHex, alphaOf, alphaStateOp, opt, rgbFromHex } from './primitives/color.js';
export { showTextShaped, textShows, letterTrackingTj } from './primitives/textShows.js';
export type { TextShow } from './primitives/textShows.js';
export { textAdvancePx } from './primitives/shapedRuns.js';
export { cellPieces, measuredTextOperator, measuredTextShows, fontKeyOn } from './primitives/measuredText.js';
export { pushTextObject, withActualText, beginActualTextSpan, cjkLineText, readText, compressedMarkSpacingPx, endActualTextSpan } from './primitives/actualText.js';
export type { LineTextState } from './primitives/actualText.js';

export interface PageCtx {
  page: PDFPage;
  /** Set while a figure label's halo is painted (#860): every text drawn
   *  without an outline of its own takes this one. */
  textOutline?: TextOutline;
  pageHeightPt: number;
  scale: number;
  /** The output colour: a PDF colour space, or an ICC print mode. */
  colorSpace: ColorMode;
  /** Marked-content state of an accessible (tagged) render; absent when the
   *  document is not tagged. Renderers route each drawing call to a
   *  structure element or flag it as an artifact through it. */
  tags?: PageTagger;
  /** Set while a frame is pushed ({@link pushFrame}: a vertical page's
   *  flow, a rotated resource block, a vertical design text): maps a rect
   *  `[x1, y1, x2, y2]` in points of the current frame — what the `*Px`
   *  helpers compute — to page user space, for the annotation and
   *  structure rects that live outside the content stream. */
  mapRectPt?: (rect: [number, number, number, number]) => [number, number, number, number];
  /** The frames pushed with {@link pushFrame}, outermost first, each
   *  composed with the ones outside it: a point of the innermost frame
   *  lands on the page through the last one. */
  frames?: PdfMatrix[];
  /** Told of every image the page paints as a placeholder (no bytes, or
   *  bytes that did not decode), with its resource when the painter knows
   *  it. Set when the host asked for render warnings. */
  onMissingImage?: (fileId: string, resourceId?: string) => void;
  /** The pictures embedded up front, for what a line paints inline: the
   *  pictures of inline symbols (#1058). */
  images?: ResourceImageMap;
  /** Set while a vertical page's flow (or a vertical design text) paints:
   *  text is set down the column (see `verticalText.ts`). */
  vertical?: VerticalPaint;
  /** The document's CJK region and upright digits, what a composed page's
   *  vertical frame (#944) sets its text with. */
  frameCjk?: { region: CjkRegion; uprightDigits: number };
  /** The character spacing (px) set with {@link setTrackingPx}: the
   *  vertical painter reads it, since it sets its own spacing inside its
   *  text objects. */
  trackingPx?: number;
  /** How many spans opened with {@link beginActualTextSpan} are open:
   *  what is painted inside one is read as the span's text, and no glyph
   *  takes a span of its own there (#755; a reader that meets an
   *  `/ActualText` inside another, Poppler, drops the outer one). */
  readSpans?: number;
  /** Set while a right-to-left page's flow paints through its mirror
   *  (`VDTMirroredFlowFrame`, {@link mirrorMatrix}): every text object
   *  and picture is turned back about its own box, so it reads as written
   *  where the mirrored layout put it ({@link pushTextObject},
   *  {@link counterFlipPx}). */
  mirror?: boolean;
  /** The advance (px) of the text {@link drawTextPx} is painting on a
   *  mirrored page, for a painter that does not pass its own to
   *  {@link pushTextObject}. */
  runAdvancePx?: number;
}

/** What the vertical painter needs (see `verticalText.ts`): the Chinese
 *  region whose marks it sets, the central axis of each family (em above
 *  the baseline, `VDTFlowFrame.centralBaselines`), and how many digits a
 *  number set in one upright cell may have (`cjk.uprightDigits`). */
export interface VerticalPaint {
  region: CjkRegion;
  axes?: Record<string, number>;
  uprightDigits: number;
}

/** Set the character spacing (`Tc`) text is painted with, px, and record
 *  it on the context. */
export function setTrackingPx(ctx: PageCtx, px: number): void {
  ctx.trackingPx = px;
  ctx.page.pushOperators(setCharacterSpacing(px * ctx.scale));
}

/**
 * Paint, with `paint`, a word the layout measured in `script`
 * (`VDTLineSegment.scriptContext`, #725): shaped in that script (the
 * script in force, `withShapingScript`) and, in a script whose words take
 * no tracking (`scriptContextUntracked`: the Arabic script), with no
 * character spacing, as it was measured. Any other word (`script`
 * undefined) is just painted.
 */
export function paintInScript<T>(ctx: PageCtx, script: ScriptContext | undefined, paint: () => T): T {
  if (script === undefined) return paint();
  const tracking = ctx.trackingPx ?? 0;
  const lift = tracking !== 0 && scriptContextUntracked(script);
  if (lift) setTrackingPx(ctx, 0);
  try {
    return withShapingScript(script, paint);
  } finally {
    if (lift) setTrackingPx(ctx, tracking);
  }
}

/** Outline of the glyphs a text is drawn with (a design text's `stroke`):
 *  stroked over the fill, or alone for hollow letters. */
export interface TextOutline {
  color: Color;
  widthPx: number;
  hollow?: boolean;
  /** Show the glyphs invisibly (render mode 3): text that reads, copies
   *  and is tagged under ink drawn otherwise (letters to trace, #1017). */
  invisible?: boolean;
}

/** The outline of text shown invisibly (see {@link TextOutline.invisible}). */
export function invisibleText(color: Color): TextOutline {
  return { color, widthPx: 0, invisible: true };
}

/**
 * Letters to trace (#1017): the dots of `text` set at `xPx` on the
 * baseline in `fontString`, as the canvas paints them (`textDots`), each a
 * round-capped stroke a hundredth of a point long (a stroke of no length
 * draws nothing in some viewers) as wide as the dot. On a mirrored page
 * they are turned back about the run's box. Returns `false`, drawing
 * nothing, where there is no canvas to read the letters from or the text
 * is set vertically.
 */
export function drawTextDotsPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  fontString: string,
  dots: VDTTextDots,
  color: Color,
  rtl: boolean,
): boolean {
  if (ctx.vertical) return false;
  const found = textDots({
    text,
    font: fontString,
    spacingPx: dots.spacingPx,
    letterSpacingPx: joinsLetters(text) ? 0 : ctx.trackingPx ?? 0,
    rtl,
    lang: shapingLanguage(),
  });
  if (!found) return false;
  const { scale, pageHeightPt } = ctx;
  const { points, width } = found;
  const ops: PDFOperator[] = [
    pushGraphicsState(),
    ...opt(alphaStateOp(ctx, 1, alphaOf(color))),
    setStrokingColor(color),
    setLineWidth(dots.sizePx * scale),
    setLineCap(LineCapStyle.Round),
  ];
  for (let i = 0; i < points.length; i += 2) {
    const dx = ctx.mirror ? width - points[i]! : points[i]!;
    const x = (xPx + dx) * scale;
    const y = pageHeightPt - (baselinePx + points[i + 1]!) * scale;
    ops.push(moveTo(x, y), lineTo(x + 0.01, y));
  }
  ops.push(stroke(), popGraphicsState());
  ctx.page.pushOperators(...ops);
  return true;
}

/** `actualText`, when set, is what copying, text extraction and assistive
 *  technology read for the glyphs painted (see {@link pushTextObject}). */
export function drawTextPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  outline?: TextOutline,
  actualText?: string,
  /** Vertical text: the orientation the author gave it
   *  (`VDTLineSegment.tcy` / `orientation`). */
  orient?: ForcedOrientation,
  /** The text is one bidi run in this direction (a design text or chip run
   *  flagged `rtl`): shaped so, not cut into runs by its own letters. */
  direction?: 'ltr' | 'rtl',
): void {
  if (!text) return;
  outline ??= ctx.textOutline;
  if (ctx.vertical) {
    verticalPainter?.(ctx, text, xPx, baselinePx, font, sizePx, color, outline, actualText, orient);
    return;
  }
  // On a mirrored page the text object is turned back about the run's box,
  // which needs its advance: the face's, as the run is shown (joining
  // letters are shown untracked, see `shapedText.ts`).
  const outer = ctx.runAdvancePx;
  if (ctx.mirror) ctx.runAdvancePx = textAdvancePx(font, text, sizePx, joinsLetters(text) ? 0 : ctx.trackingPx ?? 0).advance;
  try {
    // Right-to-left and joining scripts are shaped with HarfBuzz when the
    // document loaded it (`shapedText.ts`).
    if (complexPainter?.(ctx, text, xPx, baselinePx, font, sizePx, color, outline, actualText, direction)) return;
    pushTextObject(ctx, textShows(font, text, actualText === undefined && !ctx.readSpans, false, letterTrackingTj(ctx.trackingPx ?? 0, sizePx)), xPx, baselinePx, font, sizePx, color, outline, actualText);
  } finally {
    ctx.runAdvancePx = outer;
  }
}

/** The painter of text HarfBuzz shapes (`shapedText.ts` registers it):
 *  true when it painted `text`, false to leave it to fontkit. */
type ComplexPainter = (
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  outline?: TextOutline,
  actualText?: string,
  direction?: 'ltr' | 'rtl',
) => boolean;
let complexPainter: ComplexPainter | undefined;

/** Register the painter {@link drawTextPx} hands complex-script text to. */
export function registerComplexPainter(painter: ComplexPainter): void {
  complexPainter = painter;
}

/** The painter of vertical text (`verticalText.ts` registers it, so this
 *  module does not import it back). */
type VerticalPainter = (
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  outline?: TextOutline,
  actualText?: string,
  orient?: ForcedOrientation,
) => void;
let verticalPainter: VerticalPainter | undefined;

/** Register the painter {@link drawTextPx} hands vertical text to. */
export function registerVerticalPainter(painter: VerticalPainter): void {
  verticalPainter = painter;
}

/**
 * Paint a line's pieces (its words and spaces, with their measured widths)
 * in one text object from `xPx`, each piece where the layout measured it
 * (see {@link measuredTextOperator}). `trackingPx` is the character spacing
 * already set for the line. Returns false, painting nothing, when the font
 * cannot be measured that way; the caller then paints the text itself.
 * `actualText` as in {@link drawTextPx}.
 */
export function drawMeasuredTextPx(
  ctx: PageCtx,
  pieces: readonly { text: string; width: number }[],
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  trackingPx = 0,
  actualText?: string,
): boolean {
  if (ctx.vertical) {
    // Down the column each piece starts where the layout put it, in one
    // span that reads as the line.
    const span = actualText ?? pieces.map((p) => p.text).join('');
    if (!verticalPainter) return false;
    // The span closes the structure's open sequence: opened again inside.
    const elem = ctx.tags?.openElem;
    beginActualTextSpan(ctx, span, { font, text: pieces[0]?.text ?? '', sizePx, xPx, baselinePx });
    if (elem) ctx.tags?.content(elem);
    let x = xPx;
    for (const piece of pieces) {
      if (piece.text) verticalPainter(ctx, piece.text, x, baselinePx, font, sizePx, color);
      x += piece.width;
    }
    endActualTextSpan(ctx, { font, text: pieces[0]?.text ?? '', sizePx, xPx, baselinePx });
    return true;
  }
  const shows = measuredTextShows(font, pieces, sizePx, trackingPx, actualText === undefined && !ctx.readSpans);
  if (!shows) return false;
  // Every piece starts where the layout put it: the run is as wide as the
  // layout measured it.
  const advance = ctx.mirror ? pieces.reduce((sum, p) => sum + p.width, 0) : undefined;
  pushTextObject(ctx, shows, xPx, baselinePx, font, sizePx, color, undefined, actualText, advance);
  return true;
}
