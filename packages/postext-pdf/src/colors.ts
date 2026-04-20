export interface RgbTuple {
  r: number;
  g: number;
  b: number;
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
