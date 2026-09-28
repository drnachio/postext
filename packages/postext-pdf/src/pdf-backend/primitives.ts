import {
  rgb,
  cmyk,
  grayscale,
  BlendMode,
  pushGraphicsState,
  popGraphicsState,
  rectangle,
  clip,
  endPath,
  concatTransformationMatrix,
  type PDFPage,
  type PDFFont,
  type Color,
  PDFArray,
  PDFHexString,
  PDFName,
  PDFNumber,
  PDFOperator,
  PDFOperatorNames,
  beginText,
  endText,
  setFillingColor,
  setFontAndSize,
  showText,
  setTextMatrix,
  moveTo,
  lineTo,
  appendBezierCurve,
  closePath,
  stroke,
  fill,
  setStrokingColor,
  setLineWidth,
  setTextRenderingMode,
  TextRenderingMode,
  setGraphicsState,
} from 'pdf-lib';
import { colorAlpha, hexToRgb, rgbToCmyk, rgbToGrayscale } from '../colors';
import type { PdfColorSpace, RoundedOutline, VDTChip } from 'postext';
import type { PageTagger } from './tagging';
import { fallbackPieces, type FallbackFace, type TextPiece } from './fallbackSpaces';
import { fileRuns, noteMissingGlyphs } from '../faceFiles';

export interface PageCtx {
  page: PDFPage;
  pageHeightPt: number;
  scale: number;
  colorSpace: PdfColorSpace;
  /** Marked-content state of an accessible (tagged) render; absent when the
   *  document is not tagged. Renderers route each drawing call to a
   *  structure element or flag it as an artifact through it. */
  tags?: PageTagger;
  /** Set while a transform is pushed (a rotated resource block): maps a
   *  rect `[x1, y1, x2, y2]` in points of the transformed frame — what the
   *  `*Px` helpers compute — to page user space, for the annotation and
   *  structure rects that live outside the content stream. */
  mapRectPt?: (rect: [number, number, number, number]) => [number, number, number, number];
  /** Told of every image the page paints as a placeholder (no bytes, or
   *  bytes that did not decode), with its resource when the painter knows
   *  it. Set when the host asked for render warnings. */
  onMissingImage?: (fileId: string, resourceId?: string) => void;
}

/** A PDF transformation matrix `[a b c d e f]` (`x' = a·x + c·y + e`,
 *  `y' = b·x + d·y + f`). */
export type PdfMatrix = [number, number, number, number, number, number];

/** Apply `m` to a point. */
export function applyMatrix(m: PdfMatrix, x: number, y: number): { x: number; y: number } {
  return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] };
}

/** Push a graphics state with `m` concatenated onto the CTM. Everything
 *  drawn until {@link popTransform} goes through it. */
export function pushTransform(ctx: PageCtx, m: PdfMatrix): void {
  ctx.tags?.close();
  ctx.page.pushOperators(pushGraphicsState(), concatTransformationMatrix(...m));
}

export function popTransform(ctx: PageCtx): void {
  ctx.tags?.close();
  ctx.page.pushOperators(popGraphicsState());
}

/** Map a rect `[x1, y1, x2, y2]` through `m`, re-normalised to min / max. */
export function mapRectThrough(m: PdfMatrix, rect: [number, number, number, number]): [number, number, number, number] {
  const a = applyMatrix(m, rect[0], rect[1]);
  const b = applyMatrix(m, rect[2], rect[3]);
  return [Math.min(a.x, b.x), Math.min(a.y, b.y), Math.max(a.x, b.x), Math.max(a.y, b.y)];
}

/** Inline colour swatch (`:swatch{…}`): a square of `sidePx` on the
 *  baseline, filled with `fill` (hex) when resolved and outlined in `ink`. */
export function drawSwatchPx(
  ctx: PageCtx,
  xPx: number,
  baselinePx: number,
  sidePx: number,
  fill: string | undefined,
  ink: Color,
): void {
  const { scale, pageHeightPt } = ctx;
  const strokePx = Math.max(0.5, sidePx * 0.06);
  const x = (xPx + strokePx / 2) * scale;
  const y = pageHeightPt - (baselinePx - strokePx / 2) * scale;
  const side = (sidePx - strokePx) * scale;
  const fillColor = fill ? colorFromHex(fill, ctx.colorSpace) : undefined;
  const fillAlpha = alphaOf(fillColor);
  const inkAlpha = alphaOf(ink);
  ctx.page.drawRectangle({
    x,
    y,
    width: side,
    height: side,
    ...(fillColor ? { color: fillColor } : {}),
    borderColor: ink,
    borderWidth: Math.max(0.01, strokePx * scale),
    ...(fillColor && fillAlpha < 1 ? { opacity: fillAlpha } : {}),
    ...(inkAlpha < 1 ? { borderOpacity: inkAlpha } : {}),
  });
}

export function makeScale(dpi: number): number {
  return 72 / dpi;
}

export function whiteColor(colorSpace: PdfColorSpace): Color {
  if (colorSpace === 'cmyk') return cmyk(0, 0, 0, 0);
  if (colorSpace === 'grayscale') return grayscale(1);
  return rgb(1, 1, 1);
}

// Memoized: called per text segment during rendering, while a document only
// uses a handful of colors. pdf-lib Color objects are plain immutable
// descriptors, so sharing instances is safe.
const colorCache = new Map<string, Color>();

/** Opacity riding on a {@link colorFromHex} colour (absent: opaque). pdf-lib
 *  reads only a colour's channels, so the extra field travels with it to
 *  the painters, which set it as an ExtGState constant alpha. */
interface AlphaColor {
  alpha?: number;
}

/**
 * The pdf-lib colour of a document colour string — `#rgb`, `#rrggbb`, with
 * an alpha channel (`#rgba`, `#rrggbbaa`), `rgb()` / `rgba()` or
 * `transparent` — in the output colour space. A translucent colour carries
 * its opacity along (see {@link alphaOf}); malformed input paints black.
 */
export function colorFromHex(hex: string, colorSpace: PdfColorSpace): Color {
  const key = `${colorSpace}|${hex}`;
  const cached = colorCache.get(key);
  if (cached) return cached;
  const c = hexToRgb(hex);
  let color: Color;
  if (colorSpace === 'cmyk') {
    const k = rgbToCmyk(c);
    color = cmyk(k.c, k.m, k.y, k.k);
  } else if (colorSpace === 'grayscale') {
    color = grayscale(rgbToGrayscale(c));
  } else {
    color = rgb(c.r, c.g, c.b);
  }
  const alpha = colorAlpha(hex);
  if (alpha < 1) (color as AlphaColor).alpha = alpha;
  colorCache.set(key, color);
  return color;
}

/** Opacity of a colour made by {@link colorFromHex}, 0 … 1. */
export function alphaOf(color: Color | undefined): number {
  return (color as AlphaColor | undefined)?.alpha ?? 1;
}

/** ExtGState per distinct (fill alpha, stroke alpha) pair, per page. */
const alphaStates = new WeakMap<PDFPage, Map<string, PDFName>>();

const roundAlpha = (n: number): number => Math.round(Math.max(0, Math.min(1, n)) * 1000) / 1000;

/** The `gs` operator setting constant fill (`ca`) and stroke (`CA`) alpha,
 *  one shared ExtGState per pair and page; null when both are opaque. */
export function alphaStateOp(ctx: PageCtx, fillAlpha: number, strokeAlpha = 1): PDFOperator | null {
  const ca = roundAlpha(fillAlpha);
  const CA = roundAlpha(strokeAlpha);
  if (ca >= 1 && CA >= 1) return null;
  let states = alphaStates.get(ctx.page);
  if (!states) {
    states = new Map();
    alphaStates.set(ctx.page, states);
  }
  const key = `${ca}|${CA}`;
  let name = states.get(key);
  if (!name) {
    const dict = ctx.page.doc.context.obj({ Type: 'ExtGState', ca, CA });
    name = ctx.page.node.newExtGState('GSa', dict);
    states.set(key, name);
  }
  return setGraphicsState(name);
}

/** `op` as a one-element list when set, for spreading into operator runs. */
function opt(op: PDFOperator | null): PDFOperator[] {
  return op ? [op] : [];
}

/** Back-compat alias — defaults to RGB. */
export function rgbFromHex(hex: string): Color {
  return colorFromHex(hex, 'rgb');
}

export function fillRectPx(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
  color: Color,
  blendMode?: BlendMode,
): void {
  const { scale, pageHeightPt } = ctx;
  const x = xPx * scale;
  const y = pageHeightPt - (yPx + hPx) * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  const alpha = alphaOf(color);
  if (alpha < 1 && !blendMode) {
    ctx.page.pushOperators(
      pushGraphicsState(),
      ...opt(alphaStateOp(ctx, alpha)),
      setFillingColor(color),
      rectangle(x, y, width, height),
      fill(),
      popGraphicsState(),
    );
    return;
  }
  ctx.page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    ...(blendMode ? { blendMode } : {}),
    ...(alpha < 1 ? { opacity: alpha } : {}),
  });
}

/** Fill several rectangles (px) in one colour with a single fill operation:
 *  the viewer rasterises them as one shape, so rectangles that abut or
 *  overlap leave no seam between them. */
export function fillRectsPx(
  ctx: PageCtx,
  rects: readonly { x: number; y: number; width: number; height: number }[],
  color: Color,
): void {
  if (rects.length === 0) return;
  const { scale, pageHeightPt } = ctx;
  const alpha = alphaOf(color);
  ctx.page.pushOperators(
    pushGraphicsState(),
    ...(alpha < 1 ? opt(alphaStateOp(ctx, alpha)) : []),
    setFillingColor(color),
    ...rects.map((r) => rectangle(r.x * scale, pageHeightPt - (r.y + r.height) * scale, r.width * scale, r.height * scale)),
    fill(),
    popGraphicsState(),
  );
}

export function drawLinePx(
  ctx: PageCtx,
  x1Px: number,
  y1Px: number,
  x2Px: number,
  y2Px: number,
  color: Color,
  thicknessPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  const alpha = alphaOf(color);
  if (alpha < 1) {
    ctx.page.pushOperators(
      pushGraphicsState(),
      ...opt(alphaStateOp(ctx, 1, alpha)),
      setStrokingColor(color),
      setLineWidth(Math.max(0.01, thicknessPx * scale)),
      moveTo(x1Px * scale, pageHeightPt - y1Px * scale),
      lineTo(x2Px * scale, pageHeightPt - y2Px * scale),
      stroke(),
      popGraphicsState(),
    );
    return;
  }
  ctx.page.drawLine({
    start: { x: x1Px * scale, y: pageHeightPt - y1Px * scale },
    end: { x: x2Px * scale, y: pageHeightPt - y2Px * scale },
    color,
    thickness: Math.max(0.01, thicknessPx * scale),
  });
}

// Text is drawn a word at a time (the layout engine positions every
// word), and pdf-lib's `drawText` shapes each call afresh through fontkit —
// the same words, over and over. The show-text operator of a (font, text)
// pair never changes, so it is shaped once and reused; the font's resource
// key on a page likewise.
const showByFont = new WeakMap<PDFFont, Map<string, PDFOperator>>();
const ENCODE_CACHE_SLOTS = 50_000;

/** The fontkit side of a pdf-lib custom font — what kerning needs. */
interface ShapingFace {
  unitsPerEm: number;
  layout(text: string, features?: unknown): {
    glyphs: Array<{ advanceWidth: number }>;
    positions: Array<{ xAdvance: number; xOffset: number }>;
  };
}

/** Round a TJ adjustment to 1/100 of a text-space unit. */
function tjNumber(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * The show-text operator for `text`, carrying the shaper's glyph positions.
 *
 * pdf-lib's `encodeText` shapes through fontkit but keeps only the glyph
 * ids, so a viewer advances each glyph by its raw width (the `W` array) and
 * the GPOS kerning the canvas measured with is lost: in a tightly kerned
 * face (Geist: `referencia` is 0.21 em narrower kerned) each word paints
 * wider than the layout engine placed it and eats the following space.
 * Emit a `TJ` array instead whose numbers restore every glyph's
 * `xAdvance` / `xOffset`; a run without adjustments stays a plain `Tj`.
 */
export function showTextShaped(font: PDFFont, text: string): PDFOperator {
  let cache = showByFont.get(font);
  if (!cache) {
    cache = new Map();
    showByFont.set(font, cache);
  }
  const hit = cache.get(text);
  if (hit) return hit;
  noteMissingGlyphs(font, text);
  const op = fallbackOperator(font, text) ?? shapedTextOperator(font, text);
  if (cache.size >= ENCODE_CACHE_SLOTS) cache.clear();
  cache.set(text, op);
  return op;
}

/** A show-text operator and the font (a file of the face) it shows in. */
export interface TextShow {
  font: PDFFont;
  op: PDFOperator;
}

/** The show-text operators of `text` in `font`'s face: one
 *  ({@link showTextShaped}) for a face of one file, else one per run of
 *  characters set in the same file (see `faceFiles.ts`). */
export function textShows(font: PDFFont, text: string): TextShow[] {
  return fileRuns(font, text).map((run) => ({ font: run.font, op: showTextShaped(run.font, run.text) }));
}

function shapingFace(font: PDFFont): { face: ShapingFace & FallbackFace; features: unknown } | undefined {
  const embedder = (font as unknown as { embedder?: { font?: ShapingFace & FallbackFace; fontFeatures?: unknown } }).embedder;
  const face = embedder?.font;
  if (!face || typeof face.layout !== 'function' || !face.unitsPerEm) return undefined;
  return { face, features: embedder!.fontFeatures };
}

/** `text` shaped as one run: a `TJ` with the shaper's positions, or a plain
 *  `Tj` when it has none. */
function shapedTextOperator(font: PDFFont, text: string): PDFOperator {
  // `encodeText` also registers the glyphs with the font's subset (the ids
  // it returns are subset ids), so it runs even when positions are added.
  const encoded = font.encodeText(text);
  const parts = shapedParts(font, text, encoded);
  return parts && parts.length > 1 ? adjustedOperator(font, parts) : showText(encoded);
}

/** The `TJ` array (hex glyph runs and adjustments) of a shaped run, or
 *  undefined when the shaper's positions cannot be matched to its glyphs. */
function shapedParts(font: PDFFont, text: string, encoded: PDFHexString): Array<string | number> | undefined {
  return shapedRun(font, text, encoded)?.parts;
}

/** {@link shapedParts} with the sum of the glyphs' own widths (their `W`
 *  entries), in thousandths of the font size. */
function shapedRun(font: PDFFont, text: string, encoded: PDFHexString): { parts: Array<string | number>; widths: number } | undefined {
  const shaping = shapingFace(font);
  if (!shaping) return undefined;
  const { face } = shaping;
  const run = face.layout(text, shaping.features);
  const hex = encoded.asString();
  const count = run.glyphs.length;
  if (count === 0 || hex.length !== count * 4 || run.positions.length !== count) return undefined;
  // TJ numbers are thousandths of text space, subtracted from the pen: a
  // glyph drawn at `pen + xOffset` then advancing by `xAdvance` (not its
  // W width `advanceWidth`) is `-xOffset, glyph, -(xAdvance - w - xOffset)`.
  const toText = 1000 / face.unitsPerEm;
  const subsetFont = isSubsetFont(font);
  const parts: Array<string | number> = [];
  let pendingHex = '';
  let pendingAdjust = 0;
  const flushHex = () => {
    if (pendingHex) parts.push(pendingHex);
    pendingHex = '';
  };
  let widths = 0;
  for (let i = 0; i < count; i++) {
    const pos = run.positions[i]!;
    const lead = tjNumber(pendingAdjust - pos.xOffset * toText);
    if (lead !== 0) {
      flushHex();
      parts.push(lead);
    }
    const cid = hex.slice(i * 4, i * 4 + 4);
    pendingHex += cid;
    pendingAdjust = -(pos.xAdvance - run.glyphs[i]!.advanceWidth - pos.xOffset) * toText;
    widths += cid === '0000' && subsetFont ? MISSING_WIDTH : run.glyphs[i]!.advanceWidth * toText;
  }
  flushHex();
  return { parts, widths };
}

/** The width a viewer gives a glyph with no `W` entry (no `DW` is written). */
const MISSING_WIDTH = 1000;

/** Whether pdf-lib embeds `font` as a subset, whose `W` array never lists
 *  the notdef glyph (CID 0): a viewer advances it by {@link MISSING_WIDTH}. */
function isSubsetFont(font: PDFFont): boolean {
  return !!(font as unknown as { embedder?: { subset?: unknown } }).embedder?.subset;
}

function adjustedOperator(font: PDFFont, parts: Array<string | number>): PDFOperator {
  const array = PDFArray.withContext(font.doc.context);
  for (const part of parts) {
    array.push(typeof part === 'number' ? PDFNumber.of(part) : PDFHexString.of(part));
  }
  return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]);
}

/** A plain `Tj` for a single glyph run (or none), else a `TJ`. */
function partsOperator(font: PDFFont, parts: Array<string | number>): PDFOperator {
  if (parts.length === 0) return showText(PDFHexString.of(''));
  return parts.length === 1 && typeof parts[0] === 'string' ? showText(PDFHexString.of(parts[0])) : adjustedOperator(font, parts);
}

/** Append a part to a `TJ` array, merging it into a neighbouring glyph run
 *  or number; a zero adjustment is dropped. */
function pushPart(parts: Array<string | number>, part: string | number): void {
  const last = parts[parts.length - 1];
  if (typeof part === 'number') {
    if (part === 0) return;
    if (typeof last === 'number') parts[parts.length - 1] = tjNumber(last + part);
    else parts.push(part);
  } else if (typeof last === 'string') parts[parts.length - 1] = last + part;
  else parts.push(part);
}

/** A text set for a show-text array: its glyph runs and adjustments, where
 *  they leave the pen (thousandths of the font size: the glyphs' `W`
 *  widths less the adjustments, before any character spacing) and how
 *  many glyphs they show. */
interface ShownRun {
  parts: Array<string | number>;
  advance: number;
  glyphs: number;
}

/** Glyphs and pen advance of a run of parts whose glyph widths sum to
 *  `widths` (thousandths of the font size). */
function shownRunOf(parts: Array<string | number>, widths: number): ShownRun {
  let advance = widths;
  let glyphs = 0;
  for (const part of parts) {
    if (typeof part === 'number') advance -= part;
    else glyphs += part.length / 4;
  }
  return { parts, advance, glyphs };
}

/** The parts of a text holding spaces the face has no glyph for, or
 *  invisible characters (see {@link fallbackOperator}). */
function fallbackRun(font: PDFFont, face: FallbackFace, pieces: TextPiece[]): ShownRun {
  const toText = 1000 / face.unitsPerEm;
  const spaceGlyph = face.hasGlyphForCodePoint(0x20) ? face.glyphForCodePoint(0x20) : undefined;
  const parts: Array<string | number> = [];
  let widths = 0;
  for (const piece of pieces) {
    if ('space' in piece) {
      if (spaceGlyph) {
        pushPart(parts, font.encodeText(' ').asString());
        pushPart(parts, tjNumber((spaceGlyph.advanceWidth - piece.space) * toText));
        widths += spaceGlyph.advanceWidth * toText;
      } else {
        pushPart(parts, tjNumber(-piece.space * toText));
      }
      continue;
    }
    const encoded = font.encodeText(piece.text);
    const shaped = shapedRun(font, piece.text, encoded);
    for (const part of shaped?.parts ?? [encoded.asString()]) pushPart(parts, part);
    widths += shaped?.widths ?? font.widthOfTextAtSize(piece.text, 1000);
  }
  return shownRunOf(parts, widths);
}

/**
 * The show-text operator of a text holding a space the face has no glyph
 * for (a narrow no-break space, a figure space…) or an invisible character
 * (a word joiner): painted as the canvas measured it, not as `.notdef`
 * boxes (see `fallbackSpaces.ts`). A missing space is the face's space
 * glyph — text extraction still finds a space there — moved to the
 * browser's advance for it; an invisible character is not drawn. Undefined
 * for text that needs none of this.
 */
function fallbackOperator(font: PDFFont, text: string): PDFOperator | undefined {
  const shaping = shapingFace(font);
  if (!shaping) return undefined;
  const pieces = fallbackPieces(shaping.face, text);
  if (!pieces) return undefined;
  return partsOperator(font, fallbackRun(font, shaping.face, pieces).parts);
}

const runsByFont = new WeakMap<PDFFont, Map<string, ShownRun>>();

/** `text` as {@link showTextShaped} paints it, with the advance and glyph
 *  count it leaves (cached per font). Undefined when the font carries no
 *  shaper to measure it with. */
function shownRun(font: PDFFont, text: string): ShownRun | undefined {
  let cache = runsByFont.get(font);
  if (!cache) {
    cache = new Map();
    runsByFont.set(font, cache);
  }
  const hit = cache.get(text);
  if (hit) return hit;
  const shaping = shapingFace(font);
  if (!shaping) return undefined;
  noteMissingGlyphs(font, text);
  const pieces = fallbackPieces(shaping.face, text);
  let run: ShownRun;
  if (pieces) {
    run = fallbackRun(font, shaping.face, pieces);
  } else {
    const encoded = font.encodeText(text);
    const hex = encoded.asString();
    const shaped = shapedRun(font, text, encoded);
    run = shownRunOf(shaped?.parts ?? (hex ? [hex] : []), shaped?.widths ?? font.widthOfTextAtSize(text, 1000));
  }
  if (cache.size >= ENCODE_CACHE_SLOTS) cache.clear();
  cache.set(text, run);
  return run;
}

/** Below this (thousandths of the font size) the pen is left where the
 *  glyphs put it and the difference is carried to the next piece: the
 *  layout and the embedded face agree on almost every word, and the
 *  `TJ` then holds only the kerning. */
const MEASURED_TOLERANCE = 0.5;

/**
 * One show-text operator for a line's pieces (its words and spaces, each
 * with the width the layout measured it at): every piece starts where the
 * layout put it (EF-137). The face's own glyphs set each piece, a `TJ`
 * number after it moves the pen to where the next one starts, so a glyph
 * the embedded face lacks (measured by the browser in another font) or
 * any other difference between the two measures never shifts the words
 * after it. Spaces stay real space glyphs, for text extraction.
 * `trackingPx` is the character spacing (`Tc`) the line is painted with,
 * added after every glyph. Undefined when the font carries no shaper.
 */
export function measuredTextOperator(
  font: PDFFont,
  pieces: readonly { text: string; width: number }[],
  sizePx: number,
  trackingPx = 0,
): PDFOperator | undefined {
  const shows = measuredTextShows(font, pieces, sizePx, trackingPx);
  return shows && shows.length === 1 ? shows[0]!.op : undefined;
}

/**
 * {@link measuredTextOperator} for a face of any number of files: the
 * pieces cut into runs by file (see `faceFiles.ts`), one show-text
 * operator per stretch set in the same file. The pen carries across the
 * font switches, so every piece still starts where the layout put it.
 */
export function measuredTextShows(
  font: PDFFont,
  pieces: readonly { text: string; width: number }[],
  sizePx: number,
  trackingPx = 0,
): TextShow[] | undefined {
  if (!(sizePx > 0)) return undefined;
  const groups: Array<{ font: PDFFont; parts: Array<string | number> }> = [];
  let group: { font: PDFFont; parts: Array<string | number> } | undefined;
  const tracking = (trackingPx / sizePx) * 1000;
  // How far the pen is right of where the layout wants it, in thousandths.
  let ahead = 0;
  for (let i = 0; i < pieces.length; i++) {
    const piece = pieces[i]!;
    let advance = 0;
    for (const { font: file, text } of fileRuns(font, piece.text)) {
      const run = shownRun(file, text);
      if (!run) return undefined;
      if (!group || group.font !== file) {
        group = { font: file, parts: [] };
        groups.push(group);
      }
      for (const part of run.parts) pushPart(group.parts, part);
      advance += run.advance + run.glyphs * tracking;
    }
    ahead += advance - (piece.width / sizePx) * 1000;
    if (i < pieces.length - 1 && Math.abs(ahead) >= MEASURED_TOLERANCE) {
      const n = tjNumber(ahead);
      if (!group) {
        group = { font, parts: [] };
        groups.push(group);
      }
      pushPart(group.parts, n);
      ahead -= n;
    }
  }
  if (groups.length === 0) groups.push({ font, parts: [] });
  return groups.map((g) => ({ font: g.font, op: partsOperator(g.font, g.parts) }));
}

const fontKeysByPage = new WeakMap<PDFPage, Map<PDFFont, PDFName>>();

function fontKeyOn(page: PDFPage, font: PDFFont): PDFName {
  let keys = fontKeysByPage.get(page);
  if (!keys) {
    keys = new Map();
    fontKeysByPage.set(page, keys);
  }
  let key = keys.get(font);
  if (!key) {
    key = page.node.newFontDictionary(font.name, font.ref);
    keys.set(font, key);
  }
  return key;
}

/** Outline of the glyphs a text is drawn with (a design text's `stroke`):
 *  stroked over the fill, or alone for hollow letters. */
export interface TextOutline {
  color: Color;
  widthPx: number;
  hollow?: boolean;
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
): void {
  if (!text) return;
  pushTextObject(ctx, textShows(font, text), xPx, baselinePx, font, sizePx, color, outline, actualText);
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
  const shows = measuredTextShows(font, pieces, sizePx, trackingPx);
  if (!shows) return false;
  pushTextObject(ctx, shows, xPx, baselinePx, font, sizePx, color, undefined, actualText);
  return true;
}

/**
 * The operators pdf-lib's `drawText` emits, around the show-text operators
 * of a text: one, or one per file of a face made of several (each after
 * its own `Tf`; the pen carries over). With `actualText` the show-text
 * operators sit in a `/Span` marked-content sequence whose `/ActualText` is
 * that text (PDF 1.7 §14.9.4), inside the text object, where readers expect
 * it: copying, text extraction and assistive technology read it instead of
 * the glyphs. The span has no MCID, so in a tagged PDF it nests in the
 * structure sequence open around it.
 */
function pushTextObject(
  ctx: PageCtx,
  shows: readonly TextShow[],
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
  outline?: TextOutline,
  actualText?: string,
): void {
  const { scale, pageHeightPt } = ctx;
  // Text render mode 2 fills then strokes the glyphs; mode 1 only strokes.
  const outlineOps = outline && outline.widthPx > 0
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
    setTextMatrix(1, 0, 0, 1, xPx * scale, pageHeightPt - baselinePx * scale),
    ...(actualText === undefined ? body : withActualText(ctx, actualText, body)),
    endText(),
    popGraphicsState(),
  );
}

type OperatorArg = Parameters<typeof PDFOperator.of>[1] extends (infer A)[] | undefined ? A : never;

/** `shows` inside a `/Span` whose `/ActualText` is `text`. */
function withActualText(ctx: PageCtx, text: string, shows: readonly PDFOperator[]): PDFOperator[] {
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
 *  blank (its glyph painted over its neighbour's box, `inkOffset`) or
 *  hangs; else undefined. */
export function cjkLineText(segments: readonly { text: string; tracking?: number; autospace?: boolean; inkOffset?: number; hangs?: boolean }[]): string | undefined {
  return segments.some((s) => s.autospace || s.tracking !== undefined || s.inkOffset !== undefined || s.hangs)
    ? segments.map((s) => s.text).join('')
    : undefined;
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
  seg: { text: string; width: number; inkOffset?: number },
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
  return seg.width - seg.inkOffset - (advance / 1000) * sizePx;
}

/** Close the span {@link beginActualTextSpan} opened, with the line's text
 *  state in force (see `lineTextState`). */
export function endActualTextSpan(ctx: PageCtx, state: LineTextState): void {
  ctx.tags?.close();
  ctx.page.pushOperators(
    ...lineTextState(ctx, state),
    PDFOperator.of(PDFOperatorNames.EndMarkedContent),
  );
}

export function pushClipRect(
  ctx: PageCtx,
  xPx: number,
  yPx: number,
  wPx: number,
  hPx: number,
): void {
  const { scale, pageHeightPt } = ctx;
  const x = xPx * scale;
  const y = pageHeightPt - (yPx + hPx) * scale;
  const width = wPx * scale;
  const height = hPx * scale;
  // Marked content must nest inside the graphics state it was opened in.
  ctx.tags?.close();
  ctx.page.pushOperators(
    pushGraphicsState(),
    rectangle(x, y, width, height),
    clip(),
    endPath(),
  );
}

export function popClip(ctx: PageCtx): void {
  ctx.tags?.close();
  ctx.page.pushOperators(popGraphicsState());
}

/** Bézier handle length of a quarter circle, as a fraction of its radius. */
const KAPPA = 0.5522847498;

/** Path operators tracing a rounded outline given in px (top-down), in the
 *  points of the current frame. Corners of radius 0 stay square. */
function roundedOutlineOps(ctx: PageCtx, o: RoundedOutline): PDFOperator[] {
  const { scale, pageHeightPt } = ctx;
  const X = (px: number) => px * scale;
  const Y = (py: number) => pageHeightPt - py * scale;
  const { x, y, width: w, height: h } = o;
  const [tl, tr, br, bl] = o.radii;
  const k = KAPPA;
  const ops: PDFOperator[] = [moveTo(X(x + tl), Y(y)), lineTo(X(x + w - tr), Y(y))];
  if (tr > 0) ops.push(appendBezierCurve(X(x + w - tr + tr * k), Y(y), X(x + w), Y(y + tr - tr * k), X(x + w), Y(y + tr)));
  ops.push(lineTo(X(x + w), Y(y + h - br)));
  if (br > 0) ops.push(appendBezierCurve(X(x + w), Y(y + h - br + br * k), X(x + w - br + br * k), Y(y + h), X(x + w - br), Y(y + h)));
  ops.push(lineTo(X(x + bl), Y(y + h)));
  if (bl > 0) ops.push(appendBezierCurve(X(x + bl - bl * k), Y(y + h), X(x), Y(y + h - bl + bl * k), X(x), Y(y + h - bl)));
  ops.push(lineTo(X(x), Y(y + tl)));
  if (tl > 0) ops.push(appendBezierCurve(X(x), Y(y + tl - tl * k), X(x + tl - tl * k), Y(y), X(x + tl), Y(y)));
  ops.push(closePath());
  return ops;
}

/** Push a graphics state clipped to a rounded outline (px); undo with
 *  {@link popClip}. */
export function pushClipOutline(ctx: PageCtx, o: RoundedOutline): void {
  ctx.tags?.close();
  ctx.page.pushOperators(pushGraphicsState(), ...roundedOutlineOps(ctx, o), clip(), endPath());
}

/** Fill a rounded outline (px). */
export function fillOutlinePx(ctx: PageCtx, o: RoundedOutline, color: Color): void {
  ctx.page.pushOperators(
    pushGraphicsState(),
    ...opt(alphaStateOp(ctx, alphaOf(color))),
    setFillingColor(color),
    ...roundedOutlineOps(ctx, o),
    fill(),
    popGraphicsState(),
  );
}

/** The box of an inline chip (`:chip[…]`) whose segment starts at `xPx` on
 *  a line of baseline `baselinePx`: the fill, then the outline stroked
 *  inside the box edge (the text runs are painted by the caller). */
export function drawChipBoxPx(ctx: PageCtx, chip: VDTChip, xPx: number, baselinePx: number): void {
  const x = xPx + chip.marginLeft;
  const y = baselinePx - chip.ascent;
  const h = chip.ascent + chip.descent;
  const r = chip.borderRadius;
  if (chip.background) {
    fillOutlinePx(ctx, { x, y, width: chip.boxWidth, height: h, radii: [r, r, r, r] }, colorFromHex(chip.background, ctx.colorSpace));
  }
  if (chip.borderColor && chip.borderWidth > 0) {
    const half = chip.borderWidth / 2;
    const ri = Math.max(0, r - half);
    strokeOutlinePx(
      ctx,
      { x: x + half, y: y + half, width: chip.boxWidth - chip.borderWidth, height: h - chip.borderWidth, radii: [ri, ri, ri, ri] },
      colorFromHex(chip.borderColor, ctx.colorSpace),
      chip.borderWidth,
    );
  }
}

/** Stroke a rounded outline (px) `thicknessPx` wide, centred on it. */
export function strokeOutlinePx(ctx: PageCtx, o: RoundedOutline, color: Color, thicknessPx: number): void {
  ctx.page.pushOperators(
    pushGraphicsState(),
    ...opt(alphaStateOp(ctx, 1, alphaOf(color))),
    setStrokingColor(color),
    setLineWidth(Math.max(0.01, thicknessPx * ctx.scale)),
    ...roundedOutlineOps(ctx, o),
    stroke(),
    popGraphicsState(),
  );
}
