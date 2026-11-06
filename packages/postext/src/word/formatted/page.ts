// One page of the formatted Word export (#1392): a section of its own
// (exact page size, no margins, no header or footer room) holding one
// tiny anchor paragraph that carries every drawing of the page in paint
// order: the page background behind the text, then text boxes, shapes,
// pictures and tables.

import type { DisplayPage } from '../../paint/displayList/types.js';
import { anchorRun, shapeGraphic, xfrm } from './drawing.js';
import { imageRun } from './pictures.js';
import { pathRun, rectRuns, ruleRun } from './shapes.js';
import { tableRuns } from './tables.js';
import { textItemRuns } from './text.js';
import { solidFill, twips, wordColor } from './units.js';
import type { WriterContext } from './types.js';

/** Word's largest page side (22 in), twips. */
export const MAX_PAGE_TWIPS = 31680;

/** `w:sectPr` of a page: its size in twips, every margin and distance 0.
 *  Never `w:bidi`, even on a right-to-left page: nothing flows in the
 *  section (each paragraph carries its own direction), and a
 *  right-to-left section lets a renderer measure page-relative drawing
 *  offsets from the right edge, which would mirror every box. */
export function sectPrXml(page: DisplayPage): string {
  const w = twips(page.width, page.dpi);
  const h = twips(page.height, page.dpi);
  return (
    '<w:sectPr>' +
    `<w:pgSz w:w="${w}" w:h="${h}"${w > h ? ' w:orient="landscape"' : ''}/>` +
    '<w:pgMar w:top="0" w:right="0" w:bottom="0" w:left="0" w:header="0" w:footer="0" w:gutter="0"/>' +
    '<w:cols w:space="0"/>' +
    '<w:docGrid w:linePitch="20"/>' +
    '</w:sectPr>'
  );
}

/** Whether a page background needs painting (white paper is the default). */
function paintsBackground(css: string | undefined): boolean {
  const c = wordColor(css);
  return c !== undefined && c.alpha > 0 && c.hex !== 'FFFFFF';
}

/** The drawings of a page, in paint order. */
export async function pageRuns(ctx: WriterContext, page: DisplayPage): Promise<string[]> {
  const runs: string[] = [];
  ctx.front = [];
  if (paintsBackground(page.background)) {
    const rect = { x: 0, y: 0, width: page.width, height: page.height };
    runs.push(anchorRun(ctx, { rect, behind: true, name: 'ptx page' }, (_id, cx, cy) =>
      shapeGraphic(`${xfrm(cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${solidFill(page.background)}<a:ln><a:noFill/></a:ln>`),
    ));
  }
  for (const item of page.items) {
    switch (item.kind) {
      case 'text':
        runs.push(...(await textItemRuns(ctx, item)));
        break;
      case 'rule':
        runs.push(ruleRun(ctx, item));
        break;
      case 'rect':
        runs.push(...rectRuns(ctx, item));
        break;
      case 'path':
        runs.push(pathRun(ctx, item));
        break;
      case 'image': {
        const r = await imageRun(ctx, item);
        if (r) runs.push(r);
        break;
      }
      case 'table':
        runs.push(...(await tableRuns(ctx, item)));
        break;
    }
  }
  return runs;
}

/** A page as body XML: its anchor paragraph, ending its section unless it
 *  is the document's last page (whose `sectPr` closes the body). */
export async function pageXml(ctx: WriterContext, page: DisplayPage, last: boolean): Promise<string> {
  const runs = await pageRuns(ctx, page);
  const sect = sectPrXml(page);
  if (Math.max(twips(page.width, page.dpi), twips(page.height, page.dpi)) > MAX_PAGE_TWIPS) {
    ctx.warn('page-too-large', `a ${(page.width / page.dpi).toFixed(1)} × ${(page.height / page.dpi).toFixed(1)} in page is larger than Word's 22 in limit; Word shrinks the page and the drawings near its far edges fall off it`);
  }
  const pPr =
    '<w:pPr><w:pStyle w:val="PostextAnchor"/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/>' +
    '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' +
    (last ? '' : sect) +
    '</w:pPr>';
  return `<w:p>${pPr}${runs.join('')}</w:p>${last ? sect : ''}`;
}
