// Tables as fixed-layout Word tables (#1392): grid columns from the
// column edges, exact row heights from the row edges, zero cell margins,
// cell fills and borders, each cell's lines placed by its paragraphs'
// indents and a spacing before the first one. Cell pictures are anchored
// on the page over their cell. An unturned table floats on its page
// (`w:tblpPr`, floats.ts, #1444); a turned one stays in a text box.

import type { DisplayItem } from '../../paint/displayList/types.js';
import { textBoxRun, turnedBox } from './drawing.js';
import { hasFragment, recordFragment, reserveFragment } from './fragments.js';
import { baselineOffset } from './metrics.js';
import { emitGroups, planChunks, planLines, type TextOut } from './paragraphs.js';
import { imageRun } from './pictures.js';
import { inlineDrawingRuns, lineOffsets } from './text.js';
import { chipBoxRuns, hasChipBoxes, swatchShapeRuns } from './inlineShapes.js';
import { rectRuns } from './shapes.js';
import { eighths, twips, twipsToPx, wordColor } from './units.js';
import type { WriterContext } from './types.js';

type TableItem = Extract<DisplayItem, { kind: 'table' }>;
type Cell = TableItem['cells'][number];
/** A cell's paragraphs with inline drawings, and whether its lines are
 *  vertical (a swatch keeps its holder's square there). */
type Pending = { out: TextOut; vertical: boolean };

/** An empty paragraph that takes no room (a cell needs one; so does the
 *  end of a text box after a table). */
const TINY_P = '<w:p><w:pPr><w:pStyle w:val="PostextAnchor"/><w:spacing w:before="0" w:after="0" w:line="20" w:lineRule="exact"/><w:rPr><w:sz w:val="2"/><w:szCs w:val="2"/></w:rPr></w:pPr></w:p>';

/** Edges from 0, in twips, sorted, each a whole twip from the last:
 *  edges that round together (float noise in the cell rects) would make
 *  zero-width grid columns or rows. */
export function edgeTwips(edges: readonly number[], dpi: number, total: number): number[] {
  const out = [0];
  for (const v of [...edges].sort((a, b) => a - b)) {
    const t = twips(v, dpi);
    if (t > out[out.length - 1]!) out.push(t);
  }
  // No edges at all: one column (row) the table's size.
  if (out.length < 2) out.push(Math.max(1, twips(total, dpi)));
  return out;
}

function nearest(edges: readonly number[], v: number): number {
  let best = 0;
  for (let i = 1; i < edges.length; i++) if (Math.abs(edges[i]! - v) < Math.abs(edges[best]! - v)) best = i;
  return best;
}

function bordersXml(ctx: WriterContext, item: TableItem): string {
  const c = wordColor(item.borderColor);
  if (!c || !item.borderWidthPx || item.borderWidthPx <= 0) {
    return '<w:tcBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/></w:tcBorders>';
  }
  const sz = Math.min(96, Math.max(2, eighths(item.borderWidthPx, ctx.dpi)));
  const b = (side: string): string => `<w:${side} w:val="single" w:sz="${sz}" w:space="0" w:color="${c.hex}"/>`;
  return `<w:tcBorders>${b('top')}${b('left')}${b('bottom')}${b('right')}</w:tcBorders>`;
}

function cellProps(width: number, span: number, vMerge: '' | 'restart' | 'continue', borders: string, fill: string | undefined): string {
  const shd = wordColor(fill);
  return (
    `<w:tcPr><w:tcW w:w="${width}" w:type="dxa"/>` +
    (span > 1 ? `<w:gridSpan w:val="${span}"/>` : '') +
    (vMerge === 'restart' ? '<w:vMerge w:val="restart"/>' : vMerge === 'continue' ? '<w:vMerge/>' : '') +
    borders +
    (shd && shd.alpha > 0 ? `<w:shd w:val="clear" w:color="auto" w:fill="${shd.hex}"/>` : '') +
    '<w:tcMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tcMar>' +
    '<w:vAlign w:val="top"/></w:tcPr>'
  );
}

/** Where a table goes on its page: `float`, a floating Word table
 *  (`w:tblpPr`) in the body after the page's anchor paragraph, its x and y
 *  in twips from the page's top left corner; `under`, drawings painted
 *  before it (chip boxes) and `over`, drawings painted after it (cell
 *  pictures, inline drawings); or, for a turned table, `box`, a text box
 *  holding it. */
export interface TableParts {
  under: string[];
  box?: string;
  float?: { xml: string; x: number; y: number; height: number };
  over: string[];
}

/** A table item: its text box, and the pictures and inline drawings over it. */
export async function tableRuns(ctx: WriterContext, item: TableItem): Promise<string[]> {
  const parts = await tableParts(ctx, item, false);
  return [...parts.under, ...(parts.box ? [parts.box] : []), ...parts.over];
}

/** Whether a table can float on its page: an unturned table inside the
 *  page. A floating table's anchor paragraph comes after it in the flow;
 *  a table that reaches the foot of the page would push that paragraph
 *  onto a page of its own. */
export function floatsOnPage(item: TableItem, pageWidth: number, pageHeight: number, dpi: number): boolean {
  if (item.rotate) return false;
  const r = item.rect;
  const room = (FLOAT_FOOT_TW * dpi) / 1440;
  return r.x >= 0 && r.y >= 0 && r.x + r.width <= pageWidth + 0.5 && r.y + r.height <= pageHeight - room;
}

/** Room a floating table leaves under it at the foot of the page, twips:
 *  the anchor paragraph after it and the page's last paragraph. */
export const FLOAT_FOOT_TW = 80;

/** A table item as a text box (`floating` false) or as a floating table. */
export async function tableParts(ctx: WriterContext, item: TableItem, floating: boolean): Promise<TableParts> {
  const dpi = ctx.dpi;
  const cols = edgeTwips(item.columnEdges, dpi, item.rect.width);
  const rows = edgeTwips(item.rowEdges, dpi, item.rect.height);
  const colPx = cols.map((t) => twipsToPx(t, dpi));
  const rowPx = rows.map((t) => twipsToPx(t, dpi));
  const nCols = Math.max(1, cols.length - 1);
  const nRows = Math.max(1, rows.length - 1);
  const centre = { x: item.rect.x + item.rect.width / 2, y: item.rect.y + item.rect.height / 2 };
  const borders = bordersXml(ctx, item);
  const pending: Pending[] = [];

  // A shaded cell that holds chips is filled by a shape under their boxes:
  // its own shading would cover them (answer bubbles on a tinted grid).
  const shapeFilled = new Set(item.cells.filter((cell) => wordColor(cell.background) !== undefined && cell.item !== null && hasChipBoxes(cell.item.lines)));
  const shading = (cell: Cell): string | undefined => (shapeFilled.has(cell) ? undefined : cell.background);

  // Where each cell sits in the grid.
  const at = new Map<string, { cell: Cell; c: number; r: number; span: number; rowSpan: number }>();
  const covered = new Map<string, { span: number; fill: string | undefined }>();
  for (const cell of item.cells) {
    const c = Math.min(nCols - 1, nearest(colPx, cell.rect.x - item.rect.x));
    const c2 = Math.max(c + 1, nearest(colPx, cell.rect.x + cell.rect.width - item.rect.x));
    const r = Math.min(nRows - 1, nearest(rowPx, cell.rect.y - item.rect.y));
    const r2 = Math.max(r + 1, nearest(rowPx, cell.rect.y + cell.rect.height - item.rect.y));
    if (at.has(`${r}:${c}`)) continue;
    at.set(`${r}:${c}`, { cell, c, r, span: c2 - c, rowSpan: r2 - r });
    for (let rr = r + 1; rr < r2; rr++) covered.set(`${rr}:${c}`, { span: c2 - c, fill: shading(cell) });
  }

  // A floating table is placed on the page by its tblpPr in Word and
  // LibreOffice, which ignore its indent; Google Docs has no floating
  // tables and sets it in the flow, where the indent puts it at its x.
  const x = twips(item.rect.x, dpi);
  const y = twips(item.rect.y, dpi);
  // A floating table's indent is its x for Google Docs, which has no
  // floating tables. LibreOffice's DOCX import zeroes the indent of a
  // floating table and places it by tblpX alone, following Word, whose
  // Table Properties leave "Indent from left" unavailable for a table
  // with text wrapping around it. Not yet checked in a Word render.
  const float = floating
    ? `<w:tblpPr w:leftFromText="0" w:rightFromText="0" w:topFromText="0" w:bottomFromText="0" w:vertAnchor="page" w:horzAnchor="page" w:tblpX="${x}" w:tblpY="${y}"/><w:tblOverlap w:val="overlap"/>`
    : '';
  const xml: string[] = [
    `<w:tbl><w:tblPr>${float}<w:tblW w:w="${cols[cols.length - 1]! - cols[0]!}" w:type="dxa"/><w:tblInd w:w="${floating ? x : 0}" w:type="dxa"/>`,
    '<w:tblBorders><w:top w:val="nil"/><w:left w:val="nil"/><w:bottom w:val="nil"/><w:right w:val="nil"/><w:insideH w:val="nil"/><w:insideV w:val="nil"/></w:tblBorders>',
    '<w:tblLayout w:type="fixed"/><w:tblCellMar><w:top w:w="0" w:type="dxa"/><w:left w:w="0" w:type="dxa"/><w:bottom w:w="0" w:type="dxa"/><w:right w:w="0" w:type="dxa"/></w:tblCellMar><w:tblLook w:val="0000"/></w:tblPr>',
    `<w:tblGrid>${cols.slice(1).map((v, i) => `<w:gridCol w:w="${v - cols[i]!}"/>`).join('')}</w:tblGrid>`,
  ];
  for (let r = 0; r < nRows; r++) {
    xml.push(`<w:tr><w:trPr><w:cantSplit/><w:trHeight w:val="${Math.max(1, rows[r + 1]! - rows[r]!)}" w:hRule="exact"/></w:trPr>`);
    let c = 0;
    while (c < nCols) {
      const width = (span: number): number => cols[Math.min(nCols, c + span)]! - cols[c]!;
      const placed = at.get(`${r}:${c}`);
      const cont = covered.get(`${r}:${c}`);
      if (placed) {
        const { cell, span, rowSpan } = placed;
        xml.push(`<w:tc>${cellProps(width(span), span, rowSpan > 1 ? 'restart' : '', borders, shading(cell))}`);
        xml.push(cellContent(ctx, cell, pending));
        xml.push('</w:tc>');
        c += span;
      } else if (cont) {
        xml.push(`<w:tc>${cellProps(width(cont.span), cont.span, 'continue', borders, cont.fill)}${TINY_P}</w:tc>`);
        c += cont.span;
      } else {
        xml.push(`<w:tc>${cellProps(width(1), 1, '', borders, undefined)}${TINY_P}</w:tc>`);
        c += 1;
      }
    }
    xml.push('</w:tr>');
  }
  xml.push('</w:tbl>');
  // Chip boxes under the table, on the fills of the cells that hold them.
  const under = [...shapeFilled].flatMap((cell) =>
    rectRuns(ctx, { kind: 'rect', rect: turnedBox(cell.rect, centre, item.rotate), fill: cell.background!, ...(item.rotate ? { rotate: item.rotate } : {}) }),
  );
  for (const cell of item.cells) if (cell.item) under.push(...chipBoxRuns(ctx, cell.item.lines, centre, item.rotate));
  const parts: TableParts = { under, over: [] };
  if (floating) parts.float = { xml: xml.join(''), x, y, height: rows[rows.length - 1]! };
  else parts.box = textBoxRun(ctx, { rect: item.rect, name: 'ptx table', ...(item.rotate ? { rotate: item.rotate } : {}) }, xml.join('') + TINY_P);
  const runs = parts.over;
  for (const cell of item.cells) {
    if (!cell.image) continue;
    const img = { ...cell.image, rect: turnedBox(cell.image.rect, centre, item.rotate), ...(item.rotate ? { rotate: item.rotate } : {}) };
    const run = await imageRun(ctx, img);
    if (run) runs.push(run);
  }
  // Inline drawings of the cells, collected while their text was written.
  for (const p of pending) runs.push(...(await inlineDrawingRuns(ctx, p.out, centre, item.rotate, p.vertical)));
  for (const cell of item.cells) if (cell.item) runs.push(...swatchShapeRuns(ctx, cell.item.lines, centre, item.rotate));
  return parts;
}

/** The paragraphs of a cell (bookmarked when importable); a cell with
 *  inline drawings goes into `pending`, to draw them after the table. */
function cellContent(ctx: WriterContext, cell: Cell, pending: Pending[]): string {
  const item = cell.item;
  if (!item || item.lines.length === 0) return TINY_P;
  const plans = planLines(ctx, item.lines, false);
  const [chunk] = planChunks(item.lines, plans, false);
  if (!chunk) return TINY_P;
  const first = item.lines[0]!;
  const top = first.baseline - baselineOffset(twipsToPx(plans[0]!.h, ctx.dpi));
  const slot = hasFragment(item) ? reserveFragment(ctx) : undefined;
  const out = emitGroups(ctx, item, chunk.groups, cell.rect.x, cell.rect.x + cell.rect.width, {
    offsets: lineOffsets(item),
    spaceBefore: twips(top - cell.rect.y, ctx.dpi),
    ...(slot ? { bookmarkStart: slot.start, bookmarkEnd: slot.end } : {}),
  });
  if (slot && hasFragment(item)) recordFragment(ctx, slot, item, out);
  if (out.drawings.length) pending.push({ out, vertical: item.lines.some((l) => l.vertical) });
  return out.xml;
}
