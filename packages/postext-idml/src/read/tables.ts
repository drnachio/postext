// A table of a story: `<Table>` holds its rows and columns as empty
// elements (heights and widths) and then its cells, each named by its
// place, `Name="column:row"`. A merged cell is written once, at its top
// left place, with `RowSpan` and `ColumnSpan`; the places it covers are
// not written at all.

import { isElement, localName, num, type XmlElement } from '../xml/read.js';
import type { IdmlCell, IdmlParagraph, IdmlTable } from '../model/document.js';
import { isPageItem, pageItemOf } from './items.js';
import { propsOf, refOf } from './props.js';

const count = (el: XmlElement, name: string): number => Math.max(0, Math.round(num(el, name) ?? 0));

function cellOf(el: XmlElement, index: number, paragraphsOf: (cell: XmlElement) => IdmlParagraph[]): IdmlCell {
  // `Name` is `column:row`; a cell without a readable name keeps the
  // order it was written in, on one row, so nothing is lost.
  const place = /^(\d+):(\d+)$/.exec(el.attrs.Name ?? '');
  const graphic = el.attrs.CellType === 'GraphicTypeCell';
  const style = refOf(el.attrs.AppliedCellStyle);
  const cell: IdmlCell = {
    ...propsOf(el),
    self: el.attrs.Self ?? '',
    col: place ? Number(place[1]) : index,
    row: place ? Number(place[2]) : 0,
    colSpan: Math.max(1, count(el, 'ColumnSpan')),
    rowSpan: Math.max(1, count(el, 'RowSpan')),
    type: graphic ? 'graphic' : 'text',
    // A graphic cell holds a page item and no text.
    paragraphs: graphic ? [] : paragraphsOf(el),
    items: [],
  };
  if (style) cell.cellStyle = style;
  // A graphic cell holds its page item as a child of the cell itself; a
  // text cell's anchored items are inlines of its paragraphs.
  if (graphic) for (const c of el.children) if (isElement(c) && isPageItem(c)) cell.items.push(pageItemOf(c));
  return cell;
}

/** One `<Table>`. `paragraphsOf` reads a cell's text with the story
 *  walker, so a table in a cell of a table is read the same way. */
export function tableOf(el: XmlElement, paragraphsOf: (cell: XmlElement) => IdmlParagraph[]): IdmlTable {
  const rows: IdmlTable['rows'] = [];
  const columns: IdmlTable['columns'] = [];
  const cells: IdmlCell[] = [];
  for (const c of el.children) {
    if (!isElement(c)) continue;
    const name = localName(c.name);
    if (name === 'Row') {
      const min = num(c, 'MinimumHeight');
      rows.push({ height: num(c, 'SingleRowHeight') ?? 0, ...(min !== undefined ? { minHeight: min } : {}), autoGrow: c.attrs.AutoGrow !== 'false', props: propsOf(c) });
    } else if (name === 'Column') columns.push({ width: num(c, 'SingleColumnWidth') ?? 0, props: propsOf(c) });
    else if (name === 'Cell') cells.push(cellOf(c, cells.length, paragraphsOf));
  }
  const headerRows = count(el, 'HeaderRowCount');
  const footerRows = count(el, 'FooterRowCount');
  const style = refOf(el.attrs.AppliedTableStyle);
  const table: IdmlTable = {
    ...propsOf(el),
    self: el.attrs.Self ?? '',
    headerRows,
    footerRows,
    // Written by InDesign; counted from the rows when it is not.
    bodyRows: num(el, 'BodyRowCount') !== undefined ? count(el, 'BodyRowCount') : Math.max(0, rows.length - headerRows - footerRows),
    columns,
    rows,
    cells,
  };
  if (style) table.tableStyle = style;
  return table;
}

/** The cell that covers a place of the table, a merged one included. */
export function cellAt(table: IdmlTable, col: number, row: number): IdmlCell | undefined {
  for (const c of table.cells) if (col >= c.col && col < c.col + c.colSpan && row >= c.row && row < c.row + c.rowSpan) return c;
  return undefined;
}

/** Which band of the table a row stands in. */
export function rowBand(table: IdmlTable, row: number): 'header' | 'body' | 'footer' {
  if (row < table.headerRows) return 'header';
  return row >= table.rows.length - table.footerRows && table.footerRows > 0 ? 'footer' : 'body';
}
