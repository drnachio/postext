// A swatch reference as a colour a screen can show.
//
// No colour management: a CMYK value becomes sRGB by the plain device
// formula (each of red, green and blue is what the black and its own ink
// leave), which is what a preview without the document's profiles can
// say. Lab is exact: IDML's Lab is relative to D50, so it goes through
// XYZ and a Bradford adaptation to sRGB's D65 white.
//
// A mixed ink the file gives no process equivalent for is the sum of its
// inks, channel by channel: what a proof of its plates in process would
// lay, not how the spot ink looks printed over the others.

import type { ColourSpace, IdmlColor, IdmlDocument, IdmlSwatch } from '../model/document.js';

export interface ResolvedColour {
  /** `#rrggbb`, the tint already applied. */
  hex: string;
  /** The swatch's own CMYK (0–100), before the tint, when it has one. */
  cmyk?: [number, number, number, number];
  /** Name of the spot ink. */
  spot?: string;
  /** A mixed ink made from its inks, the file giving it no process
   *  equivalent: the spot inks that went into `cmyk` (none when every ink
   *  is a process one). */
  mixedSpots?: string[];
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

type Cmyk = [number, number, number, number];

/** A screen colour's naive CMYK (0–100 from 0–255): the most black the
 *  colour takes, and what each ink adds to it. */
export function rgbToCmyk(r: number, g: number, b: number): Cmyk {
  const [x, y, z] = [clamp(r, 0, 255) / 255, clamp(g, 0, 255) / 255, clamp(b, 0, 255) / 255];
  const k = 1 - Math.max(x, y, z);
  if (k >= 1) return [0, 0, 0, 100];
  return [((1 - x - k) / (1 - k)) * 100, ((1 - y - k) / (1 - k)) * 100, ((1 - z - k) / (1 - k)) * 100, k * 100];
}

const PROCESS_INK: Record<string, number> = { Cyan: 0, Magenta: 1, Yellow: 2, Black: 3 };

/** An ink's name out of its reference (`Ink/$ID/Process%20Black`). A name
 *  with a stray `%` is not an encoded one: it is kept as written. */
function inkName(ref: string): string {
  const raw = ref.replace(/^Ink\//, '');
  let name = raw;
  try {
    name = decodeURIComponent(raw);
  } catch {
    // Kept as written.
  }
  return name.replace(/^\$ID\//, '');
}

/** The spot colour an ink prints: the swatch named after it, by its
 *  reference or, when its `Self` is not its name, by its name. */
function spotOf(doc: IdmlDocument, name: string): IdmlColor | undefined {
  const direct = doc.swatches.get(`Color/${name}`);
  if (direct?.kind === 'color') return direct;
  for (const s of doc.swatches.values()) if (s.kind === 'color' && s.model === 'Spot' && s.name === name) return s;
  return undefined;
}

/** A mixed ink InDesign gave no process equivalent for, made from its
 *  inks: each a process ink or a spot colour's CMYK (its values, its CMYK
 *  alternate or, with neither, its screen colour's), at its percentage,
 *  added up channel by channel and held at 100. `spots` names the spot
 *  inks that went into it. */
function mixedCmyk(doc: IdmlDocument, inks: readonly string[], values: readonly number[]): { cmyk: Cmyk; spots: string[] } | undefined {
  if (inks.length === 0 || inks.length !== values.length || values.some((v) => !Number.isFinite(v))) return undefined;
  const cmyk: Cmyk = [0, 0, 0, 0];
  const spots: string[] = [];
  for (const [i, ink] of inks.entries()) {
    const name = inkName(ink);
    const share = clamp(values[i]!, 0, 100) / 100;
    const process = /^Process (Cyan|Magenta|Yellow|Black)$/.exec(name)?.[1];
    if (process) {
      cmyk[PROCESS_INK[process]!]! += 100 * share;
      continue;
    }
    const spot = spotOf(doc, name);
    const rgb = spot ? rgbOf(spot.space, spot.value) : undefined;
    const c = spot ? (resolve(doc, spot, 1, 0)?.cmyk ?? (rgb ? rgbToCmyk(rgb[0], rgb[1], rgb[2]) : undefined)) : undefined;
    if (!c) return undefined;
    for (let k = 0; k < 4; k++) cmyk[k]! += c[k]! * share;
    spots.push(spot!.name || name);
  }
  return { cmyk: [clamp(cmyk[0], 0, 100), clamp(cmyk[1], 0, 100), clamp(cmyk[2], 0, 100), clamp(cmyk[3], 0, 100)], spots };
}

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
      const own = rgbOf(swatch.space, swatch.value);
      // No process equivalent in the file: the colour is made from its inks.
      const mixed = own ? undefined : mixedCmyk(doc, swatch.inks, swatch.values);
      const rgb = own ?? (mixed ? cmykToRgb(...mixed.cmyk) : undefined);
      if (!rgb) return undefined;
      const out: ResolvedColour = { hex: hexOf(tinted(rgb, tint)), tint, kind: 'mixedInk' };
      if (swatch.space === 'CMYK' && swatch.value.length >= 4) out.cmyk = [swatch.value[0]!, swatch.value[1]!, swatch.value[2]!, swatch.value[3]!];
      if (mixed) {
        out.cmyk = mixed.cmyk;
        out.mixedSpots = mixed.spots;
      }
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
