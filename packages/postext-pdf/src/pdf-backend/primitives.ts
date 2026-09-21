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
  PDFHexString,
  PDFName,
  beginText,
  endText,
  setFillingColor,
  setFontAndSize,
  showText,
  setTextMatrix,
} from 'pdf-lib';
import { hexToRgb, rgbToCmyk, rgbToGrayscale } from '../colors';
import type { PdfColorSpace } from 'postext';
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
// the same words, over and over. The encoded glyph string of a (font, text)
// pair never changes, so it is shaped once and reused; the font's resource
// key on a page likewise.
const encodedByFont = new WeakMap<PDFFont, Map<string, PDFHexString>>();
const ENCODE_CACHE_SLOTS = 50_000;

function encodeCached(font: PDFFont, text: string): PDFHexString {
  let cache = encodedByFont.get(font);
  if (!cache) {
    cache = new Map();
    encodedByFont.set(font, cache);
  }
  const hit = cache.get(text);
  if (hit) return hit;
  // `encodeText` also registers the glyphs with the font's subset; a first
  // call per text keeps that side effect.
  const encoded = font.encodeText(text);
  if (cache.size >= ENCODE_CACHE_SLOTS) cache.clear();
  cache.set(text, encoded);
  return encoded;
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
    showText(encodeCached(font, text)),
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
