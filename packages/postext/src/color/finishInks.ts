/**
 * The special inks of a laid-out document by screen hex (#1563, #1564).
 *
 * A finish never reaches the layout: the VDT paints hex colours, and a
 * screen backend learns that a hex is a gold, a white or a varnish the way
 * the print PDF learns its spot inks, by reading the configuration's spot
 * colours (`authoredSpotColors` over the configuration and the colours the
 * pipeline added, `doc.printColors`) through the ink table.
 */

import type { InkFinish, ResolvedPrintInk } from '../types.js';
import type { VDTDocument } from '../vdt.js';
import { authoredSpotColors } from './authored.js';
import { inkEntry, inkKey, printedSpot } from './inks.js';

/** A special ink as a screen hex paints it: its finish, the tint the hex
 *  stands for (percent), the plate's name and whether it overprints. */
export interface FinishInk extends InkFinish {
  /** Percent of the ink the colour lays down, 0–100. */
  tint: number;
  /** The plate the ink prints on (the ink table's `pdfName`). */
  name: string;
  overprint: boolean;
}

type FinishSource = Pick<VDTDocument, 'config' | 'printColors'>;

const cache = new WeakMap<object, { printColors: unknown; inks: ReadonlyMap<string, FinishInk> }>();
const EMPTY: ReadonlyMap<string, FinishInk> = new Map();

function inkTable(doc: FinishSource): readonly ResolvedPrintInk[] {
  return (doc.config as { print?: { inks?: ResolvedPrintInk[] } }).print?.inks ?? [];
}

/**
 * The document's special inks by screen hex (`#rrggbb`, lower case): every
 * spot colour whose ink has a finish, the ink table's over the colour's
 * own. An ink the table sends to process (`output: 'process'`) has none:
 * the press lays it in CMYK. The map is built once per configuration and
 * is empty for a document without special inks, so a painter can ask on
 * every page.
 */
export function finishInks(doc: FinishSource): ReadonlyMap<string, FinishInk> {
  const key = doc.config as object;
  const hit = cache.get(key);
  if (hit && hit.printColors === doc.printColors) return hit.inks;
  const inks = inkTable(doc);
  const out = new Map<string, FinishInk>();
  for (const [hex, spot] of authoredSpotColors([doc.config, doc.printColors])) {
    const printed = printedSpot(spot, inks);
    if (!printed?.finish) continue;
    out.set(hex, { ...printed.finish, tint: printed.tint, name: printed.name, overprint: printed.overprint });
  }
  const result = out.size > 0 ? out : EMPTY;
  cache.set(key, { printColors: doc.printColors, inks: result });
  return result;
}

/** The screen hexes of the document's varnish inks: the screen painters
 *  leave those paints out. */
export function varnishHexes(doc: FinishSource): ReadonlySet<string> {
  const out = new Set<string>();
  for (const [hex, ink] of finishInks(doc)) if (ink.kind === 'varnish') out.add(hex);
  return out;
}

/**
 * The finish of an ink an SVG names (`icc-named-color`, `data-spot`): the
 * ink table's for that name or alias, else the finish of the document's
 * spot colour of that name. `undefined` for an ordinary ink, or one the
 * table sends to process.
 */
export function finishOfInkName(doc: FinishSource, name: string): InkFinish | undefined {
  const inks = inkTable(doc);
  const entry = inkEntry(name, inks);
  if (entry?.output === 'process') return undefined;
  if (entry?.finish) return { ...entry.finish };
  const plate = inkKey(entry?.pdfName ?? name);
  for (const ink of finishInks(doc).values()) {
    if (inkKey(ink.name) === plate) return ink.sheen ? { kind: ink.kind, sheen: ink.sheen } : { kind: ink.kind };
  }
  return undefined;
}
