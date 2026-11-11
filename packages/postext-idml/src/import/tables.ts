// A table of a story as a table resource: the grid with its merged
// cells, header rows, column widths, fills and alignment, and a named
// table style for its look.

import type { ColorValue, NamedTableStyleConfig, Resource, TableCell, TableModel } from 'postext';
import type { IdmlCell, IdmlTable, Props } from '../model/document.js';
import { computeStyle, mergeProps } from '../resolve/styles.js';
import type { Context } from './context.js';
import { idOf } from './escape.js';
import { inlineOf, type InlineEnv } from './inline.js';
import { withInlineBreaks } from './marks.js';
import { pictureResource } from './pictures.js';
import { pt } from './values.js';

const num = (p: Props, name: string): number | undefined => {
  const n = Number(p.attrs[name]);
  return p.attrs[name] !== undefined && Number.isFinite(n) ? n : undefined;
};

const stores = new WeakMap<Context, { byKey: Map<string, string>; list: NamedTableStyleConfig[] }>();

export function tableStyles(ctx: Context): NamedTableStyleConfig[] {
  return stores.get(ctx)?.list ?? [];
}

function cellProps(ctx: Context, table: IdmlTable, cell: IdmlCell): Props {
  return mergeProps(computeStyle(ctx.doc, 'cell', cell.cellStyle), { attrs: cell.attrs, properties: cell.properties });
}

/** The text of a cell as a snippet: paragraphs parted by a newline, list
 *  paragraphs with their marker. */
function cellText(ctx: Context, cell: IdmlCell, env: InlineEnv, after: string[]): { text: string; align?: TableCell['align']; size?: number; family?: string; bold: boolean; colour?: ColorValue } {
  const lines: string[] = [];
  let align: TableCell['align'];
  let size: number | undefined;
  let family: string | undefined;
  let bold = false;
  let colour: ColorValue | undefined;
  let n = 0;
  for (const para of cell.paragraphs) {
    const look = ctx.looks.of(para);
    const { leadIn: _host, ...rest } = env;
    void _host;
    const inner: InlineEnv = { ...rest, where: 'snippet', look, after };
    const r = inlineOf(ctx, para, inner);
    const text = withInlineBreaks(r.text).trim();
    if (!text) continue;
    if (align === undefined && look.pf.align !== 'left' && look.pf.align !== 'justify') align = look.pf.align;
    size ??= look.cf.pointSize;
    family ??= look.cf.fontFamily;
    if (!lines.length) {
      bold = look.weight >= 600;
      colour = ctx.palette.colour(look.cf.fillColor, look.cf.fillTint);
    }
    ctx.counts.paragraphs++;
    const list = look.pf.list;
    lines.push(list ? `${list.type === 'numbered' ? `${++n}.` : '•'} ${text}` : text);
  }
  const out: ReturnType<typeof cellText> = { text: lines.join('\n'), bold };
  if (align) out.align = align;
  if (size !== undefined) out.size = size;
  if (family) out.family = family;
  if (colour) out.colour = colour;
  return out;
}

const VERTICAL: Record<string, TableCell['verticalAlign']> = { CenterAlign: 'middle', BottomAlign: 'bottom' };

/** A table as a resource; its id. */
export function tableResource(ctx: Context, table: IdmlTable, env: InlineEnv, after: string[]): string {
  ctx.counts.tables++;
  // The grid is the one the table declares; a table that declares none
  // is as large as its cells say (capped: a cell's name is only a number).
  const span = (n: number): number => (Number.isFinite(n) && n >= 0 ? Math.min(n, 2000) : 0);
  const rows = table.rows.length || Math.max(0, ...table.cells.map((c) => span(c.row) + 1));
  const cols = table.columns.length || Math.max(0, ...table.cells.map((c) => span(c.col) + 1));
  const grid: (TableCell | undefined)[][] = Array.from({ length: rows }, () => new Array<TableCell | undefined>(cols).fill(undefined));
  const notes: string[] = [];
  const inner: InlineEnv = { ...env, snippetNotes: notes };
  const body = { size: new Map<number, number>(), family: new Map<string, number>() };
  let headerBold = 0;
  let headerCells = 0;
  let headerFill: ColorValue | undefined;
  let headerColour: ColorValue | undefined;
  const sample = `table of ${cols} × ${rows}`;

  for (const cell of table.cells) {
    if (cell.row < 0 || cell.col < 0 || cell.row >= rows || cell.col >= cols || !Number.isFinite(cell.row) || !Number.isFinite(cell.col)) {
      ctx.rep.add('tableCellOffGrid', 'loss', 'A table cell that stands outside its table\'s rows and columns is left out', sample);
      continue;
    }
    if (grid[cell.row]![cell.col]) {
      ctx.rep.add('tableSpanConflict', 'warning', 'Two table cells claim the same place (overlapping merges); the first one written keeps it', sample);
      continue;
    }
    const p = cellProps(ctx, table, cell);
    const t = cellText(ctx, cell, inner, after);
    const out: TableCell = { content: t.text };
    // A merge is cut where the table ends or another cell stands.
    let colSpan = Math.min(cell.colSpan, cols - cell.col);
    let rowSpan = Math.min(cell.rowSpan, rows - cell.row);
    if (colSpan !== cell.colSpan || rowSpan !== cell.rowSpan) ctx.rep.add('tableSpanOffGrid', 'warning', 'A merged cell that runs past its table is cut at the table\'s edge', sample);
    const free = (r: number, c: number): boolean => !grid[r]![c];
    for (let c = cell.col + 1; c < cell.col + colSpan; c++) if (!free(cell.row, c)) colSpan = c - cell.col;
    for (let r = cell.row + 1; r < cell.row + rowSpan; r++) {
      let ok = true;
      for (let c = cell.col; c < cell.col + colSpan; c++) if (!free(r, c)) ok = false;
      if (!ok) {
        rowSpan = r - cell.row;
        ctx.rep.add('tableSpanConflict', 'warning', 'Two table cells claim the same place (overlapping merges); the first one written keeps it', sample);
      }
    }
    if (colSpan > 1) out.colSpan = colSpan;
    if (rowSpan > 1) out.rowSpan = rowSpan;
    const header = cell.row < table.headerRows;
    if (header) out.isHeader = true;
    if (t.align) out.align = t.align;
    const v = VERTICAL[p.attrs.VerticalJustification ?? ''];
    if (v) out.verticalAlign = v;
    const fill = ctx.palette.colour(p.attrs.FillColor, num(p, 'FillTint'), 'table cell');
    if (fill) out.background = fill;
    if (header) {
      headerCells++;
      if (t.bold) headerBold++;
      headerFill ??= fill;
      headerColour ??= t.colour;
    } else {
      if (t.size !== undefined) body.size.set(t.size, (body.size.get(t.size) ?? 0) + 1);
      if (t.family) body.family.set(t.family, (body.family.get(t.family) ?? 0) + 1);
    }
    if ((num(p, 'RotationAngle') ?? 0) !== 0) ctx.rep.add('rotatedCell', 'loss', 'Text turned inside a table cell is set upright: Postext turns whole tables, not cells', t.text.slice(0, 40) || sample);
    if (p.attrs.TopLeftDiagonalLine === 'true' || p.attrs.TopRightDiagonalLine === 'true') ctx.rep.add('diagonalCellLines', 'loss', 'Diagonal lines across a table cell are not drawn', t.text.slice(0, 40) || sample);
    if (cell.paragraphs.some((para) => para.runs.some((r) => r.content.some((i) => i.kind === 'table')))) ctx.rep.add('nestedTable', 'warning', 'A table inside a table cell is set as a table of its own after the outer one', sample);
    if (cell.type === 'graphic') {
      const item = cell.items.find((i) => i.graphic) ?? cell.items[0];
      const id = item?.graphic ? pictureResource(ctx, item) : undefined;
      if (id) out.image = { resourceId: id, width: 1 };
      else ctx.rep.add('emptyGraphicCell', 'info', 'A graphic cell that holds no picture is an empty cell', sample);
    }
    grid[cell.row]![cell.col] = out;
    for (let r = cell.row; r < cell.row + rowSpan; r++) for (let c = cell.col; c < cell.col + colSpan; c++) if (r !== cell.row || c !== cell.col) grid[r]![c] = { content: '', hiddenBy: { row: cell.row, col: cell.col } };
  }
  const model: TableModel = { rows: grid.map((row, r) => row.map((c) => c ?? (r < table.headerRows ? { content: '', isHeader: true } : { content: '' }))) };
  if (table.headerRows > 0) model.headerRowCount = Math.min(table.headerRows, rows);
  if (table.footerRows > 0) ctx.rep.add('tableFooterRows', 'warning', 'Footer rows of a table are set as its last rows: Postext repeats header rows only', sample, table.footerRows);
  const widths = table.columns.map((c) => c.width);
  if (widths.length === cols && widths.every((w) => w > 0)) {
    const min = Math.min(...widths);
    model.columnWidths = widths.map((w) => Math.round((w / min) * 1000) / 1000);
  }

  // The look as a named style, shared by the tables that look alike.
  const tp = mergeProps(computeStyle(ctx.doc, 'table', table.tableStyle), { attrs: table.attrs, properties: table.properties });
  const top = (m: Map<number | string, number>): number | string | undefined => [...m.entries()].sort((a, b) => b[1] - a[1])[0]?.[0];
  const size = top(body.size) as number | undefined;
  const family = top(body.family) as string | undefined;
  const border = num(tp, 'TopBorderStrokeWeight') ?? 0;
  const borderColour = border > 0 ? ctx.palette.colour(tp.attrs.TopBorderStrokeColor, num(tp, 'TopBorderStrokeTint'), 'table border') : undefined;
  const named = table.tableStyle ? ctx.doc.styles.table.get(table.tableStyle) : undefined;
  const key = [named && !named.root ? named.self : '', size ?? '', family ?? '', border, borderColour?.hex ?? '', headerFill?.hex ?? '', headerCells ? headerBold * 2 >= headerCells : ''].join('|');
  let store = stores.get(ctx);
  if (!store) stores.set(ctx, (store = { byKey: new Map(), list: [] }));
  let styleId = store.byKey.get(key);
  if (!styleId) {
    const isNamed = named && !named.root && !/^\[/.test(named.name);
    styleId = ctx.styleIds.take(idOf(isNamed ? named.name : 'table', 'table'));
    const style: NamedTableStyleConfig = { id: styleId, name: isNamed ? named.name : 'Table', borders: border > 0, headerBold: headerCells > 0 && headerBold * 2 >= headerCells, headerBackgroundEnabled: !!headerFill };
    if (size !== undefined) style.bodyFontSize = style.headerFontSize = pt(size);
    if (family) style.bodyFontFamily = style.headerFontFamily = family;
    if (borderColour) style.borderColor = borderColour;
    if (border > 0) style.borderWidth = pt(border);
    if (headerFill) style.headerBackground = headerFill;
    if (headerColour) style.headerColor = headerColour;
    store.byKey.set(key, styleId);
    store.list.push(style);
  }
  const id = ctx.resourceIds.take('table');
  const total = widths.reduce((a, b) => a + b, 0);
  const resource: Resource = { id, typeId: 'grid', kind: 'table', createdAt: 0, updatedAt: 0, table: { model, styleId }, placement: { position: 'here', span: 'column', align: 'left', ...(total > 0 ? { width: pt(total) } : {}) } };
  if (notes.length) resource.note = notes.map((n, k) => `^${k + 1}^ ${n}`).join(' \\\\ ');
  ctx.resources.push(resource);
  return id;
}
