import { cjkMarkPieces } from './cjkClasses';
import { hasCJK } from './cjk';

let _measureCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null = null;
/** Font string currently set on the measure context, to skip redundant
 *  `ctx.font` assignments (each assignment re-parses the shorthand). */
let _currentFont = '';

function getMeasureCtx(): OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D {
  if (!_measureCtx) {
    if (typeof OffscreenCanvas !== 'undefined') {
      _measureCtx = new OffscreenCanvas(1, 1).getContext('2d')!;
    } else {
      _measureCtx = document.createElement('canvas').getContext('2d')!;
    }
    _currentFont = '';
  }
  return _measureCtx;
}

// Word-level width cache. Text measurement is the engine's hottest call:
// tokenizers measure every word (plus hyphenation prefixes), and natural
// language repeats words constantly. Keyed font → text → width so the key
// needs no string concatenation. Cleared wholesale when it grows past the
// cap (rare) or when fonts change (see clearTextWidthCache).
const MAX_WIDTH_CACHE_ENTRIES = 100_000;
let _widthCaches = new Map<string, Map<string, number>>();
let _widthCacheEntries = 0;

export function measureTextWidth(text: string, font: string): number {
  let byText = _widthCaches.get(font);
  if (byText === undefined) {
    byText = new Map();
    _widthCaches.set(font, byText);
  }
  const cached = byText.get(text);
  if (cached !== undefined) return cached;

  const ctx = getMeasureCtx();
  if (font !== _currentFont) {
    ctx.font = font;
    _currentFont = font;
  }
  // Two CJK marks side by side (`）》`, `”“`) are measured apart: the
  // browser would set the first half width in one run (see
  // `cjkMarkCuts`), and the renderers paint them apart. Text with no CJK
  // is never cut (`markCuts`): one measure, with no cut to look for.
  let width = 0;
  if (!hasCJK(text)) width += ctx.measureText(text).width;
  else for (const piece of cjkMarkPieces(text, true)) width += ctx.measureText(piece).width;

  if (_widthCacheEntries >= MAX_WIDTH_CACHE_ENTRIES) {
    _widthCaches = new Map();
    _widthCacheEntries = 0;
    byText = new Map();
    _widthCaches.set(font, byText);
  }
  byText.set(text, width);
  _widthCacheEntries++;
  return width;
}

// Widths of runs as the browser sets them (see `measureRunWidth`).
let _runCaches = new Map<string, Map<string, number>>();
let _runCacheEntries = 0;

/**
 * The width of `text` set in one run, as the browser paints it: two CJK
 * marks that meet are not measured apart (see {@link measureTextWidth}).
 * For the pieces a renderer paints apart (`markPieces`), each of which
 * holds only pairs the layout measured whole.
 */
export function measureRunWidth(text: string, font: string): number {
  let byText = _runCaches.get(font);
  if (byText === undefined) {
    byText = new Map();
    _runCaches.set(font, byText);
  }
  const cached = byText.get(text);
  if (cached !== undefined) return cached;
  const ctx = getMeasureCtx();
  if (font !== _currentFont) {
    ctx.font = font;
    _currentFont = font;
  }
  const width = ctx.measureText(text).width;
  if (_runCacheEntries >= MAX_WIDTH_CACHE_ENTRIES) {
    _runCaches = new Map();
    _runCacheEntries = 0;
    byText = new Map();
    _runCaches.set(font, byText);
  }
  byText.set(text, width);
  _runCacheEntries++;
  return width;
}

/** Drop all cached text widths. Must be called whenever font faces are
 *  (un)registered: widths measured against fallback glyphs are stale. */
export function clearTextWidthCache(): void {
  _widthCaches = new Map();
  _widthCacheEntries = 0;
  _runCaches = new Map();
  _runCacheEntries = 0;
  for (const listener of _fontChangeListeners) listener();
}

const _fontChangeListeners = new Set<() => void>();

/** Called whenever {@link clearTextWidthCache} drops the widths (fonts
 *  changed): other font-dependent caches clear with it. */
export function onTextWidthCacheClear(listener: () => void): void {
  _fontChangeListeners.add(listener);
}

/** The ink box of `text` in `font` above and below the alphabetic
 *  baseline (px), or null when the measurer gives no ink metrics. Not
 *  cached. */
export function measureInkBox(text: string, font: string): { ascent: number; descent: number } | null {
  const ctx = getMeasureCtx();
  if (font !== _currentFont) {
    ctx.font = font;
    _currentFont = font;
  }
  const m = ctx.measureText(text) as Partial<TextMetrics>;
  const ascent = m.actualBoundingBoxAscent;
  const descent = m.actualBoundingBoxDescent;
  if (typeof ascent !== 'number' || typeof descent !== 'number' || !Number.isFinite(ascent) || !Number.isFinite(descent)) return null;
  return { ascent, descent };
}

/** How far the ink of a text reaches above and below the baseline at each
 *  pixel column along it (see {@link measureInkProfile}). */
export interface InkProfile {
  /** Where column 0 stands, px from the pen's origin (negative when the
   *  ink overhangs the origin). */
  start: number;
  /** The text's advance, px. */
  advance: number;
  /** Per column: px of ink above the baseline (−Infinity: no ink). */
  above: Float32Array;
  /** Per column: px of ink below the baseline (−Infinity: no ink). */
  below: Float32Array;
}

let _profileCtx: OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null | undefined;

/** Alpha under which a pixel is left out: a faint fringe. */
const INK_ALPHA = 32;

/**
 * The ink of `text` in `font` column by column: the text is painted from
 * its left edge, left to right as the page paints it, and each pixel
 * column records its highest and lowest inked pixel. Null when nothing can
 * be painted and read back (no canvas, or a measurer without pixels) or
 * the text has no ink. Not cached.
 */
export function measureInkProfile(text: string, font: string): InkProfile | null {
  if (_profileCtx === undefined) {
    _profileCtx = null;
    try {
      const canvas = typeof OffscreenCanvas !== 'undefined' ? new OffscreenCanvas(1, 1) : typeof document !== 'undefined' ? document.createElement('canvas') : null;
      const ctx = canvas?.getContext('2d', { willReadFrequently: true } as CanvasRenderingContext2DSettings) as OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null | undefined;
      if (ctx && typeof ctx.fillText === 'function' && typeof ctx.getImageData === 'function') _profileCtx = ctx;
    } catch {
      _profileCtx = null;
    }
  }
  const ctx = _profileCtx;
  if (!ctx) return null;
  try {
    ctx.font = font;
    const m = ctx.measureText(text);
    const { actualBoundingBoxLeft: left, actualBoundingBoxRight: right, actualBoundingBoxAscent: ascent, actualBoundingBoxDescent: descent } = m;
    if (![left, right, ascent, descent].every((v) => typeof v === 'number' && Number.isFinite(v))) return null;
    const pad = 2;
    const x0 = Math.floor(-left) - pad;
    const width = Math.ceil(right) + pad - x0;
    const top = Math.ceil(ascent) + pad;
    const height = top + Math.ceil(descent) + pad;
    if (width <= 0 || height <= 0 || width * height > 4_000_000) return null;
    const canvas = ctx.canvas as { width: number; height: number };
    if (canvas.width < width) canvas.width = width;
    if (canvas.height < height) canvas.height = height;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if ('direction' in ctx) ctx.direction = 'ltr';
    ctx.font = font;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = '#000';
    ctx.fillText(text, -x0, top);
    const data = ctx.getImageData(0, 0, width, height).data;
    const above = new Float32Array(width).fill(-Infinity);
    const below = new Float32Array(width).fill(-Infinity);
    let inked = false;
    // The outermost pixel of a column is only partly covered: its alpha
    // says how much, so the edge stands that far into it.
    for (let x = 0; x < width; x++) {
      for (let y = 0; y < height; y++) {
        const a = data[(y * width + x) * 4 + 3]!;
        if (a < INK_ALPHA) continue;
        above[x] = top - y - 1 + a / 255;
        inked = true;
        break;
      }
      for (let y = height - 1; y >= 0; y--) {
        const a = data[(y * width + x) * 4 + 3]!;
        if (a < INK_ALPHA) continue;
        below[x] = y - top + a / 255;
        break;
      }
    }
    return inked ? { start: x0, advance: m.width, above, below } : null;
  } catch {
    return null;
  }
}

/** Where the ink of `text` in `font` starts and ends along the line, px
 *  from the pen's origin (the start is negative when the ink overhangs
 *  it), or null when the measurer gives no ink metrics or the text has no
 *  ink. Not cached. */
export function measureInkExtent(text: string, font: string): { start: number; end: number } | null {
  const ctx = getMeasureCtx();
  if (font !== _currentFont) {
    ctx.font = font;
    _currentFont = font;
  }
  const m = ctx.measureText(text) as Partial<TextMetrics>;
  const left = m.actualBoundingBoxLeft;
  const right = m.actualBoundingBoxRight;
  if (typeof left !== 'number' || typeof right !== 'number' || !Number.isFinite(left) || !Number.isFinite(right)) return null;
  const start = -left;
  return right > start ? { start, end: right } : null;
}

/** Measure a short glyph (e.g. a list bullet) in the given font. */
export function measureGlyphWidth(text: string, font: string): number {
  return measureTextWidth(text, font);
}

/** Compute the normal space width for a given font, used to express justified
 *  spacing as a multiplier of the natural space. */
export function normalSpaceWidthFor(font: string): number {
  return measureTextWidth(' ', font);
}

export function cleanSoftHyphens(text: string): string {
  return text.replace(/\u00AD/g, '');
}
