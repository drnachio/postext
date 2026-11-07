// One page of the formatted Word export (#1392): a section of its own
// (exact page size, no margins, no header or footer room) holding one
// tiny anchor paragraph that carries every drawing of the page in paint
// order: the page background behind the text, then text boxes, shapes,
// pictures and tables. Unturned tables float in the body after it
// (floats.ts, #1444), with the drawings under them sent behind the text.

import type { DisplayItem, DisplayPage } from '../../paint/displayList/types.js';
import { anchorRun, shapeGraphic, xfrm } from './drawing.js';
import { FLOW_LINE, floatingTables, floatsXml, flowParagraph, type PageFloat } from './floats.js';
import { itemRect, layerRuns, type Layer } from './layers.js';
import { imageRun } from './pictures.js';
import { pathRun, rectRuns, ruleRun } from './shapes.js';
import { tableParts } from './tables.js';
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

/** The drawings of a page and its floating tables. */
export interface PageParts {
  runs: string[];
  floats: PageFloat[];
}

/** The drawings of a page, in paint order (every table in a text box). */
export async function pageRuns(ctx: WriterContext, page: DisplayPage): Promise<string[]> {
  return (await pageParts(ctx, page, new Set())).runs;
}

/** The drawings of a page in paint order, the tables in `floating` set
 *  apart as floating tables. */
export async function pageParts(ctx: WriterContext, page: DisplayPage, floating: ReadonlySet<DisplayItem> = floatingTables(page)): Promise<PageParts> {
  const layers: Layer[] = [];
  const floats: PageFloat[] = [];
  if (paintsBackground(page.background)) {
    const rect = { x: 0, y: 0, width: page.width, height: page.height };
    layers.push({
      runs: [anchorRun(ctx, { rect, behind: true, name: 'ptx page' }, (_id, cx, cy) =>
        shapeGraphic(`${xfrm(cx, cy)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>${solidFill(page.background)}<a:ln><a:noFill/></a:ln>`),
      )],
    });
  }
  for (const item of page.items) {
    const rect = itemRect(item);
    switch (item.kind) {
      case 'text':
        layers.push({ runs: await textItemRuns(ctx, item), rect });
        break;
      case 'rule':
        layers.push({ runs: [ruleRun(ctx, item)], rect });
        break;
      case 'rect':
        layers.push({ runs: rectRuns(ctx, item), rect });
        break;
      case 'path':
        layers.push({ runs: [pathRun(ctx, item)], rect });
        break;
      case 'image': {
        const r = await imageRun(ctx, item);
        if (r) layers.push({ runs: [r], rect });
        break;
      }
      case 'table': {
        const parts = await tableParts(ctx, item, floating.has(item));
        layers.push({ runs: parts.under, rect });
        if (parts.float) {
          layers.push({ runs: [], rect, table: true });
          floats.push(parts.float);
        } else if (parts.box) {
          layers.push({ runs: [parts.box], rect });
        }
        layers.push({ runs: parts.over, rect });
        break;
      }
    }
  }
  return { runs: layerRuns(layers), floats };
}

/** A page as body XML: its anchor paragraph (then its floating tables and
 *  a closing empty paragraph), ending its section unless it is the
 *  document's last page (whose `sectPr` closes the body). */
export async function pageXml(ctx: WriterContext, page: DisplayPage, last: boolean): Promise<string> {
  const { runs, floats } = await pageParts(ctx, page);
  const sect = sectPrXml(page);
  if (Math.max(twips(page.width, page.dpi), twips(page.height, page.dpi)) > MAX_PAGE_TWIPS) {
    ctx.warn('page-too-large', `a ${(page.width / page.dpi).toFixed(1)} × ${(page.height / page.dpi).toFixed(1)} in page is larger than Word's 22 in limit; Word shrinks the page and the drawings near its far edges fall off it`);
  }
  const closing = last ? '' : sect;
  const pPr =
    `<w:pPr><w:pStyle w:val="PostextAnchor"/><w:spacing w:before="0" w:after="0" w:line="${FLOW_LINE}" w:lineRule="exact"/>` +
    '<w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr>' +
    (floats.length ? '' : closing) +
    '</w:pPr>';
  const tables = floats.length ? floatsXml(floats) + flowParagraph(FLOW_LINE, closing) : '';
  return `<w:p>${pPr}${runs.join('')}</w:p>${tables}${last ? sect : ''}`;
}
