/**
 * A picture's colours as its own profile defines them (`print.imageColor`):
 * which profile reads its pixels — one assigned to every RGB picture, the
 * one it embeds, else sRGB — and how a greyscale picture's tones land on
 * the black plate.
 */

import {
  deviceToXyz,
  embeddedIccProfile,
  linearToSrgb,
  outputTransform,
  parseIccProfile,
  xyzToLab,
  srgbToLinear,
  type IccProfile,
} from 'postext';
import type { PrintColorMode } from './colorMode.js';

/** What a picture's pixels are: grey, RGB or CMYK. */
export type PictureKind = 'gray' | 'rgb' | 'cmyk';

/** The kind of a PNG (its colour type) or JPEG (its components). */
export function pictureKind(bytes: Uint8Array, format: 'png' | 'jpeg', jpegChannels: number | null): PictureKind {
  if (format === 'jpeg') return jpegChannels === 1 ? 'gray' : jpegChannels === 4 ? 'cmyk' : 'rgb';
  // IHDR colour type: 0 grey, 4 grey with alpha.
  const type = bytes[25];
  return type === 0 || type === 4 ? 'gray' : 'rgb';
}

const SPACE: Record<PictureKind, IccProfile['colorSpace']> = { gray: 'GRAY', rgb: 'RGB', cmyk: 'CMYK' };

/** Parsed embedded profiles, by the picture's bytes. */
const embedded = new WeakMap<Uint8Array, IccProfile | null>();

/** The profile the picture embeds, when it parses and fits its pixels. */
export function embeddedProfileOf(bytes: Uint8Array, kind: PictureKind): IccProfile | undefined {
  let profile = embedded.get(bytes);
  if (profile === undefined) {
    const icc = embeddedIccProfile(bytes);
    try {
      profile = icc ? parseIccProfile(icc) : null;
    } catch {
      profile = null;
    }
    embedded.set(bytes, profile);
  }
  return profile && profile.colorSpace === SPACE[kind] ? profile : undefined;
}

/** An sRGB profile under any of its names: reading through it is what
 *  happens anyway, so the picture keeps the sRGB path. */
export function isSrgb(profile: IccProfile): boolean {
  return /\bsRGB\b|IEC\s*61966-2[.-]1/i.test(profile.description);
}

/**
 * The profile a picture's pixels are read through, or undefined for the
 * sRGB default (an untagged RGB or grey picture, one tagged sRGB, or any
 * picture when `embeddedProfile` is `'ignore'`).
 */
export function sourceProfile(bytes: Uint8Array, kind: PictureKind, mode: PrintColorMode): IccProfile | undefined {
  if (kind === 'rgb' && mode.assignedRgbProfile) return mode.assignedRgbProfile;
  if (mode.config.imageColor.embeddedProfile === 'ignore') return undefined;
  const profile = embeddedProfileOf(bytes, kind);
  return profile && !(kind === 'rgb' && isSrgb(profile)) ? profile : undefined;
}

/** The luminance (Y, 0..1, paper white 1) of a grey value through its
 *  profile, else as sRGB shows it. */
function grayLuminance(profile: IccProfile | undefined): (v: number) => number {
  if (!profile) return srgbToLinear;
  const toXyz = deviceToXyz(profile);
  return (v) => toXyz([v]).Y;
}

const grayLuts = new WeakMap<PrintColorMode, Map<string, Uint8Array>>();

/**
 * The DeviceGray value (byte, 255 = paper) each grey byte prints at, on the
 * black plate: its luminance through its profile, matched with
 *
 * - `'profile'`: the output profile's black ramp, the press's dot gain in
 *   it (as a K-only grey of the same lightness);
 * - a dot gain `g` (percent at the 50 % tone): the ink `k` whose printed
 *   dot, `k + 4g·k(1 − k)`, gives the luminance between paper and the
 *   output profile's solid black.
 */
export function grayInkLut(mode: PrintColorMode, profile: IccProfile | undefined): Uint8Array {
  const gain = mode.config.imageColor.grayDotGain;
  const key = `${profile?.hash ?? 'srgb'}|${gain}`;
  let perMode = grayLuts.get(mode);
  if (!perMode) grayLuts.set(mode, (perMode = new Map()));
  const hit = perMode.get(key);
  if (hit) return hit;
  const luminance = grayLuminance(profile);
  // Neutrals on black alone, whatever the mode does with flat greys.
  const kOnly = outputTransform(mode.profile, { intent: mode.config.renderingIntent, blackPointCompensation: mode.config.blackPointCompensation, preserveNeutrals: true });
  const solidL = mode.transform.toLab({ c: 0, m: 0, y: 0, k: 1 }).L;
  const solidY = solidL > 8 ? ((solidL + 16) / 116) ** 3 : solidL / 903.3;
  const lut = new Uint8Array(256);
  for (let i = 0; i < 256; i++) {
    const y = Math.max(0, Math.min(1, luminance(i / 255)));
    let k: number;
    if (typeof gain === 'number') {
      const area = Math.max(0, Math.min(1, (1 - y) / (1 - solidY)));
      const g = gain / 100;
      // Solve 4g·k² − (1 + 4g)·k + area = 0 for its root in 0..1.
      k = g === 0 ? area : ((1 + 4 * g) - Math.sqrt((1 + 4 * g) ** 2 - 16 * g * area)) / (8 * g);
    } else {
      const s = linearToSrgb(y);
      k = kOnly.fromRgb(s, s, s).k;
    }
    lut[i] = Math.round((1 - Math.max(0, Math.min(1, k))) * 255);
  }
  perMode.set(key, lut);
  return lut;
}

/** Whether a CMYK picture's own profile is another press condition than
 *  the output's, to be converted (`imageColor.cmykProfile: 'convert'`). */
export function foreignCmyk(profile: IccProfile | undefined, mode: PrintColorMode): profile is IccProfile {
  return !!profile && mode.config.imageColor.cmykProfile === 'convert' && profile.hash !== mode.profile.hash && (!!profile.aToB[1] || !!profile.aToB[0]);
}

const cmykLuts = new WeakMap<PrintColorMode, Map<string, Float32Array>>();
const GRID = 9;

/**
 * The CMYK → CMYK table of a picture's press condition to the output's: a
 * 9-point grid a channel, each node the source CMYK read through its
 * profile (A2B, to D50 XYZ) and separated for the output with the mode's
 * intent and black-point compensation; the black-only axis kept black
 * only, matched in lightness.
 */
function cmykLut(mode: PrintColorMode, source: IccProfile): Float32Array {
  let perMode = cmykLuts.get(mode);
  if (!perMode) cmykLuts.set(mode, (perMode = new Map()));
  const hit = perMode.get(source.hash);
  if (hit) return hit;
  const toXyz = deviceToXyz(source, mode.config.renderingIntent);
  const t = outputTransform(mode.profile, { intent: mode.config.renderingIntent, blackPointCompensation: mode.config.blackPointCompensation, preserveNeutrals: false });
  const lut = new Float32Array(GRID ** 4 * 4);
  let o = 0;
  for (let c = 0; c < GRID; c++) for (let m = 0; m < GRID; m++) for (let y = 0; y < GRID; y++) for (let k = 0; k < GRID; k++) {
    const xyz = toXyz([c / (GRID - 1), m / (GRID - 1), y / (GRID - 1), k / (GRID - 1)]);
    // Black alone stays black alone (text and line work in a picture),
    // as dark as it printed on its own press.
    const out = c + m + y === 0 ? { c: 0, m: 0, y: 0, k: t.kOnlyFor(xyzToLab(xyz).L) } : t.fromXyz(xyz);
    lut[o++] = out.c;
    lut[o++] = out.m;
    lut[o++] = out.y;
    lut[o++] = out.k;
  }
  perMode.set(source.hash, lut);
  return lut;
}

/** CMYK pixels (one byte an ink, interleaved) separated again from their
 *  own press condition (`source`) for the output's: quadrilinear through
 *  {@link cmykLut}, the colours a picture repeats looked up once. */
export function convertCmykPixels(data: Uint8Array, mode: PrintColorMode, source: IccProfile): Uint8Array {
  const lut = cmykLut(mode, source);
  const out = new Uint8Array(data.length);
  const memo = new Map<number, number>();
  const s = GRID - 1;
  const stride = [GRID ** 3 * 4, GRID ** 2 * 4, GRID * 4, 4];
  const acc = [0, 0, 0, 0];
  for (let i = 0; i < data.length; i += 4) {
    const key = ((data[i]! << 24) | (data[i + 1]! << 16) | (data[i + 2]! << 8) | data[i + 3]!) >>> 0;
    const hit = memo.get(key);
    if (hit !== undefined) {
      out[i] = hit >>> 24;
      out[i + 1] = (hit >>> 16) & 255;
      out[i + 2] = (hit >>> 8) & 255;
      out[i + 3] = hit & 255;
      continue;
    }
    const base: number[] = [];
    const frac: number[] = [];
    for (let ch = 0; ch < 4; ch++) {
      const v = (data[i + ch]! / 255) * s;
      const b = Math.min(s - 1, Math.floor(v));
      base.push(b);
      frac.push(v - b);
    }
    acc.fill(0);
    for (let corner = 0; corner < 16; corner++) {
      let w = 1;
      let at = 0;
      for (let ch = 0; ch < 4; ch++) {
        const bit = (corner >> (3 - ch)) & 1;
        w *= bit ? frac[ch]! : 1 - frac[ch]!;
        at += (base[ch]! + bit) * stride[ch]!;
      }
      if (w === 0) continue;
      for (let ch = 0; ch < 4; ch++) acc[ch]! += w * lut[at + ch]!;
    }
    const bytes = acc.map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
    for (let ch = 0; ch < 4; ch++) out[i + ch] = bytes[ch]!;
    if (memo.size > 65536) memo.clear();
    memo.set(key, ((bytes[0]! << 24) | (bytes[1]! << 16) | (bytes[2]! << 8) | bytes[3]!) >>> 0);
  }
  return out;
}
