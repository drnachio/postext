// The document's spot inks as the book's ink table (#1576): every spot
// swatch with a finish becomes an entry of `print.inks`. The finish a
// Postext export recorded in the swatch's label (`postext:finish`) comes
// back as written; any other spot swatch gets the finish its name
// suggests (`guessInkFinish`: `Gold`, `PANTONE 871 C` metallic, `Hot
// foil` foil, `Varnish`, `Barniz UVI` varnish), which the report lists for
// someone to confirm with the printer. The die line's swatch is no ink of
// the book (`dieCuts.ts`).

import { guessInkFinish, type InkFinish, type PrintInk } from 'postext';
import type { IdmlColor, IdmlDocument, IdmlSwatch } from '../../model/document.js';
import { DIE_LINE_LABEL, FINISH_LABEL, isDieLineName, OVERPRINT_LABEL, parseFinishLabel } from '../../model/specialInks.js';
import type { Reporter } from '../report.js';

const isColour = (s: IdmlSwatch | undefined): s is IdmlColor => s?.kind === 'color';

/** Whether a colour swatch is the die line's: marked so by an export from
 *  Postext, or named as die lines are (CutContour, Die, Troquel…). */
export const isDieSwatch = (s: IdmlColor): boolean => s.label?.[DIE_LINE_LABEL] === 'true' || (s.model === 'Spot' && isDieLineName(s.name));

/** The references of the die line's swatches: its colours and their
 *  tints. */
export function dieSwatchRefs(doc: IdmlDocument): Set<string> {
  const out = new Set<string>();
  for (const [ref, s] of doc.swatches) if (isColour(s) && !s.special && isDieSwatch(s)) out.add(ref);
  for (const [ref, s] of doc.swatches) if (s.kind === 'tint' && out.has(s.base)) out.add(ref);
  return out;
}

/** A spot swatch's finish: the one its label records, else the one its
 *  name suggests (`guessed`). */
export function swatchFinish(s: IdmlColor): { finish: InkFinish; guessed: boolean } | undefined {
  const recorded = s.label?.[FINISH_LABEL];
  if (recorded !== undefined) {
    const finish = parseFinishLabel(recorded);
    return finish ? { finish, guessed: false } : undefined;
  }
  const finish = guessInkFinish(s.name);
  return finish ? { finish, guessed: true } : undefined;
}

/** The ink table of the document's spot swatches: one entry per ink with
 *  a finish or an overprint of its own. */
export function printInks(doc: IdmlDocument, rep: Reporter): PrintInk[] {
  const out: PrintInk[] = [];
  const guessed: string[] = [];
  const seen = new Set<string>();
  for (const s of doc.swatches.values()) {
    if (!isColour(s) || s.model !== 'Spot' || s.special || isDieSwatch(s) || seen.has(s.name)) continue;
    seen.add(s.name);
    const f = swatchFinish(s);
    const overprint = s.label?.[OVERPRINT_LABEL];
    if (!f && overprint === undefined) continue;
    const ink: PrintInk = { name: s.name };
    if (f) ink.finish = f.finish;
    if (overprint === 'true' || overprint === 'false') ink.overprint = overprint === 'true';
    if (f?.guessed) guessed.push(`${s.name}: ${f.finish.kind}${f.finish.sheen ? ` ${f.finish.sheen}` : ''}`);
    out.push(ink);
  }
  if (guessed.length) rep.add('inkFinishGuessed', 'info', 'A spot ink\'s finish (metallic, foil, fluorescent, white, varnish) is read from its name: confirm it with the printer', guessed.slice(0, 5).join(', '), guessed.length);
  return out;
}
