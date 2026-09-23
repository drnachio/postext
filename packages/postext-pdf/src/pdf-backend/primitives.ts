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
  setStrokingColor,
  setLineWidth,
} from 'pdf-lib';
import { hexToRgb, rgbToCmyk, rgbToGrayscale } from '../colors';
import type { PdfColorSpace, RoundedOutline } from 'postext';
import type { PageTagger } from './tagging';

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
  ctx.page.drawRectangle({
    x,
    y,
    width: side,
    height: side,
    ...(fill ? { color: colorFromHex(fill, ctx.colorSpace) } : {}),
    borderColor: ink,
    borderWidth: Math.max(0.01, strokePx * scale),
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
  colorCache.set(key, color);
  return color;
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
  ctx.page.drawRectangle({
    x,
    y,
    width,
    height,
    color,
    ...(blendMode ? { blendMode } : {}),
  });
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
  // `encodeText` also registers the glyphs with the font's subset (the ids
  // it returns are subset ids), so it runs even when positions are added.
  const encoded = font.encodeText(text);
  const op = shapedOperator(font, text, encoded) ?? showText(encoded);
  if (cache.size >= ENCODE_CACHE_SLOTS) cache.clear();
  cache.set(text, op);
  return op;
}

function shapedOperator(font: PDFFont, text: string, encoded: PDFHexString): PDFOperator | undefined {
  const embedder = (font as unknown as { embedder?: { font?: ShapingFace; fontFeatures?: unknown } }).embedder;
  const face = embedder?.font;
  if (!face || typeof face.layout !== 'function' || !face.unitsPerEm) return undefined;
  const run = face.layout(text, embedder!.fontFeatures);
  const hex = encoded.asString();
  const count = run.glyphs.length;
  if (count === 0 || hex.length !== count * 4 || run.positions.length !== count) return undefined;
  // TJ numbers are thousandths of text space, subtracted from the pen: a
  // glyph drawn at `pen + xOffset` then advancing by `xAdvance` (not its
  // W width `advanceWidth`) is `-xOffset, glyph, -(xAdvance - w - xOffset)`.
  const toText = 1000 / face.unitsPerEm;
  const parts: Array<string | number> = [];
  let pendingHex = '';
  let pendingAdjust = 0;
  const flushHex = () => {
    if (pendingHex) parts.push(pendingHex);
    pendingHex = '';
  };
  for (let i = 0; i < count; i++) {
    const pos = run.positions[i]!;
    const lead = tjNumber(pendingAdjust - pos.xOffset * toText);
    if (lead !== 0) {
      flushHex();
      parts.push(lead);
    }
    pendingHex += hex.slice(i * 4, i * 4 + 4);
    pendingAdjust = -(pos.xAdvance - run.glyphs[i]!.advanceWidth - pos.xOffset) * toText;
  }
  flushHex();
  if (parts.length === 1) return undefined;
  const context = font.doc.context;
  const array = PDFArray.withContext(context);
  for (const part of parts) {
    array.push(typeof part === 'number' ? PDFNumber.of(part) : PDFHexString.of(part));
  }
  return PDFOperator.of(PDFOperatorNames.ShowTextAdjusted, [array]);
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

export function drawTextPx(
  ctx: PageCtx,
  text: string,
  xPx: number,
  baselinePx: number,
  font: PDFFont,
  sizePx: number,
  color: Color,
): void {
  if (!text) return;
  const { scale, pageHeightPt } = ctx;
  // The operators pdf-lib's `drawText` emits, with the encoding cached.
  ctx.page.pushOperators(
    pushGraphicsState(),
    beginText(),
    setFillingColor(color),
    setFontAndSize(fontKeyOn(ctx.page, font), sizePx * scale),
    setTextMatrix(1, 0, 0, 1, xPx * scale, pageHeightPt - baselinePx * scale),
    showTextShaped(font, text),
    endText(),
    popGraphicsState(),
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

/** Stroke a rounded outline (px) `thicknessPx` wide, centred on it. */
export function strokeOutlinePx(ctx: PageCtx, o: RoundedOutline, color: Color, thicknessPx: number): void {
  ctx.page.pushOperators(
    pushGraphicsState(),
    setStrokingColor(color),
    setLineWidth(Math.max(0.01, thicknessPx * ctx.scale)),
    ...roundedOutlineOps(ctx, o),
    stroke(),
    popGraphicsState(),
  );
}
