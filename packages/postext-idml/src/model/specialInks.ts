// Special inks and die lines in an IDML package, both ways (#1576): the
// names a die line goes by, and the script labels the export writes so
// the import gets back what InDesign has no field for.
//
// A finish (metallic, foil, fluorescent, opaque white, varnish) is not
// something an InDesign swatch can say; the export records it as the
// swatch's script label `postext:finish` (`foil`, `varnish matte`), and
// the import reads it back before it falls back to the swatch's name
// (`guessInkFinish`). A die line is a spot swatch the die-maker reads and
// paths stroked with it, on a layer of their own.

import type { InkFinish, InkFinishKind, InkSheen } from 'postext';

/** The swatch label holding an ink's finish: `<kind>` or `<kind> <sheen>`. */
export const FINISH_LABEL = 'postext:finish';
/** The swatch label holding whether an ink overprints, when it is not what
 *  its finish does by default (`true` or `false`). */
export const OVERPRINT_LABEL = 'postext:overprint';
/** The swatch label that marks the die line's swatch, whatever its name. */
export const DIE_LINE_LABEL = 'postext:dieLine';
/** The label of a die path: the die shape it cuts, as JSON (`id`, `name`,
 *  `shape`, `d`, `viewBox`, `wrap`), all but its place, which the path
 *  itself gives. */
export const DIE_LABEL = 'postext:die';
/** The layer the export puts the die line on. */
export const DIE_LINE_LAYER = 'Die line';

const KINDS: readonly InkFinishKind[] = ['metallic', 'foil', 'fluorescent', 'white', 'varnish'];
const SHEENS: readonly InkSheen[] = ['gloss', 'satin', 'matte', 'softTouch'];

/** A finish as the label writes it. */
export const finishLabel = (f: InkFinish): string => (f.sheen ? `${f.kind} ${f.sheen}` : f.kind);

/** A finish label read back; undefined for anything else. */
export function parseFinishLabel(s: string | undefined): InkFinish | undefined {
  const [kind, sheen, ...rest] = (s ?? '').trim().split(/\s+/);
  if (rest.length || !KINDS.includes(kind as InkFinishKind)) return undefined;
  if (sheen === undefined) return { kind: kind as InkFinishKind };
  return SHEENS.includes(sheen as InkSheen) ? { kind: kind as InkFinishKind, sheen: sheen as InkSheen } : { kind: kind as InkFinishKind };
}

// The names die-makers and printers give the die line's plate or layer,
// as the port skill's `ink_finishes.py` (`die_line_plate`) has them: keep
// the two lists in step. Whole words, so `Diesel blue` is no die line.
const DIE_WORDS = [
  'cut ?contour', 'die ?line', 'die ?cut(?:ting)?', 'die', 'cutter', 'cut ?line', 'kiss ?cut', 'thru ?cut',
  'troquel', 'troquelado', 'línea de troquel', 'linea de troquel', 'fustella', 'faca', 'stanz\\p{L}*', 'découpe', 'decoupe',
];
const DIE_WHOLE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${DIE_WORDS.join('|')})(?![\\p{L}\\p{N}])`, 'iu');
// Chinese, Japanese and Arabic names, found anywhere in the name.
const DIE_ANYWHERE = /模切|刀模|刀版|抜き型|トムソン|قالب القص/u;

/** Whether a swatch or layer name is the die line's (CutContour, Die,
 *  Dieline, Troquel, Stanzform, 模切…). */
export function isDieLineName(name: string): boolean {
  const n = name.normalize('NFC');
  return DIE_WHOLE.test(n) || DIE_ANYWHERE.test(n);
}
