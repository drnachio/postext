// The body of a part page on its band (#1444): the list of the part's
// chapters that a part design prints inside its coloured page, low on it
// (where the part's top margin starts the body), in the part body's ink.
// Word cannot set text over a band unless it stands in the band's table,
// so the body joins the band's cell, after a gap down to where the print
// starts it.

import type { WriterContext } from '../context.js';
import { paragraph } from '../wml.js';
import type { Chunk } from './bands.js';
import type { Box } from './geometry.js';

/** Elements a run's properties hold after its colour (the schema's order). */
const AFTER_COLOR = ['spacing', 'w', 'kern', 'position', 'sz', 'szCs', 'highlight', 'u', 'effect', 'bdr', 'shd', 'fitText', 'vertAlign', 'rtl', 'cs', 'em', 'lang', 'eastAsianLayout', 'specVanish', 'oMath'];

/** Run properties `rPr` (inner XML) in ink `color`. */
function inkRPr(inner: string, color: string): string {
  const own = `<w:color w:val="${color}"/>`;
  if (/<w:color [^>]*\/>/.test(inner)) return inner.replace(/<w:color [^>]*\/>/, own);
  const at = inner.search(new RegExp(`<w:(?:${AFTER_COLOR.join('|')})[ />]`));
  return at < 0 ? inner + own : inner.slice(0, at) + own + inner.slice(at);
}

/** Every run of `xml`, and every paragraph mark (a list's number takes
 *  its look), in ink `color`. */
export function inked(xml: string, color: string): string {
  return xml
    .replace(/<w:rPr>((?:(?!<\/w:rPr>)[\s\S])*)<\/w:rPr>/g, (_m, inner: string) => `<w:rPr>${inkRPr(inner, color)}</w:rPr>`)
    .replace(/<w:r>(?!<w:rPr>)/g, `<w:r><w:rPr><w:color w:val="${color}"/></w:rPr>`)
    .replace(/<w:pPr>((?:(?!<\/w:pPr>)[\s\S])*)<\/w:pPr>/g, (m, inner: string) => (inner.includes('<w:rPr>') ? m : `<w:pPr>${inner.replace(/(<w:sectPr[\s\S]*)?$/, `<w:rPr><w:color w:val="${color}"/></w:rPr>$1`)}</w:pPr>`));
}

/** What a part page's body needs from the design: the band at the top of
 *  the body area, and where the design's pieces end on the page, px. */
export interface PartBodyPlace {
  band: NonNullable<Chunk['band']>;
  /** The bottom of the lowest piece written above the body. */
  above: number;
  /** Where the print starts the body. */
  top: number;
  /** The bottom of the text area. */
  textBottom: number;
}

/** The body chunks on the band: a gap down to where the print starts the
 *  body (short of what the page has room for), then the body in `ink`. */
export function partBodyChunks(ctx: WriterContext, body: string, place: PartBodyPlace, ink: string | undefined): Chunk[] {
  const u = ctx.units;
  const mm = u.dpi / 25.4;
  // A line of the body for every paragraph, roughly.
  const lines = (body.match(/<w:p[ >]/g) ?? []).length;
  const bodyH = lines * u.basePx * 2;
  const gap = Math.max(0, Math.min(place.top - place.above, place.textBottom - place.above - bodyH - 30 * mm));
  const out: Chunk[] = [];
  const box: Box = { x: place.band.box.x, y: place.top, width: 1, height: 1 };
  if (gap > 2 * mm) out.push({ xml: paragraph({ before: 0, after: 0, line: { twips: Math.round((gap * 1440) / u.dpi), rule: 'exact' }, ind: { firstLine: 0 }, markRPr: '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' }, ''), band: place.band, box });
  out.push({ xml: ink ? inked(body, ink) : body, band: place.band, box });
  return out;
}
