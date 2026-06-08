import type {
  TableCell,
  TableCellAlign,
  TableCellVerticalAlign,
  TableCellPos,
  TableModel,
} from '../types';

/** Position of a cell within the grid (zero-based row/column). */
export type CellPos = TableCellPos;

/** An inclusive rectangular range of cells, defined by two corners. */
export interface CellRange {
  start: CellPos;
  end: CellPos;
}

/** Horizontal alignment of a cell's content. */
export type Align = TableCellAlign;

/** Vertical alignment of a cell's content. */
export type VAlign = TableCellVerticalAlign;

// ---------------------------------------------------------------------------
// Internal helpers (all pure)
// ---------------------------------------------------------------------------

/** Number of columns in the model (taken from the widest row). */
const columnCount = (m: TableModel): number =>
  m.rows.reduce((max, row) => Math.max(max, row.length), 0);

const makeEmptyCell = (isHeader?: boolean): TableCell =>
  isHeader ? { content: '', isHeader: true } : { content: '' };

/** Shallow-clone a single cell, returning a brand-new object. */
const cloneCell = (cell: TableCell): TableCell => {
  const next: TableCell = { content: cell.content };
  if (cell.colSpan !== undefined) next.colSpan = cell.colSpan;
  if (cell.rowSpan !== undefined) next.rowSpan = cell.rowSpan;
  if (cell.isHeader !== undefined) next.isHeader = cell.isHeader;
  if (cell.align !== undefined) next.align = cell.align;
  if (cell.verticalAlign !== undefined) next.verticalAlign = cell.verticalAlign;
  if (cell.hiddenBy !== undefined) {
    next.hiddenBy = { row: cell.hiddenBy.row, col: cell.hiddenBy.col };
  }
  return next;
};

/** Deep-clone the grid so callers may mutate the copy before returning it. */
const cloneRows = (m: TableModel): TableCell[][] =>
  m.rows.map((row) => row.map(cloneCell));

/** Build a new model from a (freshly produced) grid, preserving extra fields. */
const withRows = (m: TableModel, rows: TableCell[][]): TableModel => {
  const next: TableModel = { rows };
  if (m.headerRowCount !== undefined) next.headerRowCount = m.headerRowCount;
  return next;
};

const inBounds = (rows: TableCell[][], pos: CellPos): boolean =>
  pos.row >= 0 &&
  pos.row < rows.length &&
  pos.col >= 0 &&
  pos.col < (rows[pos.row]?.length ?? 0);

/** Normalize a range so `start` is the top-left and `end` the bottom-right. */
const normalizeRange = (range: CellRange): CellRange => ({
  start: {
    row: Math.min(range.start.row, range.end.row),
    col: Math.min(range.start.col, range.end.col),
  },
  end: {
    row: Math.max(range.start.row, range.end.row),
    col: Math.max(range.start.col, range.end.col),
  },
});

const samePos = (a: CellPos, b: CellPos): boolean =>
  a.row === b.row && a.col === b.col;

// ---------------------------------------------------------------------------
// Row / column structure
// ---------------------------------------------------------------------------

/**
 * Insert a new (empty) row. `at` is the index the new row will occupy; it is
 * clamped to `[0, rowCount]`, so `at >= rowCount` appends.
 */
export const addRow = (m: TableModel, at: number): TableModel => {
  const rows = cloneRows(m);
  const cols = columnCount(m);
  const index = Math.max(0, Math.min(at, rows.length));
  const isHeaderRow =
    m.headerRowCount !== undefined && index < m.headerRowCount;
  const newRow: TableCell[] = Array.from({ length: cols }, () =>
    makeEmptyCell(isHeaderRow),
  );
  rows.splice(index, 0, newRow);

  const next = withRows(m, rows);
  if (m.headerRowCount !== undefined && index < m.headerRowCount) {
    next.headerRowCount = m.headerRowCount + 1;
  }
  return next;
};

/**
 * Insert a new (empty) column. `at` is the index the new column will occupy in
 * every row; it is clamped to `[0, columnCount]`.
 */
export const addColumn = (m: TableModel, at: number): TableModel => {
  const cols = columnCount(m);
  const index = Math.max(0, Math.min(at, cols));
  const rows = cloneRows(m).map((row, rowIndex) => {
    const isHeaderRow =
      m.headerRowCount !== undefined && rowIndex < m.headerRowCount;
    const insertAt = Math.min(index, row.length);
    row.splice(insertAt, 0, makeEmptyCell(isHeaderRow));
    return row;
  });
  return withRows(m, rows);
};

/** Remove the row at `at`. Out-of-range indices leave the model unchanged. */
export const removeRow = (m: TableModel, at: number): TableModel => {
  if (at < 0 || at >= m.rows.length) return withRows(m, cloneRows(m));
  const rows = cloneRows(m);
  rows.splice(at, 1);

  const next = withRows(m, rows);
  if (m.headerRowCount !== undefined && at < m.headerRowCount) {
    next.headerRowCount = Math.max(0, m.headerRowCount - 1);
  }
  return next;
};

/** Remove the column at `at`. Out-of-range indices leave the model unchanged. */
export const removeColumn = (m: TableModel, at: number): TableModel => {
  if (at < 0 || at >= columnCount(m)) return withRows(m, cloneRows(m));
  const rows = cloneRows(m).map((row) => {
    if (at < row.length) row.splice(at, 1);
    return row;
  });
  return withRows(m, rows);
};

// ---------------------------------------------------------------------------
// Cell content / alignment
// ---------------------------------------------------------------------------

/** Replace the textual content of the cell at `at`. */
export const setCellContent = (
  m: TableModel,
  at: CellPos,
  content: string,
): TableModel => {
  const rows = cloneRows(m);
  if (!inBounds(rows, at)) return withRows(m, rows);
  rows[at.row][at.col] = { ...rows[at.row][at.col], content };
  return withRows(m, rows);
};

/**
 * Set (or clear) horizontal / vertical alignment for the cell at `at`. Passing
 * `undefined` for either argument removes that alignment.
 */
export const setAlignment = (
  m: TableModel,
  at: CellPos,
  align?: Align,
  vAlign?: VAlign,
): TableModel => {
  const rows = cloneRows(m);
  if (!inBounds(rows, at)) return withRows(m, rows);
  const cell = cloneCell(rows[at.row][at.col]);
  if (align === undefined) delete cell.align;
  else cell.align = align;
  if (vAlign === undefined) delete cell.verticalAlign;
  else cell.verticalAlign = vAlign;
  rows[at.row][at.col] = cell;
  return withRows(m, rows);
};

// ---------------------------------------------------------------------------
// Merging
// ---------------------------------------------------------------------------

/**
 * Merge every cell in `range` into the top-left (primary) cell. The primary
 * cell receives the appropriate `colSpan`/`rowSpan`; the remaining cells are
 * marked `hiddenBy` the primary position so renderers can skip them. The
 * primary cell's content is preserved. A 1x1 range is a no-op.
 */
export const mergeCells = (m: TableModel, range: CellRange): TableModel => {
  const rows = cloneRows(m);
  const { start, end } = normalizeRange(range);
  if (!inBounds(rows, start) || !inBounds(rows, end)) {
    return withRows(m, rows);
  }

  const rowSpan = end.row - start.row + 1;
  const colSpan = end.col - start.col + 1;
  if (rowSpan === 1 && colSpan === 1) return withRows(m, rows);

  const primaryPos: CellPos = { row: start.row, col: start.col };

  for (let r = start.row; r <= end.row; r++) {
    for (let c = start.col; c <= end.col; c++) {
      if (c >= rows[r].length) continue;
      const pos: CellPos = { row: r, col: c };
      if (samePos(pos, primaryPos)) {
        const primary = cloneCell(rows[r][c]);
        if (colSpan > 1) primary.colSpan = colSpan;
        else delete primary.colSpan;
        if (rowSpan > 1) primary.rowSpan = rowSpan;
        else delete primary.rowSpan;
        delete primary.hiddenBy;
        rows[r][c] = primary;
      } else {
        const hidden = cloneCell(rows[r][c]);
        hidden.hiddenBy = { row: primaryPos.row, col: primaryPos.col };
        delete hidden.colSpan;
        delete hidden.rowSpan;
        rows[r][c] = hidden;
      }
    }
  }

  return withRows(m, rows);
};

/**
 * Undo a merge. `at` may be the primary cell of a merge or any cell hidden by
 * one. The primary cell's spans are cleared and all covered cells have their
 * `hiddenBy` markers removed. A non-merged cell is left unchanged.
 */
export const unmergeCell = (m: TableModel, at: CellPos): TableModel => {
  const rows = cloneRows(m);
  if (!inBounds(rows, at)) return withRows(m, rows);

  const cell = rows[at.row][at.col];
  const primaryPos: CellPos = cell.hiddenBy
    ? { row: cell.hiddenBy.row, col: cell.hiddenBy.col }
    : { row: at.row, col: at.col };
  if (!inBounds(rows, primaryPos)) return withRows(m, rows);

  const primary = rows[primaryPos.row][primaryPos.col];
  const colSpan = primary.colSpan ?? 1;
  const rowSpan = primary.rowSpan ?? 1;
  if (colSpan === 1 && rowSpan === 1) return withRows(m, rows);

  const cleared = cloneCell(primary);
  delete cleared.colSpan;
  delete cleared.rowSpan;
  rows[primaryPos.row][primaryPos.col] = cleared;

  for (let r = primaryPos.row; r < primaryPos.row + rowSpan; r++) {
    for (let c = primaryPos.col; c < primaryPos.col + colSpan; c++) {
      if (r >= rows.length || c >= rows[r].length) continue;
      if (samePos({ row: r, col: c }, primaryPos)) continue;
      const covered = rows[r][c];
      if (covered.hiddenBy && samePos(covered.hiddenBy, primaryPos)) {
        const restored = cloneCell(covered);
        delete restored.hiddenBy;
        rows[r][c] = restored;
      }
    }
  }

  return withRows(m, rows);
};

// ---------------------------------------------------------------------------
// Parsing
// ---------------------------------------------------------------------------

/**
 * Build a {@link TableModel} from tab-separated text. Rows are split on
 * newlines (CRLF / CR / LF), cells on tabs. Shorter rows are padded with empty
 * cells so the grid is rectangular. Empty input yields an empty model.
 */
export const parseTSV = (input: string): TableModel => {
  const text = input.replace(/\r\n?/g, '\n');
  const lines = text.split('\n');
  // Drop a single trailing empty line (common with trailing newline) but keep
  // intentional blank rows in the middle.
  if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop();

  if (lines.length === 0 || (lines.length === 1 && lines[0] === '')) {
    return { rows: [] };
  }

  const grid = lines.map((line) => line.split('\t'));
  const cols = grid.reduce((max, row) => Math.max(max, row.length), 0);

  const rows: TableCell[][] = grid.map((row) =>
    Array.from({ length: cols }, (_unused, c) => ({
      content: row[c] ?? '',
    })),
  );

  return { rows };
};
