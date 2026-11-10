/**
 * A job on a few plates (`print.plates`, a two-ink book): every colour is
 * set on the job's plates only, and every picture as a monotone or a
 * duotone on its picture plates.
 *
 * - A spot colour of a plate the job prints, and a CMYK colour whose
 *   channels it prints, are set as they are.
 * - Any other colour is projected: the mix of the plates' tints (one plate,
 *   or two) whose appearance — the plates' alternates summed, through the
 *   output profile — is closest to it (ΔE). Greys go on `Black` alone when
 *   the job prints it and neutrals stay K only. The preflight reports the
 *   colours the book defines for print that this loses.
 * - A picture's tone (1 − L*) runs through each picture plate's curve.
 */

import type { Color } from 'pdf-lib';
import { cmyk } from 'pdf-lib';
import {
  channelsOffPlates,
  deltaE,
  jobPlates,
  plateOfSpot,
  spotColorCmyk,
  srgbToLab,
  type CmykPercent,
  type Lab,
  type OutputTransform,
  type ResolvedPrintConfig,
  type SpotColor,
} from 'postext';
import { mixAlternate, mixStandIn, type SpotPlate } from './spot.js';

/** One plate of the job, as the PDF paints it. */
export interface PlateInk extends SpotPlate {
  process?: 'c' | 'm' | 'y' | 'k';
}

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
 *  plate nothing defines prints as black (the preflight reports it). */
export function platePlan(config: ResolvedPrintConfig, spots: Iterable<Required<SpotColor>>): PlatePlan | undefined {
  const given = jobPlates(config, spots);
  if (!given) return undefined;
  const plates: PlateInk[] = given.map((p) => ({
    name: p.name,
    cmyk: p.cmyk ?? { c: 0, m: 0, y: 0, k: 100 },
    overprint: p.overprint,
    ...(p.process ? { process: p.process } : {}),
  }));
  const images = config.plates.images
    .map((name) => plates.find((p) => p.name === name) ?? plates.find((p) => p.name.toLowerCase() === name.toLowerCase()))
    .filter((p): p is PlateInk => !!p);
  if (images.length === 0) images.push(plates.find((p) => p.process === 'k') ?? plates[0]!);
  const curves = images.map((p, i) => curveOf(config.plates.curves[p.name] ?? defaultCurve(images.length, i)));
  const key = `${plates.map((p) => `${p.name}/${p.cmyk.c},${p.cmyk.m},${p.cmyk.y},${p.cmyk.k}`).join('+')}|${images.map((p) => p.name).join('+')}|${JSON.stringify(config.plates.curves)}`;
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

/** What a colour asks for: a spot ink at a tint, a CMYK mix, or a screen
 *  colour (sRGB 0..1, already over the paper when flattened). */
export type PlateTarget =
  | { kind: 'spot'; spot: Required<SpotColor>; tint: number }
  | { kind: 'cmyk'; cmyk: CmykPercent }
  | { kind: 'rgb'; r: number; g: number; b: number };

/** A colour set on the job's plates: its plates and a tint each, and how
 *  far its appearance is from what was asked (ΔE, 0 when set as is). */
export interface PlateMix {
  plates: PlateInk[];
  tints: number[];
  deltaE: number;
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/** The plates and tints `target` prints in. */
export function plateMix(plan: PlatePlan, target: PlateTarget, transform: OutputTransform, kOnlyNeutrals: boolean): PlateMix {
  if (target.kind === 'spot') {
    const plate = plateOfSpot(target.spot, plan.plates) as PlateInk | undefined;
    if (plate) return { plates: [plate], tints: [target.tint], deltaE: 0 };
    const alt = spotColorCmyk({ ...target.spot, tint: target.tint * 100 });
    return project(plan, transform.toLab(toUnit(alt)), transform);
  }
  if (target.kind === 'cmyk') {
    if (channelsOffPlates(target.cmyk, plan.plates).length === 0) {
      const used = plan.plates.filter((p) => p.process && target.cmyk[p.process] > 0);
      return { plates: used, tints: used.map((p) => target.cmyk[p.process!] / 100), deltaE: 0 };
    }
    return project(plan, transform.toLab(toUnit(target.cmyk)), transform);
  }
  const { r, g, b } = target;
  const black = plan.plates.find((p) => p.process === 'k');
  if (black && kOnlyNeutrals && Math.abs(r - g) < 1e-6 && Math.abs(g - b) < 1e-6) {
    // A grey on black alone, matched in lightness the way process neutrals are.
    const k = transform.fromRgb(r, g, b).k;
    return { plates: [black], tints: [k], deltaE: 0 };
  }
  return project(plan, srgbToLab(r, g, b), transform);
}

const toUnit = (c: CmykPercent) => ({ c: c.c / 100, m: c.m / 100, y: c.y / 100, k: c.k / 100 });

/** The closest mix of one plate or two to `target` (Lab, relative to the
 *  paper). A mix of fewer plates wins a near tie. */
function project(plan: PlatePlan, target: Lab, transform: OutputTransform): PlateMix {
  const cost = (plates: PlateInk[], tints: number[]): number => {
    const [c, m, y, k] = mixAlternate(plates, tints);
    return deltaE(transform.toLab({ c, m, y, k }), target);
  };
  let best: PlateMix = { plates: [], tints: [], deltaE: deltaE({ L: 100, a: 0, b: 0 }, target) };
  const consider = (plates: PlateInk[], tints: number[], d: number, fewer: boolean) => {
    if (d < best.deltaE - (fewer ? 0 : 0.5)) best = { plates, tints, deltaE: d };
  };
  for (const p of plan.plates) {
    const [t, d] = search([p], [0.5], cost);
    consider([p], t, d, true);
  }
  for (let i = 0; i < plan.plates.length; i++) {
    for (let j = i + 1; j < plan.plates.length; j++) {
      const pair = [plan.plates[i]!, plan.plates[j]!];
      // Start from the best corner of a coarse grid.
      let start = [0, 0];
      let startCost = Infinity;
      for (let a = 0; a <= 10; a++) {
        for (let b = 0; b <= 10; b++) {
          const d = cost(pair, [a / 10, b / 10]);
          if (d < startCost) [start, startCost] = [[a / 10, b / 10], d];
        }
      }
      const [t, d] = search(pair, start, cost);
      consider(pair, t, d, false);
    }
  }
  const kept = best.plates.map((p, i) => [p, round4(best.tints[i]!)] as const).filter(([, t]) => t > 0);
  return { plates: kept.map(([p]) => p), tints: kept.map(([, t]) => t), deltaE: Math.round(best.deltaE * 10) / 10 };
}

/** A pattern search of the tints from `start`, halving the step down to
 *  0.002; returns the tints and their cost. */
function search(plates: PlateInk[], start: number[], cost: (p: PlateInk[], t: number[]) => number): [number[], number] {
  let tints = start.slice();
  let best = cost(plates, tints);
  if (plates.length === 1) {
    // One plate: scan, then refine.
    for (let t = 0; t <= 1.0001; t += 0.05) {
      const d = cost(plates, [t]);
      if (d < best) [tints, best] = [[t], d];
    }
  }
  for (let step = 0.05; step >= 0.002; step /= 2) {
    let moved = true;
    while (moved) {
      moved = false;
      for (let i = 0; i < tints.length; i++) {
        for (const dir of [1, -1]) {
          const next = tints.slice();
          next[i] = Math.max(0, Math.min(1, next[i]! + dir * step));
          if (next[i] === tints[i]) continue;
          const d = cost(plates, next);
          if (d < best - 1e-6) {
            [tints, best] = [next, d];
            moved = true;
          }
        }
      }
    }
  }
  return [tints, best];
}

/** The pdf-lib colour of a mix: plain CMYK when every plate is a process
 *  one, else the stand-in of its Separation or DeviceN. */
export function mixColor(mix: PlateMix): Color {
  if (mix.plates.length === 0) return cmyk(0, 0, 0, 0);
  if (mix.plates.every((p) => p.process)) {
    const [c, m, y, k] = mixAlternate(mix.plates, mix.tints);
    return cmyk(c, m, y, k);
  }
  return mixStandIn(mix.plates, mix.tints);
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
