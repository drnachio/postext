// A swatch reference as a colour a screen can show.
//
// No colour management: a CMYK value becomes sRGB by the plain device
// formula (each of red, green and blue is what the black and its own ink
// leave), which is what a preview without the document's profiles can
// say. Lab is exact: IDML's Lab is relative to D50, so it goes through
// XYZ and a Bradford adaptation to sRGB's D65 white.

import type { ColourSpace, IdmlDocument, IdmlSwatch } from '../model/document.js';

export interface ResolvedColour {
  /** `#rrggbb`, the tint already applied. */
  hex: string;
  /** The swatch's own CMYK (0–100), before the tint, when it has one. */
  cmyk?: [number, number, number, number];
  /** Name of the spot ink. */
  spot?: string;
  /** 0–1: how much of the swatch is laid; the rest is paper. */
  tint: number;
  kind: 'process' | 'spot' | 'paper' | 'black' | 'registration' | 'gradient' | 'mixedInk';
  /** A gradient's stops, each resolved; `hex` is then the first stop's. */
  stops?: { location: number; midpoint: number; colour: ResolvedColour | undefined }[];
  gradientType?: 'Linear' | 'Radial';
}

type Rgb = [number, number, number];

const clamp = (n: number, lo: number, hi: number): number => (n < lo ? lo : n > hi ? hi : n);
const byte = (n: number): number => Math.round(clamp(n, 0, 255));

export const hexOf = (rgb: readonly number[]): string => `#${[0, 1, 2].map((i) => byte(rgb[i] ?? 0).toString(16).padStart(2, '0')).join('')}`;

/** CMYK 0–100 → sRGB 0–255, device formula. */
export function cmykToRgb(c: number, m: number, y: number, k: number): Rgb {
  const key = 1 - clamp(k, 0, 100) / 100;
  return [255 * (1 - clamp(c, 0, 100) / 100) * key, 255 * (1 - clamp(m, 0, 100) / 100) * key, 255 * (1 - clamp(y, 0, 100) / 100) * key];
}

/** CIE Lab (D50) → sRGB 0–255. */
export function labToRgb(L: number, a: number, b: number): Rgb {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const e = 216 / 24389;
  const k = 24389 / 27;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? fy ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  // D50 white.
  const X = xr * 0.96422;
  const Y = yr;
  const Z = zr * 0.82521;
  // Bradford, D50 → D65.
  const x = 0.9555766 * X - 0.0230393 * Y + 0.0631636 * Z;
  const y = -0.0282895 * X + 1.0099416 * Y + 0.0210077 * Z;
  const z = 0.0122982 * X - 0.020483 * Y + 1.3299098 * Z;
  // XYZ (D65) → linear sRGB, then the transfer curve.
  const lin = [3.2404542 * x - 1.5371385 * y - 0.4985314 * z, -0.969266 * x + 1.8760108 * y + 0.041556 * z, 0.0556434 * x - 0.2040259 * y + 1.0572252 * z];
  const gamma = (v: number): number => 255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * Math.max(v, 0) ** (1 / 2.4) - 0.055);
  return [gamma(lin[0]!), gamma(lin[1]!), gamma(lin[2]!)];
}

/** HSB (hue 0–360, saturation and brightness 0–100) → sRGB 0–255. */
export function hsbToRgb(h: number, s: number, v: number): Rgb {
  const sat = clamp(s, 0, 100) / 100;
  const val = clamp(v, 0, 100) / 100;
  const f = (n: number): number => {
    const k = (n + (((h % 360) + 360) % 360) / 60) % 6;
    return 255 * (val - val * sat * Math.max(0, Math.min(k, 4 - k, 1)));
  };
  return [f(5), f(3), f(1)];
}

function rgbOf(space: ColourSpace, v: readonly number[]): Rgb | undefined {
  const n = (i: number): number => v[i] ?? 0;
  if (v.some((x) => !Number.isFinite(x))) return undefined;
  if (space === 'CMYK' && v.length >= 4) return cmykToRgb(n(0), n(1), n(2), n(3));
  if (space === 'RGB' && v.length >= 3) return [n(0), n(1), n(2)];
  if (space === 'LAB' && v.length >= 3) return labToRgb(n(0), n(1), n(2));
  if (space === 'HSB' && v.length >= 3) return hsbToRgb(n(0), n(1), n(2));
  return undefined;
}

/** `rgb` at `tint` (0–1) over white paper. */
const tinted = (rgb: Rgb, tint: number): Rgb => [255 - (255 - rgb[0]) * tint, 255 - (255 - rgb[1]) * tint, 255 - (255 - rgb[2]) * tint];

function resolve(doc: IdmlDocument, swatch: IdmlSwatch, tint: number, depth: number): ResolvedColour | undefined {
  switch (swatch.kind) {
    case 'none':
      return undefined;
    case 'color': {
      const rgb = rgbOf(swatch.space, swatch.value);
      if (!rgb) return undefined;
      const kind: ResolvedColour['kind'] = swatch.special === 'paper' ? 'paper' : swatch.special === 'black' ? 'black' : swatch.special === 'registration' || swatch.model === 'Registration' ? 'registration' : swatch.model === 'Spot' ? 'spot' : 'process';
      const out: ResolvedColour = { hex: hexOf(tinted(rgb, tint)), tint, kind };
      if (swatch.space === 'CMYK' && swatch.value.length >= 4) out.cmyk = [swatch.value[0]!, swatch.value[1]!, swatch.value[2]!, swatch.value[3]!];
      if (swatch.model === 'Spot') {
        out.spot = swatch.name;
        // A spot ink defined in Lab or RGB prints from its CMYK alternate.
        if (!out.cmyk && swatch.alternate?.space === 'CMYK' && swatch.alternate.value.length >= 4) out.cmyk = [swatch.alternate.value[0]!, swatch.alternate.value[1]!, swatch.alternate.value[2]!, swatch.alternate.value[3]!];
      }
      return out;
    }
    case 'tint': {
      // A tint of a tint is not something InDesign writes; a chain that
      // comes back to itself must still end.
      const base = doc.swatches.get(swatch.base);
      if (!base || depth > 8) return undefined;
      return resolve(doc, base, tint * (clamp(swatch.tint, 0, 100) / 100), depth + 1);
    }
    case 'mixedInk': {
      const rgb = rgbOf(swatch.space, swatch.value);
      if (!rgb) return undefined;
      const out: ResolvedColour = { hex: hexOf(tinted(rgb, tint)), tint, kind: 'mixedInk' };
      if (swatch.space === 'CMYK' && swatch.value.length >= 4) out.cmyk = [swatch.value[0]!, swatch.value[1]!, swatch.value[2]!, swatch.value[3]!];
      return out;
    }
    case 'gradient': {
      if (depth > 8) return undefined;
      const stops = swatch.stops.map((s) => {
        const of = doc.swatches.get(s.color);
        // A stop is a colour; a gradient as a stop of itself is not read.
        return { location: s.location, midpoint: s.midpoint, colour: of && of.kind !== 'gradient' ? resolve(doc, of, tint, depth + 1) : undefined };
      });
      const first = stops.find((s) => s.colour)?.colour;
      if (!first) return undefined;
      return { hex: first.hex, tint, kind: 'gradient', stops, gradientType: swatch.type, ...(first.cmyk ? { cmyk: first.cmyk } : {}) };
    }
  }
}

/** The colour of a swatch reference (`Color/Black`, `Tint/…`,
 *  `Gradient/…`), at a tint of its own when the text or the item sets one
 *  (0–100; InDesign writes -1 for none).
 *
 *  Undefined for `Swatch/None` (nothing is drawn) and for a reference the
 *  document has no swatch for: tell the two apart with
 *  {@link isNoColour} when the difference matters. */
export function resolveColour(doc: IdmlDocument, ref: string | undefined, tint?: number): ResolvedColour | undefined {
  if (!ref) return undefined;
  const swatch = doc.swatches.get(ref);
  if (!swatch) return undefined;
  const t = tint !== undefined && Number.isFinite(tint) && tint >= 0 ? clamp(tint, 0, 100) / 100 : 1;
  return resolve(doc, swatch, t, 0);
}

/** The reference is the swatch that draws nothing. */
export function isNoColour(doc: IdmlDocument, ref: string | undefined): boolean {
  if (!ref || ref === 'n') return true;
  return doc.swatches.get(ref)?.kind === 'none' || ref === 'Swatch/None';
}
