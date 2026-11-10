/**
 * The plates of a job that prints on a few inks only (`print.plates`, a
 * two-ink book): what each plate is — a process ink or a spot ink, with
 * the alternate that stands for it on screen and in the PDF — and which of
 * the colours a book defines for print cannot be set on them as they are.
 */

import type { CmykPercent, ResolvedPrintConfig, SpotColor } from '../types.js';
import { inkEntry, inkKey } from './inks.js';

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

/** The process channel a plate name is, if any. */
export function processChannel(name: string): ProcessChannel | undefined {
  const key = inkKey(name);
  return PROCESS.find(([n]) => n.toLowerCase() === key)?.[1];
}

/**
 * The plates a job restricts itself to, or undefined when it prints on
 * every plate. A spot plate is named as the PDF names it: a name or alias
 * of the ink table is its `pdfName`. `spots` are the job's spot colours
 * already through the ink table (`spotsThroughInkTable`), whose alternates
 * stand for plates the table gives none.
 */
export function jobPlates(print: ResolvedPrintConfig, spots: Iterable<Required<SpotColor>>): JobPlate[] | undefined {
  if (print.plates.inks.length === 0) return undefined;
  const spotList = [...spots];
  const out: JobPlate[] = [];
  for (const given of print.plates.inks) {
    const process = processChannel(given);
    if (process) {
      out.push({ name: PROCESS.find(([, ch]) => ch === process)![0], process, cmyk: { c: 0, m: 0, y: 0, k: 0, [process]: 100 }, overprint: false });
      continue;
    }
    const entry = inkEntry(given, print.inks);
    const name = entry?.output === 'spot' ? entry.pdfName : given;
    const spot = spotList.find((s) => inkKey(s.name) === inkKey(name));
    const cmyk = entry?.cmyk ?? spot?.cmyk;
    out.push({ name, ...(cmyk ? { cmyk: { ...cmyk } } : {}), overprint: entry?.overprint ?? spot?.overprint ?? false });
  }
  return out;
}

/** The plate of `plates` a spot colour's ink prints on, if any. */
export function plateOfSpot(spot: Required<SpotColor>, plates: readonly JobPlate[]): JobPlate | undefined {
  const key = inkKey(spot.name);
  return plates.find((p) => inkKey(p.name) === key);
}

/** The process channels a CMYK colour inks that `plates` do not print. */
export function channelsOffPlates(cmyk: CmykPercent, plates: readonly JobPlate[]): ProcessChannel[] {
  const on = new Set(plates.map((p) => p.process).filter(Boolean));
  return (['c', 'm', 'y', 'k'] as const).filter((ch) => cmyk[ch] > 0.05 && !on.has(ch));
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
export function placedInkProblems(inks: readonly string[], print: ResolvedPrintConfig, spots: Iterable<Required<SpotColor>>): PlacedInkProblems {
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
