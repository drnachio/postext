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

/** Every run of `xml`, every paragraph mark and every list's numbers (a
 *  copy of the list's numbering in the ink) in ink `color`. */
export function inked(ctx: WriterContext, xml: string, color: string): string {
  const lists = new Map<string, number>();
  return xml
    .replace(/<w:numId w:val="(\d+)"\/>/g, (_m, id: string) => {
      if (!lists.has(id)) lists.set(id, ctx.numbering.inked(Number(id), color));
      return `<w:numId w:val="${lists.get(id)!}"/>`;
    })
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
  const bodyH = bodyHeight(body, place.band.box.width, u.basePx);
  // The band's row cannot split across pages: a body longer than the room
  // under the band's pieces (a part's introduction of several paragraphs)
  // follows the band in the page's own ink, to flow on to the next page.
  if (bodyH > place.textBottom - place.above - 10 * mm) return [{ xml: body }];
  const gap = Math.max(0, Math.min(place.top - place.above, place.textBottom - place.above - bodyH - 30 * mm));
  const out: Chunk[] = [];
  const box: Box = { x: place.band.box.x, y: place.top, width: 1, height: 1 };
  if (gap > 2 * mm) out.push({ xml: paragraph({ before: 0, after: 0, line: { twips: Math.round((gap * 1440) / u.dpi), rule: 'exact' }, ind: { firstLine: 0 }, markRPr: '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' }, ''), band: place.band, box });
  out.push({ xml: ink ? inked(ctx, body, ink) : body, band: place.band, box });
  return out;
}

/** The body's height on a band `width` px wide, roughly: half an em a
 *  character, a line and a half a line, half a line between paragraphs. */
export function bodyHeight(body: string, width: number, basePx: number): number {
  let h = 0;
  for (const p of body.split('</w:p>').slice(0, -1)) {
    const chars = [...p.matchAll(/<w:t(?: [^>]*)?>([^<]*)<\/w:t>/g)].reduce((n, m) => n + m[1]!.length, 0);
    const lines = Math.max(1, Math.ceil((chars * basePx * 0.5) / Math.max(basePx, width)));
    h += lines * basePx * 1.5 + basePx * 0.5;
  }
  return h;
}
