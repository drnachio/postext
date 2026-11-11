// Transposition of a table model: rows become columns.
import type { TableCell, TableModel } from '../types.js';
import { cloneCell, cloneRows, columnCount, makeEmptyCell } from './model.js';

/** Whether every cell of `row` that shows (not covered by a merge) is a
 *  header cell. */
const allHeaders = (row: readonly TableCell[]): boolean =>
  row.length > 0 && row.every((cell) => cell.hiddenBy !== undefined || cell.isHeader === true);

/**
 * Swap rows and columns: the cell at row `r`, column `c` moves to row `c`,
 * column `r`, its content, image, fill and alignment with it. A merge keeps
 * its cells, its spans swapped (a cell two columns wide becomes two rows
 * tall).
 *
 * The header follows the cells. The header rows become header columns: a
 * row counted by `headerRowCount` whose cells do not say `isHeader` (as a
 * Word import leaves them) is a header row all the same, and its cells are
 * marked `isHeader` once they stand in a column. The leading columns whose
 * cells are all headers become the header rows (`headerRowCount`).
 *
 * Column weights describe columns that no longer exist, so they are
 * dropped. Ragged rows are padded with empty cells first. Transposing twice
 * gives the table back, except for its weights, and with the cells of its
 * header rows marked `isHeader`.
 */
export const transposeTable = (m: TableModel): TableModel => {
  const cols = columnCount(m);
  const headerRows = Math.max(0, Math.min(m.headerRowCount ?? 0, m.rows.length));
  const source = cloneRows(m).map((row, r) => {
    while (row.length < cols) row.push(makeEmptyCell(r < headerRows));
    if (r < headerRows) for (const cell of row) cell.isHeader = true;
    return row;
  });
  const rows: TableCell[][] = Array.from({ length: cols }, (_, c) =>
    source.map((row) => {
      const cell = cloneCell(row[c]!);
      const { colSpan, rowSpan } = cell;
      delete cell.colSpan;
      delete cell.rowSpan;
      if (rowSpan !== undefined) cell.colSpan = rowSpan;
      if (colSpan !== undefined) cell.rowSpan = colSpan;
      if (cell.hiddenBy) cell.hiddenBy = { row: cell.hiddenBy.col, col: cell.hiddenBy.row };
      return cell;
    }),
  );
  // The header rows of the transposed table: its leading rows whose cells
  // are all headers (the original's header columns).
  let header = 0;
  while (header < rows.length && allHeaders(rows[header]!)) header++;
  const next: TableModel = { rows };
  if (header > 0) next.headerRowCount = header;
  return next;
};
