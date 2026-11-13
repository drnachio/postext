/**
 * The plates of a job that prints on a few inks only (`print.plates`, a
 * two-ink book): what each plate is — a process ink or a spot ink, with
 * the alternate that stands for it on screen and in the PDF — which plates
 * its pictures print on, and how a colour of another ink is set on them.
 *
 * - A spot colour of a plate the job prints, and a CMYK colour whose
 *   channels it prints, are set as they are.
 * - Any other colour is projected: the mix of the plates' tints (one plate,
 *   or two) whose appearance — the plates' alternates summed, through the
 *   output profile — is closest to it (ΔE). Greys go on `Black` alone when
 *   the job prints it and neutrals stay K only. The preflight reports the
 *   colours this moves far from what was asked.
 */

import type { CmykPercent, ResolvedPrintConfig, ResolvedPrintInk, ResolvedSpotColor } from '../types.js';
import { spotColorCmyk } from './authored.js';
import { inkEntry, inkKey } from './inks.js';
import { deltaE, srgbToLab, type Lab, type OutputTransform } from './transform.js';

export type ProcessChannel = 'c' | 'm' | 'y' | 'k';

const PROCESS: ReadonlyArray<[string, ProcessChannel]> = [
  ['Cyan', 'c'],
  ['Magenta', 'm'],
  ['Yellow', 'y'],
  ['Black', 'k'],
];

/** One plate of a restricted job. */
export interface JobPlate {
  /** The plate name in the PDF. */
  name: string;
  /** The process channel it is, for `Cyan`, `Magenta`, `Yellow`, `Black`. */
  process?: ProcessChannel;
  /** Its full-strength alternate, percent; undefined for a spot plate no
   *  colour and no ink table entry defines. */
  cmyk?: CmykPercent;
  overprint: boolean;
}

/** A plate whose alternate is known: what a mix is made of. */
export interface MixPlate {
  name: string;
  process?: ProcessChannel;
  cmyk: CmykPercent;
}

/** The process channel a plate name is, if any. */
export function processChannel(name: string): ProcessChannel | undefined {
  const key = inkKey(name);
  return PROCESS.find(([n]) => n.toLowerCase() === key)?.[1];
}

/** The plate name a name of the job's settings stands for: a process
 *  plate in its PDF spelling, a name or alias of the ink table as the
 *  table's `pdfName`, any other name as it is. */
function plateNameOf(given: string, inks: readonly ResolvedPrintInk[]): { name: string; process?: ProcessChannel } {
  const process = processChannel(given);
  if (process) return { name: PROCESS.find(([, ch]) => ch === process)![0], process };
  const entry = inkEntry(given, inks);
  return { name: entry?.output === 'spot' ? entry.pdfName : given.trim() };
}

/**
 * The plates a job restricts itself to, or undefined when it prints on
 * every plate. A spot plate is named as the PDF names it: a name or alias
 * of the ink table is its `pdfName`, and two names of one plate are one
 * plate. `spots` are the job's spot colours already through the ink table
 * (`spotsThroughInkTable`), whose alternates stand for plates the table
 * gives none.
 */
export function jobPlates(print: ResolvedPrintConfig, spots: Iterable<ResolvedSpotColor>): JobPlate[] | undefined {
  if (print.plates.inks.length === 0) return undefined;
  const spotList = [...spots];
  const out: JobPlate[] = [];
  for (const given of print.plates.inks) {
    const { name, process } = plateNameOf(given, print.inks);
    if (out.some((p) => inkKey(p.name) === inkKey(name))) continue;
    if (process) {
      out.push({ name, process, cmyk: { c: 0, m: 0, y: 0, k: 0, [process]: 100 }, overprint: false });
      continue;
    }
    const entry = inkEntry(name, print.inks);
    const spot = spotList.find((s) => inkKey(s.name) === inkKey(name));
    const cmyk = entry?.cmyk ?? spot?.cmyk;
    out.push({ name, ...(cmyk ? { cmyk: { ...cmyk } } : {}), overprint: entry?.overprint ?? spot?.overprint ?? false });
  }
  return out;
}

/** The plate of `plates` a name of the job's settings (`images`, a
 *  `curves` key) stands for, through the ink table. */
export function jobPlateNamed<P extends { name: string }>(given: string, plates: readonly P[], inks: readonly ResolvedPrintInk[]): P | undefined {
  const key = inkKey(plateNameOf(given, inks).name);
  return plates.find((p) => inkKey(p.name) === key);
}

/** The plates a job's pictures print on (one or two, each once) and the
 *  curve points each was given: `print.plates.images` through the ink
 *  table, else `Black` when the job prints it, else its first plate. */
export function jobImagePlates<P extends { name: string; process?: ProcessChannel }>(
  print: ResolvedPrintConfig,
  plates: readonly P[],
): Array<{ plate: P; curve?: Array<[number, number]> }> {
  const images: P[] = [];
  for (const given of print.plates.images) {
    const plate = jobPlateNamed(given, plates, print.inks);
    if (plate && !images.includes(plate)) images.push(plate);
  }
  if (images.length === 0 && plates.length > 0) images.push(plates.find((p) => p.process === 'k') ?? plates[0]!);
  return images.slice(0, 2).map((plate) => {
    const key = Object.keys(print.plates.curves).find((k) => jobPlateNamed(k, [plate], print.inks));
    return key ? { plate, curve: print.plates.curves[key]! } : { plate };
  });
}

/** The plate of `plates` a spot colour's ink prints on, if any. */
export function plateOfSpot<P extends { name: string }>(spot: ResolvedSpotColor, plates: readonly P[]): P | undefined {
  const key = inkKey(spot.name);
  return plates.find((p) => inkKey(p.name) === key);
}

/** The process channels a CMYK colour inks that `plates` do not print. */
export function channelsOffPlates(cmyk: CmykPercent, plates: readonly { process?: ProcessChannel }[]): ProcessChannel[] {
  const on = new Set(plates.map((p) => p.process).filter(Boolean));
  return (['c', 'm', 'y', 'k'] as const).filter((ch) => cmyk[ch] > 0.05 && !on.has(ch));
}

const round4 = (n: number): number => Math.round(n * 10000) / 10000;

/** The full-strength alternates of `plates` at `tints` (0..1 each), summed
 *  and clipped: what a mix of inks stands for in process (0..1 a channel,
 *  four decimals). */
export function mixAlternate(plates: readonly { cmyk: CmykPercent }[], tints: readonly number[]): [number, number, number, number] {
  const out: [number, number, number, number] = [0, 0, 0, 0];
  plates.forEach((p, i) => {
    const t = tints[i] ?? 0;
    out[0] += (p.cmyk.c / 100) * t;
    out[1] += (p.cmyk.m / 100) * t;
    out[2] += (p.cmyk.y / 100) * t;
    out[3] += (p.cmyk.k / 100) * t;
  });
  return out.map((v) => round4(Math.min(1, v))) as [number, number, number, number];
}

/** What a colour asks for: a spot ink at a tint (0..1), a CMYK mix, or a
 *  screen colour (sRGB 0..1, already over the paper when flattened). */
export type PlateTarget =
  | { kind: 'spot'; spot: ResolvedSpotColor; tint: number }
  | { kind: 'cmyk'; cmyk: CmykPercent }
  | { kind: 'rgb'; r: number; g: number; b: number };

/** A colour set on the job's plates: its plates and a tint each, and how
 *  far its appearance is from what was asked (ΔE, 0 when set as is). */
export interface PlateMix<P extends MixPlate = MixPlate> {
  plates: P[];
  tints: number[];
  deltaE: number;
  /** Whether the colour was projected (not set as it is). */
  projected: boolean;
}

/** The plates and tints `target` prints in on `plates`. */
export function plateMix<P extends MixPlate>(plates: readonly P[], target: PlateTarget, transform: OutputTransform, kOnlyNeutrals: boolean): PlateMix<P> {
  if (target.kind === 'spot') {
    const plate = plateOfSpot(target.spot, plates);
    if (plate) return { plates: [plate], tints: [target.tint], deltaE: 0, projected: false };
    const alt = spotColorCmyk({ ...target.spot, tint: target.tint * 100 });
    return project(plates, transform.toLab(toUnit(alt)), transform);
  }
  if (target.kind === 'cmyk') {
    if (channelsOffPlates(target.cmyk, plates).length === 0) {
      const used = plates.filter((p) => p.process && target.cmyk[p.process] > 0);
      return { plates: used, tints: used.map((p) => target.cmyk[p.process!] / 100), deltaE: 0, projected: false };
    }
    return project(plates, transform.toLab(toUnit(target.cmyk)), transform);
  }
  const { r, g, b } = target;
  const black = plates.find((p) => p.process === 'k');
  if (black && kOnlyNeutrals && Math.abs(r - g) < 1e-6 && Math.abs(g - b) < 1e-6) {
    // A grey on black alone, matched in lightness the way process neutrals are.
    const k = transform.fromRgb(r, g, b).k;
    return { plates: [black], tints: [k], deltaE: 0, projected: false };
  }
  return project(plates, srgbToLab(r, g, b), transform);
}

const toUnit = (c: CmykPercent) => ({ c: c.c / 100, m: c.m / 100, y: c.y / 100, k: c.k / 100 });

/** The closest mix of one plate or two to `target` (Lab, relative to the
 *  paper). A mix of fewer plates wins a near tie. */
function project<P extends MixPlate>(plates: readonly P[], target: Lab, transform: OutputTransform): PlateMix<P> {
  const cost = (ps: readonly P[], tints: number[]): number => {
    const [c, m, y, k] = mixAlternate(ps, tints);
    return deltaE(transform.toLab({ c, m, y, k }), target);
  };
  let best: { plates: P[]; tints: number[]; deltaE: number } = { plates: [], tints: [], deltaE: deltaE({ L: 100, a: 0, b: 0 }, target) };
  const consider = (ps: P[], tints: number[], d: number, fewer: boolean) => {
    if (d < best.deltaE - (fewer ? 0 : 0.5)) best = { plates: ps, tints, deltaE: d };
  };
  for (const p of plates) {
    const [t, d] = search([p], [0.5], cost);
    consider([p], t, d, true);
  }
  for (let i = 0; i < plates.length; i++) {
    for (let j = i + 1; j < plates.length; j++) {
      const pair = [plates[i]!, plates[j]!];
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
  return { plates: kept.map(([p]) => p), tints: kept.map(([, t]) => t), deltaE: Math.round(best.deltaE * 10) / 10, projected: true };
}

/** A pattern search of the tints from `start`, halving the step down to
 *  0.002; returns the tints and their cost. */
function search<P>(plates: P[], start: number[], cost: (p: P[], t: number[]) => number): [number[], number] {
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

/** What the spot inks of a placed PDF (an Illustrator file, a print
 *  master) mean for the job, which prints the file as it is. */
export interface PlacedInkProblems {
  /** Inks the job's plates (`print.plates`) leave out: nothing projects
   *  them, and the printer gets a plate the job does not have. */
  offPlates: string[];
  /** Inks the ink table renames or sends to process: the file keeps its
   *  own name, so they print on a plate of their own. */
  renamed: string[];
  /** Inks no colour of the book and no ink table entry defines: a plate
   *  the job adds without saying so. */
  unknown: string[];
}

/** Sort the spot inks a placed file prints on (`inks`) by what the job
 *  makes of them; `spots` are the book's spot colours. */
export function placedInkProblems(inks: readonly string[], print: ResolvedPrintConfig, spots: Iterable<ResolvedSpotColor>): PlacedInkProblems {
  const spotList = [...spots];
  const plates = jobPlates(print, spotList);
  const out: PlacedInkProblems = { offPlates: [], renamed: [], unknown: [] };
  for (const ink of inks) {
    const key = inkKey(ink);
    if (plates && !plates.some((p) => inkKey(p.name) === key)) {
      out.offPlates.push(ink);
      continue;
    }
    const entry = inkEntry(ink, print.inks);
    if (entry && (entry.output === 'process' || inkKey(entry.pdfName) !== key)) out.renamed.push(ink);
    else if (!entry && !plates && !spotList.some((s) => inkKey(s.name) === key)) out.unknown.push(ink);
  }
  return out;
}
