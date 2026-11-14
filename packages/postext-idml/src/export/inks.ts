// Spot inks as InDesign swatches (#1576). Every spot ink of the book (a
// spot colour of the configuration, as the ink table `print.inks` prints
// it) becomes a spot swatch with an ink of its own, and so does every
// entry of the ink table that gives a finish; a colour at a tint of its
// ink is a tint swatch of it. InDesign has no field for a finish: it is
// kept as the swatch's script label `postext:finish`, and the ink's type
// says to the separations what kind of ink it is (a varnish and the die
// line are transparent, a white, a metallic ink and a foil opaque). An
// ink that overprints (a white and a varnish unless told otherwise, as
// postext-pdf prints them) sets every page item and text range painted
// with it to overprint.

import {
  authoredSpotColors,
  dimensionToPx,
  finishOverprintsByDefault,
  overprintColors,
  printedSpot,
  processCmykOfSpot,
  resolvePrintDieLine,
  type CmykPercent,
  type InkFinish,
  type ResolvedPrintInk,
  type VDTDocument,
} from 'postext';
import { DIE_LINE_LABEL, FINISH_LABEL, finishLabel, OVERPRINT_LABEL } from '../model/specialInks.js';
import { attr, num } from './parts.js';

/** One ink the package names: its plate, its alternate at full strength,
 *  its finish and whether it overprints. */
export interface InkDef {
  name: string;
  cmyk: CmykPercent;
  finish?: InkFinish;
  overprint: boolean;
  /** The die line's plate: never a colour of the book. */
  dieLine?: boolean;
}

/** The spot inks of the documents and the screen colours that print on
 *  them. */
export interface InkPlan {
  /** Inks by plate name, in the order they are first met. */
  inks: Map<string, InkDef>;
  /** A screen hex (`#rrggbb`) → its ink and the tint it is laid at. */
  spots: Map<string, { ink: string; tint: number }>;
  /** Colours the ink table sends to process: hex → the CMYK they print in. */
  process: Map<string, CmykPercent>;
  /** Screen hexes that overprint: an overprinting colour, or a colour of
   *  an ink that does. */
  overprints: Set<string>;
}

const inkTable = (doc: VDTDocument): readonly ResolvedPrintInk[] => (doc.config as { print?: { inks?: ResolvedPrintInk[] } }).print?.inks ?? [];

/** The inks of the documents, the ink table applied. */
export function planInks(docs: readonly VDTDocument[]): InkPlan {
  const plan: InkPlan = { inks: new Map(), spots: new Map(), process: new Map(), overprints: new Set() };
  for (const doc of docs) {
    const table = inkTable(doc);
    overprintColors(doc.config, plan.overprints);
    for (const [hex, spot] of authoredSpotColors([doc.config, doc.printColors])) {
      const printed = printedSpot(spot, table);
      if (!printed) {
        if (!plan.process.has(hex)) plan.process.set(hex, processCmykOfSpot(spot, table));
        continue;
      }
      if (!plan.inks.has(printed.name)) plan.inks.set(printed.name, { name: printed.name, cmyk: { ...printed.cmyk }, overprint: printed.overprint, ...(printed.finish ? { finish: { ...printed.finish } } : {}) });
      if (!plan.spots.has(hex)) plan.spots.set(hex, { ink: printed.name, tint: printed.tint });
      if (printed.overprint) plan.overprints.add(hex);
    }
    // A finish the ink table gives an ink no colour uses yet: still an
    // ink of the job (an SVG or a picture may name it).
    for (const entry of table) {
      if (!entry.finish || entry.output === 'process' || plan.inks.has(entry.pdfName)) continue;
      plan.inks.set(entry.pdfName, {
        name: entry.pdfName,
        cmyk: entry.cmyk ? { ...entry.cmyk } : { c: 0, m: 0, y: 0, k: 0 },
        finish: { ...entry.finish },
        overprint: entry.overprint ?? finishOverprintsByDefault(entry.finish),
      });
    }
  }
  // The inks in the ink table's order (varnishes lie in it on press), the
  // others after it.
  const table = docs.flatMap((doc) => inkTable(doc).map((e) => e.pdfName));
  const rank = (name: string): number => (table.includes(name) ? table.indexOf(name) : table.length);
  plan.inks = new Map([...plan.inks].sort((a, b) => rank(a[0]) - rank(b[0])));
  return plan;
}

/** The die line's ink, as `print.dieLine` sets it. */
export function dieLineInk(doc: VDTDocument): InkDef & { widthPt: number; printable: boolean } {
  const d = resolvePrintDieLine((doc.config as { print?: { dieLine?: Parameters<typeof resolvePrintDieLine>[0] } }).print?.dieLine);
  const pt = (dimensionToPx(d.width, doc.config.page.dpi) * 72) / doc.config.page.dpi;
  return { name: d.ink, cmyk: { ...d.cmyk }, overprint: true, dieLine: true, widthPt: pt > 0 ? pt : 0.25, printable: d.output !== 'none' };
}

/** The ink type InDesign's Ink Manager gives a finish: a varnish and a die
 *  line are transparent (they print over what is under them and trap
 *  last), a white, a metallic ink and a foil opaque (they cover). */
export function inkType(ink: InkDef): 'Normal' | 'Transparent' | 'Opaque' {
  if (ink.dieLine || ink.finish?.kind === 'varnish') return 'Transparent';
  if (ink.finish && ink.finish.kind !== 'fluorescent') return 'Opaque';
  return 'Normal';
}

/** The script label of an ink's swatch: its finish, its overprint when
 *  the finish would not give it, and the die line's mark. */
export function inkLabel(ink: InkDef): [string, string][] {
  const pairs: [string, string][] = [];
  if (ink.dieLine) pairs.push([DIE_LINE_LABEL, 'true']);
  if (ink.finish) pairs.push([FINISH_LABEL, finishLabel(ink.finish)]);
  if (!ink.dieLine && ink.overprint !== finishOverprintsByDefault(ink.finish)) pairs.push([OVERPRINT_LABEL, String(ink.overprint)]);
  return pairs;
}

/** The `<Ink>` of a spot ink, after the four process inks in trapping
 *  order (transparent inks last). */
export function inkXml(ink: InkDef, order: number): string {
  const type = inkType(ink);
  // Neutral density from the alternate: what the trapping engine weighs.
  const nd = Math.min(2, 0.05 + (ink.cmyk.c * 0.61 + ink.cmyk.m * 0.76 + ink.cmyk.y * 0.16 + ink.cmyk.k * 1.7) / 100);
  return `<Ink${attr('Self', `Ink/${ink.name}`)}${attr('Name', ink.name)} Angle="45" ConvertToProcess="false" Frequency="70"${attr('NeutralDensity', num(nd))} PrintInk="true"${attr('TrapOrder', order)}${attr('InkType', type)}/>`;
}
