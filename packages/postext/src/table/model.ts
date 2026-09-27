import type {
  ColorValue,
  TableCell,
  TableCellAlign,
  TableCellImage,
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

const cloneImage = (image: TableCellImage): TableCellImage =>
  image.width !== undefined
    ? { resourceId: image.resourceId, width: image.width }
    : { resourceId: image.resourceId };

/** Shallow-clone a single cell, returning a brand-new object. */
const cloneCell = (cell: TableCell): TableCell => {
  const next: TableCell = { content: cell.content };
  if (cell.colSpan !== undefined) next.colSpan = cell.colSpan;
  if (cell.rowSpan !== undefined) next.rowSpan = cell.rowSpan;
  if (cell.isHeader !== undefined) next.isHeader = cell.isHeader;
  if (cell.align !== undefined) next.align = cell.align;
  if (cell.verticalAlign !== undefined) next.verticalAlign = cell.verticalAlign;
  if (cell.image !== undefined) next.image = cloneImage(cell.image);
  if (cell.background !== undefined) next.background = { ...cell.background };
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
  if (m.columnWidths !== undefined) next.columnWidths = [...m.columnWidths];
  return next;
};

/** Weight for a freshly inserted column: the mean of the existing weights, so
 *  the new column takes an "average" share whatever scale the author used
 *  (`1` for an empty or absent array). */
const averageWeight = (weights: number[]): number =>
  weights.length > 0 ? weights.reduce((sum, w) => sum + w, 0) / weights.length : 1;

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

/** A merged block of the grid: its primary cell, where it sits and how far
 *  it spans. */
interface Merge {
  row: number;
  col: number;
  rowSpan: number;
  colSpan: number;
  cell: TableCell;
}

/** The merged blocks of `rows`: every primary cell spanning more than one
 *  cell. */
const findMerges = (rows: TableCell[][]): Merge[] => {
  const merges: Merge[] = [];
  rows.forEach((row, r) => row.forEach((cell, c) => {
    if (cell.hiddenBy) return;
    const rowSpan = Math.max(1, cell.rowSpan ?? 1);
    const colSpan = Math.max(1, cell.colSpan ?? 1);
    if (rowSpan > 1 || colSpan > 1) merges.push({ row: r, col: c, rowSpan, colSpan, cell: cloneCell(cell) });
  }));
  return merges;
};

/** Undo `merges` in place: spans dropped from the primaries, `hiddenBy`
 *  from the cells they cover. Cells hidden by anything else are left as
 *  they are. */
const clearMerges = (rows: TableCell[][], merges: readonly Merge[]): void => {
  for (const mg of merges) {
    for (let r = mg.row; r < mg.row + mg.rowSpan && r < rows.length; r++) {
      for (let c = mg.col; c < mg.col + mg.colSpan && c < rows[r].length; c++) {
        const cell = rows[r][c];
        if (r === mg.row && c === mg.col) {
          delete cell.rowSpan;
          delete cell.colSpan;
        } else if (cell.hiddenBy && cell.hiddenBy.row === mg.row && cell.hiddenBy.col === mg.col) {
          delete cell.hiddenBy;
        }
      }
    }
  }
};

/** Lay `merges` onto `rows` in place, as {@link mergeCells} would: each
 *  primary cell at its position with its spans, the other cells of its
 *  block hidden by it. A block reduced to one cell keeps its primary cell
 *  (its content survives) without spans; an empty one is dropped. */
const applyMerges = (rows: TableCell[][], merges: readonly Merge[]): void => {
  for (const mg of merges) {
    if (mg.rowSpan < 1 || mg.colSpan < 1) continue;
    if (mg.row >= rows.length || mg.col >= rows[mg.row].length) continue;
    const primary = cloneCell(mg.cell);
    delete primary.hiddenBy;
    if (mg.colSpan > 1) primary.colSpan = mg.colSpan;
    else delete primary.colSpan;
    if (mg.rowSpan > 1) primary.rowSpan = mg.rowSpan;
    else delete primary.rowSpan;
    rows[mg.row][mg.col] = primary;
    for (let r = mg.row; r < mg.row + mg.rowSpan && r < rows.length; r++) {
      for (let c = mg.col; c < mg.col + mg.colSpan && c < rows[r].length; c++) {
        if (r === mg.row && c === mg.col) continue;
        const hidden = cloneCell(rows[r][c]);
        delete hidden.colSpan;
        delete hidden.rowSpan;
        hidden.hiddenBy = { row: mg.row, col: mg.col };
        rows[r][c] = hidden;
      }
    }
  }
};

/**
 * Apply a structural edit to a grid that may hold merges: the merges are
 * undone, `edit` inserts or removes plain cells, and each merge — moved,
 * grown or shrunk by `move` — is laid back. So a row or column added inside
 * a merged block widens it, one removed shrinks it (a block losing its first
 * row or column keeps its content in the new top-left cell), and every
 * `hiddenBy` keeps pointing at its primary cell. A grid without merges goes
 * through `edit` alone.
 */
const editAcrossMerges = (
  rows: TableCell[][],
  edit: (rows: TableCell[][]) => void,
  move: (mg: Merge) => void,
): TableCell[][] => {
  const merges = findMerges(rows);
  if (merges.length === 0) {
    edit(rows);
    return rows;
  }
  clearMerges(rows, merges);
  edit(rows);
  for (const mg of merges) move(mg);
  applyMerges(rows, merges);
  return rows;
};

/** A merge after an insertion at `at` along one axis: it moves when it lies
 *  at or past `at`, and grows when `at` falls inside it. */
const shiftForInsert = (start: number, span: number, at: number): [number, number] =>
  start >= at ? [start + 1, span] : at < start + span ? [start, span + 1] : [start, span];

/** A merge after the removal of line `at` along one axis: it moves up when
 *  it lies past `at`, and shrinks when `at` falls inside it. */
const shiftForRemove = (start: number, span: number, at: number): [number, number] =>
  start > at ? [start - 1, span] : at < start + span ? [start, span - 1] : [start, span];

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
  editAcrossMerges(rows, (grid) => grid.splice(index, 0, newRow), (mg) => {
    [mg.row, mg.rowSpan] = shiftForInsert(mg.row, mg.rowSpan, index);
  });

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
  const rows = editAcrossMerges(cloneRows(m), (grid) => {
    grid.forEach((row, rowIndex) => {
      const isHeaderRow =
        m.headerRowCount !== undefined && rowIndex < m.headerRowCount;
      const insertAt = Math.min(index, row.length);
      row.splice(insertAt, 0, makeEmptyCell(isHeaderRow));
    });
  }, (mg) => {
    [mg.col, mg.colSpan] = shiftForInsert(mg.col, mg.colSpan, index);
  });
  const next = withRows(m, rows);
  if (next.columnWidths !== undefined) {
    next.columnWidths.splice(index, 0, averageWeight(m.columnWidths ?? []));
  }
  return next;
};

/** Remove the row at `at`. Out-of-range indices leave the model unchanged. */
export const removeRow = (m: TableModel, at: number): TableModel => {
  if (at < 0 || at >= m.rows.length) return withRows(m, cloneRows(m));
  const rows = editAcrossMerges(cloneRows(m), (grid) => grid.splice(at, 1), (mg) => {
    [mg.row, mg.rowSpan] = shiftForRemove(mg.row, mg.rowSpan, at);
  });

  const next = withRows(m, rows);
  if (m.headerRowCount !== undefined && at < m.headerRowCount) {
    next.headerRowCount = Math.max(0, m.headerRowCount - 1);
  }
  return next;
};

/** Remove the column at `at`. Out-of-range indices leave the model unchanged. */
export const removeColumn = (m: TableModel, at: number): TableModel => {
  if (at < 0 || at >= columnCount(m)) return withRows(m, cloneRows(m));
  const rows = editAcrossMerges(cloneRows(m), (grid) => {
    for (const row of grid) if (at < row.length) row.splice(at, 1);
  }, (mg) => {
    [mg.col, mg.colSpan] = shiftForRemove(mg.col, mg.colSpan, at);
  });
  const next = withRows(m, rows);
  if (next.columnWidths !== undefined && at < next.columnWidths.length) {
    next.columnWidths.splice(at, 1);
  }
  return next;
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
 * Set (or clear, with `undefined`) the image embedded in the cell at `at`:
 * a bitmap / SVG resource referenced by id, drawn inside the cell above its
 * content (see {@link TableCellImage}).
 */
export const setCellImage = (
  m: TableModel,
  at: CellPos,
  image: TableCellImage | undefined,
): TableModel => {
  const rows = cloneRows(m);
  if (!inBounds(rows, at)) return withRows(m, rows);
  const cell = cloneCell(rows[at.row][at.col]);
  if (image === undefined) delete cell.image;
  else cell.image = cloneImage(image);
  rows[at.row][at.col] = cell;
  return withRows(m, rows);
};

/**
 * Set (or clear, with `undefined`) the fill colour of the cell at `at`
 * (`TableCell.background`), painted instead of the table style's header /
 * body fill.
 */
export const setCellBackground = (
  m: TableModel,
  at: CellPos,
  background: ColorValue | undefined,
): TableModel => {
  const rows = cloneRows(m);
  if (!inBounds(rows, at)) return withRows(m, rows);
  const cell = cloneCell(rows[at.row][at.col]);
  if (background === undefined) delete cell.background;
  else cell.background = { ...background };
  rows[at.row][at.col] = cell;
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

/** Options of {@link parseTSV}. */
export interface ParseTSVOptions {
  /** Leading rows that form the table header: their cells are marked
   *  `isHeader` and the model gets `headerRowCount` (clamped to the row
   *  count), so a table split across pages repeats them. Default 0 (no
   *  header). */
  headerRows?: number;
}

/**
 * Build a {@link TableModel} from tab-separated text. Rows are split on
 * newlines (CRLF / CR / LF), cells on tabs. Shorter rows are padded with empty
 * cells so the grid is rectangular. Empty input yields an empty model.
 * `options.headerRows` turns the leading rows into header rows.
 */
export const parseTSV = (input: string, options?: ParseTSVOptions): TableModel => {
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
  const requested = Math.floor(options?.headerRows ?? 0);
  const headerRows = Number.isFinite(requested) ? Math.max(0, Math.min(requested, grid.length)) : 0;

  const rows: TableCell[][] = grid.map((row, r) =>
    Array.from({ length: cols }, (_unused, c): TableCell => (
      r < headerRows ? { content: row[c] ?? '', isHeader: true } : { content: row[c] ?? '' }
    )),
  );

  return headerRows > 0 ? { rows, headerRowCount: headerRows } : { rows };
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

/** A place where a table model is not the rectangular grid the layout
 *  expects (see {@link tableGridIssues}). */
export interface TableGridIssue {
  /** `'spanOverlap'`: a visible cell sits under another cell's `colSpan` /
   *  `rowSpan` — the cell a merge covers must stay in its row, marked
   *  `hiddenBy`, or the cells after it shift. `'missingCells'`: a row ends
   *  before the grid's last column with no merge covering the rest, which
   *  leaves a hole. */
  kind: 'spanOverlap' | 'missingCells';
  /** The offending cell (`spanOverlap`), or the first position of the row
   *  with no cell (`missingCells`). */
  row: number;
  col: number;
  /** For `spanOverlap`: the primary cell whose merge covers the position. */
  coveredBy?: CellPos;
}

/**
 * Check that a table model is a rectangular grid once its merges are
 * counted. Cells are laid out by their array index — `rows[r][c]` sits in
 * column `c` — so a model written HTML-style, leaving out the cells a
 * `colSpan` / `rowSpan` covers instead of keeping them with `hiddenBy` (what
 * {@link mergeCells} does), shifts the cells after the merge onto it.
 * Returns the issues in row-major order (at most one `missingCells` per
 * row); an empty list means the grid is sound.
 */
export const tableGridIssues = (m: TableModel): TableGridIssue[] => {
  const issues: TableGridIssue[] = [];
  const cols = columnCount(m);
  /** Position → the primary cell whose merge covers it. */
  const owner = new Map<string, CellPos>();
  const key = (r: number, c: number): string => `${r}:${c}`;
  m.rows.forEach((row, r) => {
    row.forEach((cell, c) => {
      // A covered cell stands in for its position; it claims nothing more.
      if (cell.hiddenBy) return;
      const by = owner.get(key(r, c));
      if (by) issues.push({ kind: 'spanOverlap', row: r, col: c, coveredBy: { row: by.row, col: by.col } });
      const rowSpan = Math.max(1, cell.rowSpan ?? 1);
      const colSpan = Math.max(1, cell.colSpan ?? 1);
      for (let rr = r; rr < Math.min(r + rowSpan, m.rows.length); rr++) {
        for (let cc = c; cc < Math.min(c + colSpan, cols); cc++) {
          if ((rr !== r || cc !== c) && !owner.has(key(rr, cc))) owner.set(key(rr, cc), { row: r, col: c });
        }
      }
    });
    // A position past the row's end that no merge reaches is a hole.
    for (let c = row.length; c < cols; c++) {
      if (owner.has(key(r, c))) continue;
      issues.push({ kind: 'missingCells', row: r, col: c });
      break;
    }
  });
  return issues;
};
