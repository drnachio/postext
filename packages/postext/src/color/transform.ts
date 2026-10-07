/**
 * Colour transforms between the document's sRGB colours and a CMYK output
 * profile: the separation postext-pdf writes, and the soft proof the
 * canvas viewers paint (CMYK → Lab → screen sRGB).
 */

import type { Channels, IccProfile, LutPipeline, PcsEncoding, XYZ } from './icc';

export type RenderingIntent = 'perceptual' | 'relative' | 'saturation' | 'absolute';

export interface Lab {
  L: number;
  a: number;
  b: number;
}

export interface Cmyk {
  /** 0..1 each. */
  c: number;
  m: number;
  y: number;
  k: number;
}

export const D50: XYZ = { X: 0.9642, Y: 1, Z: 0.8249 };

// ---------------------------------------------------------------------------
// Lab / XYZ

function labF(t: number): number {
  return t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116;
}

function labFInv(t: number): number {
  const t3 = t * t * t;
  return t3 > 216 / 24389 ? t3 : (116 * t - 16) / (24389 / 27);
}

export function xyzToLab(v: XYZ, white: XYZ = D50): Lab {
  const fx = labF(v.X / white.X);
  const fy = labF(v.Y / white.Y);
  const fz = labF(v.Z / white.Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function labToXyz(lab: Lab, white: XYZ = D50): XYZ {
  const fy = (lab.L + 16) / 116;
  const fx = fy + lab.a / 500;
  const fz = fy - lab.b / 200;
  return { X: white.X * labFInv(fx), Y: white.Y * labFInv(fy), Z: white.Z * labFInv(fz) };
}

/** CIE76 colour difference. */
export function deltaE(p: Lab, q: Lab): number {
  return Math.hypot(p.L - q.L, p.a - q.a, p.b - q.b);
}

function decodePcs(x: Channels, enc: PcsEncoding): Lab {
  switch (enc) {
    case 'lab-v2':
      return { L: (x[0]! * 65535) / 652.8, a: (x[1]! * 65535) / 256 - 128, b: (x[2]! * 65535) / 256 - 128 };
    case 'lab-8':
      return { L: x[0]! * 100, a: x[1]! * 255 - 128, b: x[2]! * 255 - 128 };
    case 'lab-v4':
      return { L: x[0]! * 100, a: x[1]! * 255 - 128, b: x[2]! * 255 - 128 };
    case 'xyz': {
      const k = 65535 / 32768;
      return xyzToLab({ X: x[0]! * k, Y: x[1]! * k, Z: x[2]! * k });
    }
  }
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

function encodePcs(lab: Lab, enc: PcsEncoding): Channels {
  switch (enc) {
    case 'lab-v2':
      return [clamp01((lab.L * 652.8) / 65535), clamp01(((lab.a + 128) * 256) / 65535), clamp01(((lab.b + 128) * 256) / 65535)];
    case 'lab-8':
    case 'lab-v4':
      return [clamp01(lab.L / 100), clamp01((lab.a + 128) / 255), clamp01((lab.b + 128) / 255)];
    case 'xyz': {
      const v = labToXyz(lab);
      const k = 32768 / 65535;
      return [clamp01(v.X * k), clamp01(v.Y * k), clamp01(v.Z * k)];
    }
  }
}

// ---------------------------------------------------------------------------
// sRGB (D50-adapted with Bradford, as ICC profiles carry it)

const SRGB_TO_XYZ_D50 = [
  0.4360747, 0.3850649, 0.1430804,
  0.2225045, 0.7168786, 0.0606169,
  0.0139322, 0.0971045, 0.7141733,
];
const XYZ_D50_TO_SRGB = [
  3.1338561, -1.6168667, -0.4906146,
  -0.9787684, 1.9161415, 0.033454,
  0.0719453, -0.2289914, 1.4052427,
];

export function srgbToLinear(v: number): number {
  return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
}

export function linearToSrgb(v: number): number {
  const c = v <= 0.0031308 ? 12.92 * v : 1.055 * Math.pow(v, 1 / 2.4) - 0.055;
  return clamp01(c);
}

export function srgbToXyz(r: number, g: number, b: number): XYZ {
  const R = srgbToLinear(r);
  const G = srgbToLinear(g);
  const B = srgbToLinear(b);
  const m = SRGB_TO_XYZ_D50;
  return {
    X: m[0]! * R + m[1]! * G + m[2]! * B,
    Y: m[3]! * R + m[4]! * G + m[5]! * B,
    Z: m[6]! * R + m[7]! * G + m[8]! * B,
  };
}

export function xyzToSrgb(v: XYZ): [number, number, number] {
  const m = XYZ_D50_TO_SRGB;
  return [
    linearToSrgb(m[0]! * v.X + m[1]! * v.Y + m[2]! * v.Z),
    linearToSrgb(m[3]! * v.X + m[4]! * v.Y + m[5]! * v.Z),
    linearToSrgb(m[6]! * v.X + m[7]! * v.Y + m[8]! * v.Z),
  ];
}

export function srgbToLab(r: number, g: number, b: number): Lab {
  return xyzToLab(srgbToXyz(r, g, b));
}

export function labToSrgb(lab: Lab): [number, number, number] {
  return xyzToSrgb(labToXyz(lab));
}

// ---------------------------------------------------------------------------
// Output profile helpers

function intentIndex(intent: RenderingIntent): 0 | 1 | 2 {
  return intent === 'perceptual' ? 0 : intent === 'saturation' ? 2 : 1;
}

function pick(table: Partial<Record<0 | 1 | 2, LutPipeline>>, intent: RenderingIntent): LutPipeline | undefined {
  const i = intentIndex(intent);
  return table[i] ?? table[1] ?? table[0] ?? table[2];
}

/** Device CMYK (0..1) → Lab through the profile's A2B table. `absolute`
 *  maps paper white to the paper's own colour (soft proof with paper
 *  simulation); the other intents give media-relative Lab. */
export function cmykToLab(profile: IccProfile, cmyk: Cmyk, intent: RenderingIntent = 'relative'): Lab {
  const lut = pick(profile.aToB, intent === 'absolute' ? 'relative' : intent);
  if (!lut) throw new Error('profile has no A2B table');
  const lab = decodePcs(lut.run([cmyk.c, cmyk.m, cmyk.y, cmyk.k]), lut.pcsEncoding);
  if (intent !== 'absolute') return lab;
  return relativeToAbsolute(profile, lab);
}

function relativeToAbsolute(profile: IccProfile, lab: Lab): Lab {
  // v2 media-relative PCS is scaled so the media white sits at D50; undo it.
  const w = profile.mediaWhite;
  const v = labToXyz(lab);
  return xyzToLab({ X: (v.X * w.X) / D50.X, Y: (v.Y * w.Y) / D50.Y, Z: (v.Z * w.Z) / D50.Z });
}

/** Lab → device CMYK through the profile's B2A table. */
export function labToCmyk(profile: IccProfile, lab: Lab, intent: RenderingIntent = 'relative'): Cmyk {
  const lut = pick(profile.bToA, intent === 'absolute' ? 'relative' : intent);
  if (!lut) throw new Error('profile has no B2A table');
  const out = lut.run(encodePcs(lab, lut.pcsEncoding));
  return { c: clamp01(out[0]!), m: clamp01(out[1]!), y: clamp01(out[2]!), k: clamp01(out[3]!) };
}

/** Total area coverage of a CMYK value, in percent (0..400). */
export function totalAreaCoverage(cmyk: Cmyk): number {
  return (cmyk.c + cmyk.m + cmyk.y + cmyk.k) * 100;
}

export interface OutputTransformOptions {
  intent?: RenderingIntent;
  /** Scale the source so sRGB black lands on the profile's darkest
   *  printable black instead of being clipped (relative intent only). */
  blackPointCompensation?: boolean;
  /** Neutral colours (r = g = b) become K only, with K picked so L* matches. */
  preserveNeutrals?: boolean;
}

export interface OutputTransform {
  profile: IccProfile;
  /** sRGB 0..1 → CMYK 0..1. */
  fromRgb(r: number, g: number, b: number): Cmyk;
  /** CMYK → media-relative Lab (relative) or paper-simulating Lab. */
  toLab(cmyk: Cmyk, paper?: boolean): Lab;
  /** CMYK → screen sRGB 0..1, the soft proof of one colour. */
  proof(cmyk: Cmyk, paper?: boolean): [number, number, number];
  /** The profile's darkest black (relative Lab of its B2A for L* 0). */
  blackPoint: Lab;
  /** L* of paper with K only at `k` (relative): the K-only neutral ramp. */
  kOnlyFor(L: number): number;
}

const transformCache = new WeakMap<IccProfile, Map<string, OutputTransform>>();

/** Build (and memoize per profile + options) a transform from the
 *  document's sRGB colours to an output CMYK profile. */
export function outputTransform(profile: IccProfile, options: OutputTransformOptions = {}): OutputTransform {
  const intent = options.intent ?? 'relative';
  const bpc = options.blackPointCompensation ?? true;
  const neutrals = options.preserveNeutrals ?? true;
  const key = `${intent}|${bpc}|${neutrals}`;
  let perProfile = transformCache.get(profile);
  if (!perProfile) {
    perProfile = new Map();
    transformCache.set(profile, perProfile);
  }
  const hit = perProfile.get(key);
  if (hit) return hit;

  // The darkest black the profile prints: round-trip L* 0 through B2A/A2B.
  const blackPoint = cmykToLab(profile, labToCmyk(profile, { L: 0, a: 0, b: 0 }, 'relative'), 'relative');
  const bpXyz = labToXyz({ L: blackPoint.L, a: 0, b: 0 });

  // K-only ramp: L* (relative) for K in 0..1, monotonically decreasing.
  const RAMP = 256;
  const rampL = new Float64Array(RAMP + 1);
  for (let i = 0; i <= RAMP; i++) rampL[i] = cmykToLab(profile, { c: 0, m: 0, y: 0, k: i / RAMP }, 'relative').L;
  const kOnlyFor = (L: number): number => {
    if (L >= rampL[0]!) return 0;
    if (L <= rampL[RAMP]!) return 1;
    let lo = 0;
    let hi = RAMP;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (rampL[mid]! > L) lo = mid;
      else hi = mid;
    }
    const l0 = rampL[lo]!;
    const l1 = rampL[hi]!;
    const f = l0 === l1 ? 0 : (l0 - L) / (l0 - l1);
    return (lo + f) / RAMP;
  };
  // The darkest K-only tone; neutrals darker than it get K 100 plus
  // nothing (we never build rich black for neutrals here: that is the
  // black-handling layer's job, for large areas only).
  const sourceLab = (r: number, g: number, b: number): Lab => {
    const v = srgbToXyz(r, g, b);
    if (!bpc || intent !== 'relative') return xyzToLab(v);
    // Black-point compensation, source black = 0: v' = bp + v (1 - bp / wp).
    return xyzToLab({
      X: bpXyz.X + v.X * (1 - bpXyz.X / D50.X),
      Y: bpXyz.Y + v.Y * (1 - bpXyz.Y / D50.Y),
      Z: bpXyz.Z + v.Z * (1 - bpXyz.Z / D50.Z),
    });
  };

  const t: OutputTransform = {
    profile,
    blackPoint,
    kOnlyFor,
    fromRgb(r, g, b) {
      if (neutrals && Math.abs(r - g) < 1e-6 && Math.abs(g - b) < 1e-6) {
        if (r >= 1) return { c: 0, m: 0, y: 0, k: 0 };
        if (r <= 0) return { c: 0, m: 0, y: 0, k: 1 };
        // Match L* against the K ramp, scaled so black is K 100: the
        // neutral's lightness runs from paper (L 100) to the K solid.
        const L = srgbToLab(r, g, b).L;
        const kSolid = rampL[RAMP]!;
        const target = kSolid + (L / 100) * (100 - kSolid);
        return { c: 0, m: 0, y: 0, k: kOnlyFor(target) };
      }
      return labToCmyk(profile, sourceLab(r, g, b), intent === 'absolute' ? 'relative' : intent);
    },
    toLab(cmyk, paper = false) {
      return cmykToLab(profile, cmyk, paper ? 'absolute' : 'relative');
    },
    proof(cmyk, paper = false) {
      return labToSrgb(cmykToLab(profile, cmyk, paper ? 'absolute' : 'relative'));
    },
  };
  perProfile.set(key, t);
  return t;
}

// ---------------------------------------------------------------------------
// Pixel LUTs

/** A dense RGB → RGBA-ish lookup (`size³` entries × `channels`), filled by
 *  `fn` and applied per pixel with trilinear interpolation. */
export interface RgbLut {
  size: number;
  channels: number;
  data: Float32Array;
}

export function buildRgbLut(size: number, channels: number, fn: (r: number, g: number, b: number) => number[]): RgbLut {
  const data = new Float32Array(size * size * size * channels);
  const n = size - 1;
  let at = 0;
  for (let ri = 0; ri < size; ri++) {
    for (let gi = 0; gi < size; gi++) {
      for (let bi = 0; bi < size; bi++) {
        const out = fn(ri / n, gi / n, bi / n);
        for (let c = 0; c < channels; c++) data[at++] = out[c]!;
      }
    }
  }
  return { size, channels, data };
}

/** Evaluate an `RgbLut` at 0..255 integer RGB into `out` (tetrahedral). */
export function sampleRgbLut(lut: RgbLut, r8: number, g8: number, b8: number, out: Float32Array | number[]): void {
  const { size, channels, data } = lut;
  const n = size - 1;
  const fr = (r8 / 255) * n;
  const fg = (g8 / 255) * n;
  const fb = (b8 / 255) * n;
  let ir = Math.floor(fr);
  let ig = Math.floor(fg);
  let ib = Math.floor(fb);
  if (ir >= n) ir = n - 1;
  if (ig >= n) ig = n - 1;
  if (ib >= n) ib = n - 1;
  const rx = fr - ir;
  const ry = fg - ig;
  const rz = fb - ib;
  const sR = size * size * channels;
  const sG = size * channels;
  const sB = channels;
  const base = ir * sR + ig * sG + ib * sB;
  // Tetrahedral weights: pick the corners of the simplex holding the point.
  let c1: number, c2: number, c3: number;
  let w1: number, w2: number, w3: number;
  if (rx >= ry) {
    if (ry >= rz) { c1 = sR; c2 = sR + sG; c3 = sR + sG + sB; w1 = rx - ry; w2 = ry - rz; w3 = rz; }
    else if (rx >= rz) { c1 = sR; c2 = sR + sB; c3 = sR + sG + sB; w1 = rx - rz; w2 = rz - ry; w3 = ry; }
    else { c1 = sB; c2 = sR + sB; c3 = sR + sG + sB; w1 = rz - rx; w2 = rx - ry; w3 = ry; }
  } else if (rz >= ry) { c1 = sB; c2 = sG + sB; c3 = sR + sG + sB; w1 = rz - ry; w2 = ry - rx; w3 = rx; }
  else if (rz >= rx) { c1 = sG; c2 = sG + sB; c3 = sR + sG + sB; w1 = ry - rz; w2 = rz - rx; w3 = rx; }
  else { c1 = sG; c2 = sR + sG; c3 = sR + sG + sB; w1 = ry - rx; w2 = rx - rz; w3 = rz; }
  const w0 = 1 - w1 - w2 - w3;
  for (let c = 0; c < channels; c++) {
    const i = base + c;
    out[c] = w0 * data[i]! + w1 * data[i + c1]! + w2 * data[i + c2]! + w3 * data[i + c3]!;
  }
}
