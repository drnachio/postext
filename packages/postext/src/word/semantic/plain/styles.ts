// The styles of the plain design (#1458). The neutral config
// (`plain/config.ts`) gives every style its plain look; what a config
// cannot say is set here, on each style as the registry takes it in:
// Word's own automatic line spacing in place of the book's leading, no
// East Asian face named, an italic caption, a grey highlight and no fill
// behind a chip.

import { STYLE, type StyleDef } from '../styles.js';
import { PLAIN_LINE } from './config.js';

/** Automatic spacing, a multiple of the face's own line (240 = single). */
const AUTO_LINE = { twips: Math.round(240 * PLAIN_LINE), rule: 'auto' as const };

/** The grey a `:mark` keeps: the author's highlight, with no colour. */
const MARK_FILL = 'D9D9D9';

/** Style `def` of id `id` as the plain design writes it. */
export function plainStyleDef(id: string, def: StyleDef): StyleDef {
  const out: StyleDef = { ...def };
  if (def.pPr) {
    // Every style takes the body's spacing: a leading in points belongs
    // to the book's face, and Arial at "at least" or "exactly" that many
    // points would be set too tight or too open.
    const { line, ...pPr } = def.pPr;
    out.pPr = id === STYLE.normal ? { ...pPr, line: AUTO_LINE } : line?.rule === 'auto' ? def.pPr : pPr;
  }
  // Arial and Courier New hold no Han, kana or hangul: a style that names
  // one leaves the East Asian face to the reader's own.
  if (def.rPr?.font) out.rPr = { ...def.rPr, eastAsia: false };
  if (id.startsWith(STYLE.chip) && out.rPr) out.rPr = { ...out.rPr, shd: undefined };
  if (id === STYLE.mark) out.rPr = { ...out.rPr, shd: MARK_FILL };
  // Captions are small and italic, their notes with them.
  if (id === STYLE.caption) out.rPr = { ...out.rPr, i: true };
  return out;
}
