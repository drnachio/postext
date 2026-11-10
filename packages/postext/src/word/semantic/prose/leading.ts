// The leading of the paragraph styles as each reader sets it (#1458). The
// engine gives a style a distance between lines; Word's "at least" keeps
// it, but Google Docs has neither "at least" nor "exactly": it turns the
// distance into a multiple of 1.2 times the type size and applies that
// multiple to the face's own line, which is taller than 1.2 ems in most
// text faces (1.28 in Lora, 1.3 in Geist), so the body of a book came out
// 6 to 8 % looser there and the book that many pages longer. A multiple
// of the face's own line ("auto") is the one spacing the three programs
// read alike, and with the face embedded they measure that line alike too
// when its tables agree (`naturalLine`). A style whose leading is at least
// its face's own line is written as that multiple; a tighter one (a
// display title) keeps "at least", since LibreOffice drops the fill of a
// table cell that holds a line set below its face's (a multiple under 1).

import type { WordFontPlan } from '../../fonts/types.js';
import type { ParaProps } from '../wml.js';

type Line = NonNullable<ParaProps['line']>;

/** A paragraph style as far as its leading goes. */
export interface LeadingStyle {
  type: 'paragraph' | 'character';
  basedOn?: string;
  pPr?: { line?: Line };
  rPr?: { font?: string; sz?: number };
}

const TAG = (v: DataView, at: number): string => String.fromCharCode(v.getUint8(at), v.getUint8(at + 1), v.getUint8(at + 2), v.getUint8(at + 3));

/**
 * The line a face sets on its own, in ems (ascent, descent and line gap),
 * when every reader measures the same one: the `hhea` values (macOS, and
 * a browser's default) equal to the typographic ones of `OS/2`, and either
 * those marked as the ones to use (USE_TYPO_METRICS, which Word and
 * LibreOffice on Windows follow) or the Windows values equal too.
 * Undefined for a face whose tables differ or cannot be read.
 */
export function naturalLine(bytes: Uint8Array): number | undefined {
  try {
    const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const tables = new Map<string, number>();
    for (let i = 0, n = v.getUint16(4); i < n; i++) tables.set(TAG(v, 12 + i * 16), v.getUint32(12 + i * 16 + 8));
    const head = tables.get('head');
    const hhea = tables.get('hhea');
    const os2 = tables.get('OS/2');
    if (head === undefined || hhea === undefined || os2 === undefined) return undefined;
    const upm = v.getUint16(head + 18);
    const own = v.getInt16(hhea + 4) - v.getInt16(hhea + 6) + v.getInt16(hhea + 8);
    const typo = v.getInt16(os2 + 68) - v.getInt16(os2 + 70) + v.getInt16(os2 + 72);
    const win = v.getUint16(os2 + 74) + v.getUint16(os2 + 76);
    const useTypo = (v.getUint16(os2 + 62) & 0x80) !== 0;
    if (!(upm > 0) || !(own > 0) || Math.abs(own - typo) > 1 || !(useTypo || Math.abs(own - win) <= 1)) return undefined;
    return own / upm;
  } catch {
    return undefined;
  }
}

/** The styles whose text is set in the style's own face and size: the
 *  body, lists, quotes, verse, notes, captions, headings, named paragraph
 *  styles, boxes and code. A multiple of the face's line holds for those
 *  alone: a line of a running head, a contents row or a design's row
 *  mixes faces and sizes set on its runs, a figure's or an equation's
 *  holds a picture, and a multiple would follow the tallest of them. */
const FLOWING = /^(?:Normal|Quote|Caption|ListParagraph|FootnoteText|Heading[1-9]|PostextHeading|PostextBox|PostextList|PostextPara|PostextCaption|PostextCode|PostextVerse|PostextTable)/;

/** A table's cells are set "exactly" at the engine's leading (a face with
 *  tall metrics would otherwise open every row up): the same distance as a
 *  multiple of the face's line, where it is no tighter than that line. */
const CELLS = /^PostextTable/;

/**
 * The leading to write for each paragraph style of `defs` that needs one
 * other than its own entry says: a multiple of its face's line in place of
 * an "at least" distance (a table cell's exact one) that is no tighter
 * than that line, and, for a
 * style that takes its leading from the style it is based on but sets
 * another face or size (or is not one of the flowing styles), the leading
 * it had, in its own terms. Empty when no face is embedded.
 */
export function styleLeadings(defs: ReadonlyMap<string, LeadingStyle>, plan: WordFontPlan | undefined): Map<string, Line> {
  const out = new Map<string, Line>();
  if (!plan?.faces.length) return out;
  const natural = new Map<string, number | undefined>();
  const naturalOf = (family: string | undefined): number | undefined => {
    if (!family) return undefined;
    if (!natural.has(family)) {
      const face = plan.faces.find((f) => f.family === family && f.slot === 'regular') ?? plan.faces.find((f) => f.family === family);
      natural.set(family, face ? naturalLine(face.bytes) : undefined);
    }
    return natural.get(family);
  };
  /** A value through the `basedOn` chain. */
  const through = <T,>(id: string | undefined, read: (d: LeadingStyle) => T | undefined): T | undefined => {
    for (let k = 0, d = id ? defs.get(id) : undefined; d && k < 16; k++, d = d.basedOn ? defs.get(d.basedOn) : undefined) {
      const value = read(d);
      if (value !== undefined) return value;
    }
    return undefined;
  };
  /** The leading style `id` ends up with, as it is written. */
  const written = (id: string | undefined): Line | undefined => {
    const line = through(id, (d) => d.pPr?.line);
    if (!line || !id || !FLOWING.test(id) || line.rule === 'auto' || (line.rule === 'exact' && !CELLS.test(id))) return line;
    const ems = naturalOf(through(id, (d) => d.rPr?.font));
    const size = through(id, (d) => d.rPr?.sz);
    if (!ems || !size) return line;
    // Twips of the face's own line at the style's size (half-points).
    const own = ems * size * 10;
    return line.twips >= own ? { twips: Math.round((240 * line.twips) / own), rule: 'auto' } : line;
  };
  for (const [id, d] of defs) {
    if (d.type !== 'paragraph') continue;
    const line = written(id);
    if (!line) continue;
    const said = d.pPr?.line ?? written(d.basedOn);
    if (!said || said.twips !== line.twips || said.rule !== line.rule) out.set(id, line);
  }
  return out;
}
