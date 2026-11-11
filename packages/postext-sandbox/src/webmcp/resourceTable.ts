// The table of a table resource, built from what a tool was handed: plain
// rows, tab-separated text, or the cells with their formatting. Every edit
// goes through the functions the table editor uses, so the model a tool
// writes is one the editor could have made.

import {
  addColumn,
  addRow,
  mergeCells,
  parseTSV,
  removeColumn,
  removeRow,
  transposeTable,
  type ColorPaletteEntry,
  type ColorValue,
  type Resource,
  type TableCell,
  type TableCellPos,
  type TableModel,
} from 'postext';
import { setHeaderRows, toggleHeaderColumn } from '../panels/resources/TableEditor/headerCells.js';
import { tableWithDirection, tableWithStyle } from '../panels/resources/resourceEdits.js';
import { ToolError, type JsonSchema } from './modelContext.js';

type Table = NonNullable<Resource['table']>;

/** A cell as a tool hands it over: a `TableCell`, with the fill also as a
 *  bare hex colour. */
export interface CellInput {
  content?: string;
  isHeader?: boolean;
  colSpan?: number;
  rowSpan?: number;
  align?: TableCell['align'];
  verticalAlign?: TableCell['verticalAlign'];
  background?: string | Partial<ColorValue>;
  image?: { resourceId: string; width?: number };
  hiddenBy?: TableCellPos;
}

/** The `table` parameter of the resource tool. */
export interface TableInput {
  rows?: string[][];
  tsv?: string;
  cells?: CellInput[][];
  headerRows?: number;
  headerColumns?: number;
  transpose?: boolean;
  columnWidths?: number[] | null;
  style?: string | null;
  direction?: 'ltr' | 'rtl' | null;
}

const POSITION_SCHEMA: JsonSchema = {
  type: 'object',
  properties: { row: { type: 'integer', minimum: 0 }, col: { type: 'integer', minimum: 0 } },
  required: ['row', 'col'],
  additionalProperties: false,
};

const CELL_SCHEMA: JsonSchema = {
  type: 'object',
  properties: {
    content: { type: 'string', description: 'The cell\'s text (Markdown inline marks allowed; a newline or \\\\ starts a new paragraph).' },
    isHeader: { type: 'boolean', description: 'A header cell: of a header row, or of a header column.' },
    colSpan: { type: 'integer', minimum: 1, description: 'Columns this cell takes, merged to its right. The cells it covers stay in their rows (they are hidden).' },
    rowSpan: { type: 'integer', minimum: 1, description: 'Rows this cell takes, merged downwards.' },
    align: { type: 'string', enum: ['left', 'center', 'right', 'start', 'end'] },
    verticalAlign: { type: 'string', enum: ['top', 'middle', 'bottom'] },
    background: { type: ['string', 'object'], description: 'The cell\'s fill: a hex colour ("#f4e9d8"), or { hex, model, paletteId } as the design stores a colour; { paletteId } alone follows that colour of the palette, and { paletteId, tint: 15 } paints it at 15 % (a CMYK or spot entry stays on its inks); overprint: true makes the fill overprint in a print render.' },
    image: {
      type: 'object',
      description: 'A picture set in the cell above its text: a bitmap or SVG resource of the book.',
      properties: {
        resourceId: { type: 'string' },
        width: { type: 'number', description: 'The share of the cell\'s inner width it takes, above 0 and up to 1 (default 1).' },
      },
      required: ['resourceId'],
      additionalProperties: false,
    },
    hiddenBy: { ...POSITION_SCHEMA, description: 'As read back from a merged table: the merged cell (row and col from 0) that covers this one. It may be left out; colSpan and rowSpan decide.' },
  },
  additionalProperties: false,
};

export const TABLE_SCHEMA: JsonSchema = {
  type: 'object',
  description: 'A table. Its content as rows of cell texts, as tsv text, or as cells (the rows of cell objects sandbox_list_resources gives for a table under resource.table.model.rows, which is the way to set formatting: merges, header cells, alignment, fills, pictures). rows and tsv on a table that exists change its texts and its size and keep the formatting of the cells that stay; cells restates the table. Without content, the other members change the table as it is.',
  properties: {
    rows: { type: 'array', description: 'Rows of cell texts (Markdown inline marks allowed).', items: { type: 'array', items: { type: 'string' } } },
    tsv: { type: 'string', description: 'Tab-separated values, one row per line.' },
    cells: { type: 'array', description: 'Rows of cells, every row with a cell for every column.', items: { type: 'array', items: CELL_SCHEMA } },
    headerRows: { type: 'integer', minimum: 0, description: 'Rows at the top that are headers, repeated when the table continues on another page. A new table from rows or tsv has 1; one from cells, its leading rows of header cells.' },
    headerColumns: { type: 'integer', minimum: 0, description: 'Columns at the start whose cells are headers; the cells of the other columns then are not (header rows aside).' },
    transpose: { type: 'boolean', description: 'true: swap the table\'s rows and columns, as the table editor\'s Transpose button does, after its content and headerRows are set. Each cell moves with its text and formatting, merges swap their spans, header rows become header columns and the leading header columns become header rows; the column widths are dropped. headerColumns and columnWidths then apply to the transposed table.' },
    columnWidths: { type: ['array', 'null'], description: 'Relative widths, one per column ([2, 1, 1] gives the first column half the table). null: equal widths.', items: { type: 'number' } },
    style: { type: ['string', 'null'], description: 'The id of one of the book\'s named table styles (the tableStyles setting). null: the document\'s table style.' },
    direction: { type: ['string', 'null'], enum: ['ltr', 'rtl', null], description: 'The direction the table runs in when it is not the document\'s. null: with the document.' },
  },
  additionalProperties: false,
};

/** What a table is checked against: the pictures a cell may show, the
 *  named table styles, the palette a fill may follow. */
export interface TableContext {
  imageIds: ReadonlySet<string>;
  styleIds: readonly string[];
  palette: readonly ColorPaletteEntry[];
}

/** Whether `input` carries the content of a table. */
export function hasTableContent(input: TableInput): boolean {
  return input.rows !== undefined || input.tsv !== undefined || input.cells !== undefined;
}

const HEX_RE = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;
const COLOR_MODELS: readonly string[] = ['hex', 'rgb', 'cmyk', 'hsl', 'spot'];

function fillOf(value: string | Partial<ColorValue>, at: string, palette: readonly ColorPaletteEntry[]): ColorValue {
  const given: Partial<ColorValue> = typeof value === 'string' ? { hex: value } : value;
  const entry = given.paletteId !== undefined ? palette.find((p) => p.id === given.paletteId) : undefined;
  if (given.paletteId !== undefined && !entry) {
    throw new ToolError(`${at}.background follows the palette colour ${JSON.stringify(given.paletteId)}, which the book's palette does not have. Its colours: ${palette.map((p) => p.id).join(', ') || 'none'}.`);
  }
  const hex = given.hex ?? entry?.value.hex;
  if (typeof hex !== 'string' || !HEX_RE.test(hex)) throw new ToolError(`${at}.background needs a hex colour such as "#f4e9d8"${typeof hex === 'string' ? `, not ${JSON.stringify(hex)}` : ''}.`);
  const model = given.model ?? entry?.value.model ?? 'hex';
  if (!COLOR_MODELS.includes(model)) throw new ToolError(`${at}.background.model must be one of ${COLOR_MODELS.join(', ')}.`);
  const tint = given.tint;
  if (tint !== undefined && (typeof tint !== 'number' || !Number.isFinite(tint) || tint < 0 || tint > 100 || given.paletteId === undefined)) {
    throw new ToolError(`${at}.background.tint is the strength of the palette entry it follows (paletteId), a number from 0 to 100.`);
  }
  // A tint and overprint (#1471) travel with the fill; a spot ink too.
  return {
    hex, model,
    ...(given.cmyk ? { cmyk: given.cmyk } : {}),
    ...(given.spot ? { spot: given.spot } : {}),
    ...(given.paletteId !== undefined ? { paletteId: given.paletteId } : {}),
    ...(tint !== undefined && tint < 100 ? { tint } : {}),
    ...(given.overprint === true ? { overprint: true } : {}),
  };
}

/** One cell as the model stores it, without its merge (`colSpan`,
 *  `rowSpan` and `hiddenBy` are laid on by {@link mergeCells}). */
function plainCell(input: CellInput, at: string, context: TableContext): TableCell {
  const cell: TableCell = { content: input.content ?? '' };
  if (input.isHeader) cell.isHeader = true;
  if (input.align !== undefined) cell.align = input.align;
  if (input.verticalAlign !== undefined) cell.verticalAlign = input.verticalAlign;
  if (input.background !== undefined) cell.background = fillOf(input.background, at, context.palette);
  if (input.image !== undefined) {
    const { resourceId, width } = input.image;
    if (!context.imageIds.has(resourceId)) {
      throw new ToolError(`${at}.image names ${JSON.stringify(resourceId)}, which is not a bitmap or SVG resource of the book. The pictures: ${[...context.imageIds].join(', ') || 'none'}.`);
    }
    if (width !== undefined && !(width > 0 && width <= 1)) throw new ToolError(`${at}.image.width is a share of the cell's width, above 0 and up to 1, not ${width}.`);
    // The full width is the default and is not stored.
    cell.image = width !== undefined && width < 1 ? { resourceId, width } : { resourceId };
  }
  return cell;
}

/** The model of `cells`: a rectangular grid whose merges are laid on with
 *  the editor's merge, so every covered cell is hidden by its merged cell.
 *  Refuses a grid the editor could not have made, naming the cell. */
function modelFromCells(cells: CellInput[][], context: TableContext): TableModel {
  if (cells.length === 0 || cells[0]!.length === 0) throw new ToolError('The table has no cells.');
  const columns = cells[0]!.length;
  cells.forEach((row, r) => {
    if (row.length !== columns) {
      throw new ToolError(`table.cells: row ${r} has ${row.length} cell(s) and row 0 has ${columns}. Every row needs a cell for every column; a cell under a merge stays in its row (the merged cell's colSpan and rowSpan hide it).`);
    }
  });
  let model: TableModel = { rows: cells.map((row, r) => row.map((cell, c) => plainCell(cell, `table.cells[${r}][${c}]`, context))) };
  /** Position → the merged cell that covers it. */
  const owner = new Map<string, TableCellPos>();
  const key = (r: number, c: number): string => `${r}:${c}`;
  cells.forEach((row, r) => row.forEach((cell, c) => {
    const rowSpan = cell.rowSpan ?? 1;
    const colSpan = cell.colSpan ?? 1;
    if (rowSpan === 1 && colSpan === 1) return;
    const at = `table.cells[${r}][${c}]`;
    const over = owner.get(key(r, c));
    if (over) throw new ToolError(`${at} spans other cells, but it lies under the merge of table.cells[${over.row}][${over.col}]. A covered cell takes no colSpan or rowSpan.`);
    if (c + colSpan > columns) throw new ToolError(`${at}: a colSpan of ${colSpan} runs past the last column (the table has ${columns}).`);
    if (r + rowSpan > cells.length) throw new ToolError(`${at}: a rowSpan of ${rowSpan} runs past the last row (the table has ${cells.length}).`);
    for (let rr = r; rr < r + rowSpan; rr++) {
      for (let cc = c; cc < c + colSpan; cc++) {
        if (rr === r && cc === c) continue;
        const other = owner.get(key(rr, cc));
        if (other) throw new ToolError(`${at}: its merge overlaps the merge of table.cells[${other.row}][${other.col}] at table.cells[${rr}][${cc}].`);
        owner.set(key(rr, cc), { row: r, col: c });
      }
    }
    model = mergeCells(model, { start: { row: r, col: c }, end: { row: r + rowSpan - 1, col: c + colSpan - 1 } });
  }));
  cells.forEach((row, r) => row.forEach((cell, c) => {
    if (!cell.hiddenBy) return;
    const over = owner.get(key(r, c));
    if (!over || over.row !== cell.hiddenBy.row || over.col !== cell.hiddenBy.col) {
      throw new ToolError(`table.cells[${r}][${c}].hiddenBy names table.cells[${cell.hiddenBy.row}][${cell.hiddenBy.col}], whose colSpan and rowSpan do not reach it. Leave hiddenBy out: the merged cell's spans decide what it covers.`);
    }
  }));
  return model;
}

/** The texts of `rows` as a rectangle: short rows padded with empty cells. */
function rectangle(rows: string[][]): string[][] {
  const columns = Math.max(0, ...rows.map((r) => r.length));
  if (rows.length === 0 || columns === 0) throw new ToolError('The table has no cells.');
  return rows.map((row) => Array.from({ length: columns }, (_, c) => row[c] ?? ''));
}

/** `model` brought to the size of `texts` with the editor's row and column
 *  edits (rows and columns added or taken at the end, merges kept in step),
 *  then every cell given its text: the formatting of the cells that stay
 *  is theirs still. */
function retexted(model: TableModel, texts: string[][]): TableModel {
  const columns = texts[0]!.length;
  const width = (m: TableModel): number => m.rows.reduce((max, row) => Math.max(max, row.length), 0);
  // A grid with short rows is squared first, so every position has a cell.
  let next: TableModel = { ...model, rows: model.rows.map((row) => [...row, ...Array.from({ length: width(model) - row.length }, (): TableCell => ({ content: '' }))]) };
  while (next.rows.length < texts.length) next = addRow(next, next.rows.length);
  while (next.rows.length > texts.length) next = removeRow(next, next.rows.length - 1);
  while (width(next) < columns) next = addColumn(next, width(next));
  while (width(next) > columns) next = removeColumn(next, width(next) - 1);
  return { ...next, rows: next.rows.map((row, r) => row.map((cell, c) => ({ ...cell, content: texts[r]![c]! }))) };
}

/** How many leading rows of `model` are made of header cells only. */
function leadingHeaderRows(model: TableModel): number {
  let count = 0;
  while (count < model.rows.length && model.rows[count]!.every((cell) => cell.isHeader === true)) count++;
  return count;
}

/**
 * The table `input` describes: a new one, or `existing` changed. Throws a
 * {@link ToolError} that says what to correct.
 */
export function buildTable(input: TableInput, existing: Table | undefined, context: TableContext): Table {
  const given = [input.rows, input.tsv, input.cells].filter((c) => c !== undefined).length;
  if (given > 1) throw new ToolError('A table takes one of "rows", "tsv" or "cells".');
  const before = existing && existing.model.rows.length > 0 ? existing.model : undefined;
  let model: TableModel;
  if (input.cells !== undefined) {
    model = modelFromCells(input.cells, context);
    const columns = model.rows[0]!.length;
    if (input.headerRows !== undefined) {
      const count = Math.min(input.headerRows, model.rows.length);
      // The cells of a header row are header cells; the others keep theirs.
      model = { rows: model.rows.map((row, r) => (r < count ? row.map((cell) => ({ ...cell, isHeader: true })) : row)), headerRowCount: count };
    } else if (before) {
      if (before.headerRowCount !== undefined) model.headerRowCount = Math.min(before.headerRowCount, model.rows.length);
    } else model.headerRowCount = leadingHeaderRows(model);
    if (input.columnWidths === undefined && before?.columnWidths?.length === columns) model.columnWidths = [...before.columnWidths];
  } else if (input.rows !== undefined || input.tsv !== undefined) {
    const texts = rectangle(input.tsv !== undefined ? parseTSV(input.tsv).rows.map((row) => row.map((cell) => cell.content)) : input.rows!);
    if (before) {
      model = retexted(before, texts);
      if (input.headerRows !== undefined && input.headerRows !== (model.headerRowCount ?? 0)) model = setHeaderRows(model, input.headerRows);
    } else {
      model = setHeaderRows({ rows: texts.map((row) => row.map((content): TableCell => ({ content }))) }, input.headerRows ?? 1);
    }
  } else {
    if (!before) throw new ToolError('A table needs "rows", "tsv" or "cells".');
    model = before;
    if (input.headerRows !== undefined && input.headerRows !== (model.headerRowCount ?? 0)) model = setHeaderRows(model, input.headerRows);
  }
  if (input.transpose) model = transposeTable(model);
  const columns = model.rows.reduce((max, row) => Math.max(max, row.length), 0);
  if (input.headerColumns !== undefined) {
    for (let c = 0; c < columns; c++) model = toggleHeaderColumn(model, c, c < input.headerColumns);
  }
  if (input.columnWidths === null) {
    model = { ...model };
    delete model.columnWidths;
  } else if (input.columnWidths !== undefined) {
    const widths = input.columnWidths;
    if (widths.length !== columns) throw new ToolError(`table.columnWidths has ${widths.length} width(s) and the table ${columns} column(s): give one per column, or null for equal widths.`);
    const bad = widths.findIndex((w) => !Number.isFinite(w) || w <= 0);
    if (bad >= 0) throw new ToolError(`table.columnWidths[${bad}] must be a number above 0, not ${widths[bad]}.`);
    model = { ...model, columnWidths: [...widths] };
  }

  let table: Table = { ...(existing?.styleId ? { styleId: existing.styleId } : {}), ...(existing?.direction ? { direction: existing.direction } : {}), model };
  if (input.style !== undefined) {
    if (input.style !== null && !context.styleIds.includes(input.style)) {
      throw new ToolError(`No table style ${JSON.stringify(input.style)}. The book's named table styles: ${context.styleIds.join(', ') || 'none (add one under the tableStyles setting with sandbox_set_config)'}; null sets the table in the document's table style.`);
    }
    table = tableWithStyle({ table }, input.style ?? undefined);
  }
  if (input.direction !== undefined) table = tableWithDirection({ table }, input.direction ?? undefined);
  return table;
}
