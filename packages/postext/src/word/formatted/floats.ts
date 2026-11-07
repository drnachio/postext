// Floating tables in a page's flow (#1444). Google Docs takes a table out
// of a text box and sets it at the box's anchor paragraph, at the top of
// the page, so a page's unturned tables are floating Word tables in the
// body instead: Word and LibreOffice place them on the page by their
// `w:tblpPr`, Google Docs (no floating tables) sets them in the flow,
// where an empty paragraph of exact height before each brings it down to
// its y and its indent takes it to its x.

import type { DisplayItem, DisplayPage } from '../../paint/displayList/types.js';
import { MAX_PITCH } from './paragraphs.js';
import { FLOAT_FOOT_TW, floatsOnPage } from './tables.js';
import { twips } from './units.js';

/** A floating table of a page: its XML and where it stands, in twips from
 *  the page's top left corner. */
export interface PageFloat {
  xml: string;
  x: number;
  y: number;
  height: number;
}

/** The pitch of an empty paragraph in the flow (the page's anchor
 *  paragraph's too), twips. */
export const FLOW_LINE = 20;

/** The tables of a page that float: unturned ones inside the page whose
 *  stack in the flow (each at its y, or under the one before it) still
 *  fits on the page, so no renderer opens a page for the flow. The
 *  others stay in text boxes. */
export function floatingTables(page: DisplayPage): Set<DisplayItem> {
  const out = new Set<DisplayItem>();
  const tables = page.items.filter((i): i is Extract<DisplayItem, { kind: 'table' }> => i.kind === 'table' && floatsOnPage(i, page.width, page.height, page.dpi));
  tables.sort((a, b) => a.rect.y - b.rect.y);
  const limit = twips(page.height, page.dpi) - FLOAT_FOOT_TW;
  let flow = FLOW_LINE;
  for (const t of tables) {
    const top = Math.max(flow + FLOW_LINE, twips(t.rect.y, page.dpi));
    const bottom = top + twips(t.rect.height, page.dpi);
    if (bottom > limit) continue;
    out.add(t);
    flow = bottom;
  }
  return out;
}

/** An empty paragraph `pitch` twips tall, closing a section when `sect`
 *  is given. */
export function flowParagraph(pitch: number, sect = ''): string {
  return (
    '<w:p><w:pPr><w:pStyle w:val="PostextAnchor"/>' +
    `<w:spacing w:before="0" w:after="0" w:line="${pitch}" w:lineRule="exact"/>` +
    `<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>${sect}</w:pPr></w:p>`
  );
}

/** A page's floating tables in order down the page, each after the empty
 *  paragraph that brings it to its y in the flow. Word and LibreOffice
 *  move a paragraph that would sit under a floating table below it, so
 *  their flow never runs further down than this one. */
export function floatsXml(floats: readonly PageFloat[]): string {
  const out: string[] = [];
  let flow = FLOW_LINE;
  for (const f of [...floats].sort((a, b) => a.y - b.y)) {
    const pitch = Math.min(MAX_PITCH, Math.max(FLOW_LINE, f.y - flow));
    out.push(flowParagraph(pitch), f.xml);
    flow += pitch + f.height;
  }
  return out.join('');
}
