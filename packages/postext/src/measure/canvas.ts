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
  const width = ctx.measureText(text).width;

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

/** Drop all cached text widths. Must be called whenever font faces are
 *  (un)registered: widths measured against fallback glyphs are stale. */
export function clearTextWidthCache(): void {
  _widthCaches = new Map();
  _widthCacheEntries = 0;
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
