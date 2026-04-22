export interface RgbTuple {
  r: number;
  g: number;
  b: number;
}

export interface CmykTuple {
  c: number;
  m: number;
  y: number;
  k: number;
}

/**
 * Parse a CSS hex color (3, 4, 6 or 8 hex digits with a leading `#`) into
 * normalized 0..1 RGB components suitable for pdf-lib's `rgb()` factory.
 * Alpha channels and malformed inputs are ignored and fall back to black.
 */
export function hexToRgb(hex: string): RgbTuple {
  if (!hex || typeof hex !== 'string') return { r: 0, g: 0, b: 0 };
  let s = hex.trim();
  if (s.startsWith('#')) s = s.slice(1);
  if (s.length === 3 || s.length === 4) {
    const r = parseInt(s[0]! + s[0]!, 16);
    const g = parseInt(s[1]! + s[1]!, 16);
    const b = parseInt(s[2]! + s[2]!, 16);
    return { r: r / 255, g: g / 255, b: b / 255 };
  }
  if (s.length === 6 || s.length === 8) {
    const r = parseInt(s.slice(0, 2), 16);
    const g = parseInt(s.slice(2, 4), 16);
    const b = parseInt(s.slice(4, 6), 16);
    if (Number.isNaN(r) || Number.isNaN(g) || Number.isNaN(b)) {
      return { r: 0, g: 0, b: 0 };
    }
    return { r: r / 255, g: g / 255, b: b / 255 };
  }
  return { r: 0, g: 0, b: 0 };
}

/** Naive RGB → CMYK conversion (no ICC profile). Adequate for forcing a
 *  4-channel output when the source is authored in sRGB hex. */
export function rgbToCmyk({ r, g, b }: RgbTuple): CmykTuple {
  const k = 1 - Math.max(r, g, b);
  if (k >= 1) return { c: 0, m: 0, y: 0, k: 1 };
  const denom = 1 - k;
  return {
    c: (1 - r - k) / denom,
    m: (1 - g - k) / denom,
    y: (1 - b - k) / denom,
    k,
  };
}

/** Luminance-weighted RGB → grayscale (Rec. 601). */
export function rgbToGrayscale({ r, g, b }: RgbTuple): number {
  return 0.299 * r + 0.587 * g + 0.114 * b;
}
