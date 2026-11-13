/**
 * The plates part of the print preflight (#1476): a job restricted to a
 * few plates (`print.plates`) sets every colour on them, and a colour of
 * another ink is projected onto the closest mix of their tints. This
 * reports the plates, a plate nothing defines, and each colour the
 * projection moves: a spot ink or a CMYK colour the job does not print
 * (information when it lands close, a warning past {@link PLATE_DELTA_E}),
 * and a screen colour that lands far from itself.
 */

import type { CmykPercent, ResolvedPrintConfig, ResolvedSpotColor } from '../types.js';
import type { OutputTransform } from '../color/transform.js';
import { channelsOffPlates, jobImagePlates, jobPlates, plateMix, plateOfSpot, type MixPlate } from '../color/plates.js';
import type { PreflightIssue } from './preflight.js';

/** The colour difference (CIE76) past which a projected colour is a
 *  warning: about where two printed swatches side by side stop reading as
 *  the same colour. */
export const PLATE_DELTA_E = 6;

export interface PlatesCheckInput {
  print: ResolvedPrintConfig;
  /** The job's spot colours by screen hex, through the ink table. */
  spots: ReadonlyMap<string, ResolvedSpotColor>;
  /** Colours authored in CMYK, by screen hex, through the ink table. */
  authored: ReadonlyMap<string, CmykPercent>;
  /** The colours the pages paint with, by screen hex (`#rrggbb`). */
  usedColors: ReadonlySet<string>;
  /** The spot inks the pages paint with, by name. */
  usedInks: ReadonlySet<string>;
  /** The separation of the job's output profile: without it the ΔE of a
   *  projection is unknown, and screen colours are not checked. */
  transform?: OutputTransform;
  /** Book-absolute index of the document's first page. */
  pageIndex: number;
}

/** The plates issues of a CMYK job, none when it prints every plate. */
export function platesIssues(input: PlatesCheckInput): PreflightIssue[] {
  const { print, spots, authored, usedColors, usedInks, transform: t, pageIndex } = input;
  const plates = jobPlates(print, spots.values());
  if (!plates) return [];
  const out: PreflightIssue[] = [];
  const images = jobImagePlates(print, plates).map((i) => i.plate.name);
  out.push({ kind: 'platesJob', severity: 'info', pageIndex, plates: plates.map((p) => p.name), images });
  for (const plate of plates) {
    if (!plate.cmyk) out.push({ kind: 'plateUndefined', severity: 'warning', pageIndex, plate: plate.name });
  }
  // A plate nothing defines proofs as black, as the PDF sets it.
  const mixPlates: MixPlate[] = plates.map((p) => ({ name: p.name, ...(p.process ? { process: p.process } : {}), cmyk: p.cmyk ?? { c: 0, m: 0, y: 0, k: 100 } }));
  const severity = (deltaE: number | undefined): 'warning' | 'info' => (deltaE === undefined || deltaE > PLATE_DELTA_E ? 'warning' : 'info');
  const withDelta = (deltaE: number | undefined) => (deltaE === undefined ? {} : { deltaE });

  // Spot inks: once per ink, at its worst colour.
  const inks = new Map<string, number | undefined>();
  for (const spot of spots.values()) {
    if (!usedInks.has(spot.name) || plateOfSpot(spot, plates)) continue;
    const d = t ? plateMix(mixPlates, { kind: 'spot', spot, tint: spot.tint / 100 }, t, print.black.kOnlyNeutrals).deltaE : undefined;
    inks.set(spot.name, d === undefined ? undefined : Math.max(inks.get(spot.name) ?? 0, d));
  }
  for (const hex of usedColors) {
    if (spots.has(hex)) continue;
    const exact = authored.get(hex);
    if (exact) {
      const channels = channelsOffPlates(exact, plates);
      if (channels.length === 0) continue;
      const d = t ? plateMix(mixPlates, { kind: 'cmyk', cmyk: exact }, t, print.black.kOnlyNeutrals).deltaE : undefined;
      out.push({ kind: 'offPlateCmyk', severity: severity(d), pageIndex, color: hex, channels, ...withDelta(d) });
      continue;
    }
    if (!t) continue;
    const r = parseInt(hex.slice(1, 3), 16) / 255;
    const g = parseInt(hex.slice(3, 5), 16) / 255;
    const b = parseInt(hex.slice(5, 7), 16) / 255;
    const mix = plateMix(mixPlates, { kind: 'rgb', r, g, b }, t, print.black.kOnlyNeutrals);
    if (mix.deltaE > PLATE_DELTA_E) out.push({ kind: 'offPlateColor', severity: 'warning', pageIndex, color: hex, deltaE: mix.deltaE });
  }
  for (const [ink, d] of inks) out.push({ kind: 'offPlateInk', severity: severity(d), pageIndex, ink, ...withDelta(d) });
  return out;
}
