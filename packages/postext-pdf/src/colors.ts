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

export interface RgbaTuple extends RgbTuple {
  /** Opacity, 0 (clear) … 1 (opaque). */
  a: number;
}

const HEX_DIGITS_RE = /^[0-9a-f]+$/i;

/** A CSS `rgb()` channel (`0…255` or a percentage) as 0..1; null when
 *  malformed. */
function rgbChannel(token: string): number | null {
  const pct = token.endsWith('%');
  const n = Number(pct ? token.slice(0, -1) : token);
  if (token === '' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, pct ? n / 100 : n / 255));
}

/** A CSS alpha value (`0…1` or a percentage); null when malformed. */
function alphaChannel(token: string): number | null {
  const pct = token.endsWith('%');
  const n = Number(pct ? token.slice(0, -1) : token);
  if (token === '' || !Number.isFinite(n)) return null;
  return Math.max(0, Math.min(1, pct ? n / 100 : n));
}

/**
 * Parse the colour strings a postext document carries — `#rgb`, `#rgba`,
 * `#rrggbb`, `#rrggbbaa`, `rgb()` / `rgba()` (comma or space syntax, with a
 * `/ alpha`) and `transparent` — into 0..1 RGB components plus an opacity.
 * Null for anything else (a keyword such as `red` or `none`, a typo).
 */
export function parseCssColor(value: string): RgbaTuple | null {
  if (!value || typeof value !== 'string') return null;
  const s = value.trim();
  if (s.toLowerCase() === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (s.startsWith('#')) {
    const h = s.slice(1);
    if (!HEX_DIGITS_RE.test(h)) return null;
    const byte = (i: number, short: boolean) => parseInt(short ? h[i]! + h[i]! : h.slice(i * 2, i * 2 + 2), 16) / 255;
    if (h.length === 3 || h.length === 4) {
      return { r: byte(0, true), g: byte(1, true), b: byte(2, true), a: h.length === 4 ? byte(3, true) : 1 };
    }
    if (h.length === 6 || h.length === 8) {
      return { r: byte(0, false), g: byte(1, false), b: byte(2, false), a: h.length === 8 ? byte(3, false) : 1 };
    }
    return null;
  }
  const fn = /^rgba?\(\s*([^)]*?)\s*\)$/i.exec(s);
  if (!fn) return null;
  // `r, g, b[, a]` or `r g b[ / a]`.
  const body = fn[1]!;
  let parts: string[];
  let alpha: string | undefined;
  if (body.includes(',')) {
    parts = body.split(',').map((p) => p.trim());
    if (parts.length === 4) alpha = parts.pop();
  } else {
    const [channels, slashAlpha] = body.split('/').map((p) => p.trim());
    parts = (channels ?? '').split(/\s+/).filter(Boolean);
    alpha = slashAlpha;
  }
  if (parts.length !== 3) return null;
  const [r, g, b] = parts.map(rgbChannel);
  const a = alpha === undefined ? 1 : alphaChannel(alpha);
  if (r == null || g == null || b == null || a == null) return null;
  return { r, g, b, a };
}

/**
 * Parse a document colour (see {@link parseCssColor}) into normalized 0..1
 * RGB components suitable for pdf-lib's `rgb()` factory. The alpha channel
 * is dropped (read it with {@link colorAlpha}); malformed inputs fall back
 * to black.
 */
export function hexToRgb(hex: string): RgbTuple {
  const c = parseCssColor(hex);
  return c ? { r: c.r, g: c.g, b: c.b } : { r: 0, g: 0, b: 0 };
}

/** Opacity of a document colour, 0 … 1; 1 when it carries none or does not
 *  parse. */
export function colorAlpha(value: string): number {
  return parseCssColor(value)?.a ?? 1;
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
