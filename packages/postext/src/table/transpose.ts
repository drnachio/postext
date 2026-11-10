// Transposition of a table model: rows become columns.
import type { TableCell, TableModel } from '../types.js';
import { cloneCell, cloneRows, columnCount, makeEmptyCell } from './model.js';

/**
 * Swap rows and columns: the cell at row `r`, column `c` moves to row `c`,
 * column `r`, its content, image, fill and alignment with it. A merge keeps
 * its cells, its spans swapped (a cell two columns wide becomes two rows
 * tall). The header follows the cells: the header rows become header
 * columns, and the leading columns whose cells are all headers become the
 * header rows (`headerRowCount`). Column weights describe columns that no
 * longer exist, so they are dropped. Ragged rows are padded with empty
 * cells first. Transposing twice gives the table back (but its weights).
 */
export const transposeTable = (m: TableModel): TableModel => {
  const cols = columnCount(m);
  const source = cloneRows(m).map((row) => {
    while (row.length < cols) row.push(makeEmptyCell());
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
  while (header < rows.length && rows[header]!.length > 0 && rows[header]!.every((cell) => cell.isHeader === true)) header++;
  const next: TableModel = { rows };
  if (header > 0) next.headerRowCount = header;
  return next;
};
