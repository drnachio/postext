/**
 * A job on a few plates (`print.plates`, a two-ink book) as the PDF sets
 * it: the plates with their alternates, the picture plates and their tone
 * curves, the pdf-lib colour of a mix (postext's `plateMix` picks the
 * mix), and pictures as monotones or duotones — a picture's tone
 * (1 − L*) runs through each picture plate's curve.
 */

import type { Color } from 'pdf-lib';
import { cmyk } from 'pdf-lib';
import {
  jobImagePlates,
  jobPlates,
  mixAlternate,
  plateMix,
  type PlateMix,
  type PlateTarget,
  type ResolvedPrintConfig,
  type ResolvedSpotColor,
} from 'postext';
import type { SpotInkRegistry, SpotPlate } from './spot.js';

/** One plate of the job, as the PDF paints it. */
export type PlateInk = SpotPlate;

export interface PlatePlan {
  plates: PlateInk[];
  /** The plates pictures print on (one or two). */
  images: PlateInk[];
  /** Each picture plate's ink (0..1) for a tone (0..1). */
  curves: Array<(tone: number) => number>;
  /** A key for the mode's caches. */
  key: string;
}

/** The plan of a job restricted to a few plates, else undefined. A spot
 *  plate nothing defines prints as black (the preflight reports it). The
 *  picture plates and curves are named through the ink table. */
export function platePlan(config: ResolvedPrintConfig, spots: Iterable<ResolvedSpotColor>): PlatePlan | undefined {
  const given = jobPlates(config, spots);
  if (!given) return undefined;
  const plates: PlateInk[] = given.map((p) => ({
    name: p.name,
    cmyk: p.cmyk ?? { c: 0, m: 0, y: 0, k: 100 },
    overprint: p.overprint,
    ...(p.process ? { process: p.process } : {}),
  }));
  const pictured = jobImagePlates(config, plates);
  const images = pictured.map((i) => i.plate);
  const curves = pictured.map((i, n) => curveOf(i.curve ?? defaultCurve(images.length, n)));
  const key = `${plates.map((p) => `${p.name}/${p.cmyk.c},${p.cmyk.m},${p.cmyk.y},${p.cmyk.k}/${p.overprint}`).join('+')}|${images.map((p) => p.name).join('+')}|${JSON.stringify(pictured.map((i) => i.curve ?? null))}`;
  return { plates, images, curves, key };
}

/** A monotone is a straight line; a duotone puts its first plate on the
 *  shadows and its second on the middle tones. */
function defaultCurve(count: number, index: number): Array<[number, number]> {
  if (count < 2) return [[0, 0], [100, 100]];
  return index === 0
    ? [[0, 0], [40, 10], [75, 50], [100, 100]]
    : [[0, 0], [30, 25], [70, 60], [100, 75]];
}

/** Piecewise linear through the points (percent), flat past the ends. */
function curveOf(points: Array<[number, number]>): (tone: number) => number {
  const pts = points.map(([x, y]) => [x / 100, y / 100] as [number, number]);
  return (tone) => {
    if (tone <= pts[0]![0]) return pts[0]![1];
    for (let i = 1; i < pts.length; i++) {
      const [x1, y1] = pts[i]!;
      if (tone <= x1) {
        const [x0, y0] = pts[i - 1]!;
        return x1 === x0 ? y1 : y0 + ((tone - x0) / (x1 - x0)) * (y1 - y0);
      }
    }
    return pts[pts.length - 1]![1];
  };
}

/** The mix `target` prints in on the job's plates. */
export function planMix(plan: PlatePlan, target: PlateTarget, mode: { transform: Parameters<typeof plateMix>[2]; config: ResolvedPrintConfig }): PlateMix<PlateInk> {
  return plateMix(plan.plates, target, mode.transform, mode.config.black.kOnlyNeutrals);
}

/** The pdf-lib colour of a mix: plain CMYK when every plate is a process
 *  one (coded when it overprints), else the stand-in of its Separation or
 *  DeviceN in the render's ink registry. */
export function mixColor(mix: PlateMix<PlateInk>, registry: SpotInkRegistry, overprint = false): Color {
  if (mix.plates.length === 0) return cmyk(0, 0, 0, 0);
  if (mix.plates.every((p) => p.process)) {
    const [c, m, y, k] = mixAlternate(mix.plates, mix.tints);
    return overprint ? registry.overprintStandIn(c, m, y, k) : cmyk(c, m, y, k);
  }
  return registry.mixStandIn(mix.plates, mix.tints, overprint);
}

/** L* of an sRGB byte grey ramp, per channel byte, for picture tones. */
const LINEAR = Array.from({ length: 256 }, (_, i) => {
  const v = i / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
});

/**
 * RGBA pixels as the picture plates' samples (one byte a plate, plates
 * interleaved): each pixel's tone, 1 − L* of its luminance, through each
 * plate's curve. Translucent pixels are set over the paper when
 * `flatten`, else their alpha comes back as a plane.
 */
export function platePixels(
  px: { width: number; height: number; data: Uint8Array | Uint8ClampedArray },
  plan: PlatePlan,
  flatten: boolean,
  /** A pixel's luminance (0..1) through its own profile; sRGB's when absent. */
  luminance?: (r: number, g: number, b: number) => number,
): { pixels: Uint8Array; alpha?: Uint8Array } {
  const n = px.width * px.height;
  const k = plan.images.length;
  const pixels = new Uint8Array(n * k);
  let alpha: Uint8Array | undefined;
  // Each plate's ink by tone byte.
  const lut = plan.curves.map((curve) => Uint8Array.from({ length: 256 }, (_, t) => Math.round(Math.max(0, Math.min(1, curve(t / 255))) * 255)));
  for (let i = 0; i < n; i++) {
    let r = px.data[i * 4]!;
    let g = px.data[i * 4 + 1]!;
    let b = px.data[i * 4 + 2]!;
    const a = px.data[i * 4 + 3]!;
    if (a < 255) {
      if (flatten) {
        const f = a / 255;
        r = Math.round(r * f + 255 * (1 - f));
        g = Math.round(g * f + 255 * (1 - f));
        b = Math.round(b * f + 255 * (1 - f));
      } else {
        alpha ??= new Uint8Array(n).fill(255);
        alpha[i] = a;
      }
    }
    const y = luminance ? luminance(r, g, b) : 0.2126 * LINEAR[r]! + 0.7152 * LINEAR[g]! + 0.0722 * LINEAR[b]!;
    const L = y > 216 / 24389 ? 116 * Math.cbrt(y) - 16 : (24389 / 27) * y;
    const tone = Math.round(Math.max(0, Math.min(1, 1 - L / 100)) * 255);
    for (let p = 0; p < k; p++) pixels[i * k + p] = lut[p]![tone]!;
  }
  return alpha ? { pixels, alpha } : { pixels };
}
