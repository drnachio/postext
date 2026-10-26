// Colours from hex in the page's colour mode, alpha graphics states and
// the pixel scale (#1276: split out of primitives.ts).
import { type Color, cmyk, grayscale, rgb, type PDFPage, PDFName, PDFOperator, setGraphicsState } from 'pdf-lib';
import { hexToRgb, colorAlpha, rgbToCmyk, rgbToGrayscale } from '../../colors.js';
import { type ColorMode, isPrintMode, modeKey, overPaper } from '../../print/colorMode.js';
import type { PageCtx } from '../primitives.js';

export function makeScale(dpi: number): number {
  return 72 / dpi;
}

export function whiteColor(colorSpace: ColorMode): Color {
  if (colorSpace === 'cmyk' || isPrintMode(colorSpace)) return cmyk(0, 0, 0, 0);
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
export function colorFromHex(hex: string, colorSpace: ColorMode): Color {
  const key = `${modeKey(colorSpace)}|${hex}`;
  const cached = colorCache.get(key);
  if (cached) return cached;
  const c = hexToRgb(hex);
  let color: Color;
  if (isPrintMode(colorSpace)) {
    // Through the output profile; PDF/X-1a has no transparency, so a
    // translucent colour is set as it would print over the paper.
    let alpha = colorAlpha(hex);
    let [r, g, b] = [c.r, c.g, c.b];
    if (alpha < 1 && colorSpace.flattenTransparency) {
      [r, g, b] = overPaper(r, g, b, alpha);
      alpha = 1;
    }
    const exact = colorSpace.authored.get(hex.slice(0, 7).toLowerCase());
    if (exact && alpha < 1 && colorSpace.flattenTransparency) {
      // A tint of the authored ink mix stands in for it over the paper.
      const t = colorAlpha(hex);
      color = cmyk(round4((exact.c / 100) * t), round4((exact.m / 100) * t), round4((exact.y / 100) * t), round4((exact.k / 100) * t));
    } else if (exact) {
      color = cmyk(round4(exact.c / 100), round4(exact.m / 100), round4(exact.y / 100), round4(exact.k / 100));
    } else {
      const k = colorSpace.transform.fromRgb(r, g, b);
      color = cmyk(round4(k.c), round4(k.m), round4(k.y), round4(k.k));
    }
    if (alpha < 1) (color as AlphaColor).alpha = alpha;
    colorCache.set(key, color);
    return color;
  }
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

/** Four decimals: enough for a separation, and exact K 1 stays exact. */
function round4(n: number): number {
  return Math.round(n * 10000) / 10000;
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
export function opt(op: PDFOperator | null): PDFOperator[] {
  return op ? [op] : [];
}

/** Back-compat alias — defaults to RGB. */
export function rgbFromHex(hex: string): Color {
  return colorFromHex(hex, 'rgb');
}
