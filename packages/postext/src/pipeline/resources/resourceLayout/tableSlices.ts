// Table rules and column edges, the header rows, and the slices a table is
// cut into across pages and columns (#1276: split out of resourceLayout.ts).
import type { Dimension, TableModel, TableCell } from '../../../types.js';
import { dimensionToPx } from '../../../units.js';
import type { TableSliceSpec, TableRowMetrics } from './input.js';

/** Smallest border thickness (px) we let through: thinner rules would vanish
 *  on screen, but 0.5pt (≈0.67px at 96dpi) hairlines must survive intact —
 *  the previous `max(1, round(px))` rounded them up to a full pixel. */
export const MIN_BORDER_PX = 0.25;

/** A booktabs rule width (px): `0` drops the rule, anything thinner than
 *  {@link MIN_BORDER_PX} is raised to it. `em` is the body cell size. */
export function rulePx(width: Dimension, dpi: number, bodyFontPx: number): number {
  const px = dimensionToPx(width, dpi, bodyFontPx);
  return px > 0 ? Math.max(MIN_BORDER_PX, px) : 0;
}

/**
 * Column x-edges (length = columnCount + 1) for a table model laid out at
 * `columnWidth`. `TableModel.columnWidths` are relative weights, normalised so
 * they always fill the width exactly; a missing array, a wrong length, or any
 * non-positive / non-finite weight falls back to an equal split.
 */
export function computeColumnEdges(model: TableModel, columnWidth: number): number[] {
  const colCount = model.rows.length > 0 ? Math.max(...model.rows.map((r) => r.length)) : 0;
  const weights = model.columnWidths;
  const valid = weights !== undefined
    && weights.length === colCount
    && weights.every((w) => Number.isFinite(w) && w > 0);
  const edges: number[] = [0];
  if (colCount === 0) return edges;
  if (!valid) {
    const colWidth = columnWidth / colCount;
    for (let c = 1; c <= colCount; c++) edges.push(c * colWidth);
    return edges;
  }
  const total = weights.reduce((sum, w) => sum + w, 0);
  let acc = 0;
  for (let c = 0; c < colCount; c++) {
    acc += (weights[c]! / total) * columnWidth;
    edges.push(acc);
  }
  // Snap the last edge so floating-point drift never leaves a sliver.
  edges[colCount] = columnWidth;
  return edges;
}

/** Number of leading header rows of a table: `headerRowCount` when the
 *  model declares it, else the leading run of rows whose visible cells are
 *  all header cells. Never the whole table — a continuation needs at least
 *  one body row to carry. */
export function tableHeaderRowCount(model: TableModel): number {
  const rowCount = model.rows.length;
  if (rowCount === 0) return 0;
  const declared = model.headerRowCount ?? 0;
  let count = 0;
  if (declared > 0) {
    count = declared;
  } else {
    for (const row of model.rows) {
      const visible = row.filter((c) => !c.hiddenBy);
      if (visible.length === 0 || !visible.every((c) => c.isHeader)) break;
      count++;
    }
  }
  return Math.max(0, Math.min(count, rowCount - 1));
}

/** Whether a table cell is painted as a header cell. */
export const cellIsHeader = (cell: TableCell, row: number, model: TableModel): boolean =>
  cell.isHeader ?? row < (model.headerRowCount ?? 0);

/** The model rows a slice lays out, in order: the header rows (repeated on a
 *  continuation) followed by the slice's own rows. */
export function tableSliceRows(model: TableModel, slice: TableSliceSpec): number[] {
  const headerRows = tableHeaderRowCount(model);
  const rowCount = model.rows.length;
  const start = Math.max(0, Math.min(slice.startRow, rowCount));
  const end = Math.max(start, Math.min(slice.endRow, rowCount));
  const rows: number[] = [];
  if (start > 0) {
    for (let r = 0; r < headerRows; r++) rows.push(r);
    for (let r = Math.max(start, headerRows); r < end; r++) rows.push(r);
  } else {
    for (let r = start; r < end; r++) rows.push(r);
  }
  return rows;
}

/**
 * Where a slice starting at `startRow` can end so that its rows (plus the
 * repeated header rows of a continuation) stay within `bodyBudget` px: the
 * furthest row edge no rowspan straddles, backed off a group-header row so
 * the heading opens the rows it heads on the next page. Returns the
 * exclusive end row — `startRow` when not even one row fits, the row count
 * when the whole rest fits.
 */
export function planTableSlice(metrics: TableRowMetrics, startRow: number, bodyBudget: number): number {
  const { rowHeights, headerRowCount, breakableAfter, groupHeaderRow } = metrics;
  const rowCount = rowHeights.length;
  const start = Math.max(0, Math.min(startRow, rowCount));
  // A continuation carries the header rows again; the first slice includes
  // them as ordinary leading rows.
  const firstBody = start > 0 ? Math.max(start, headerRowCount) : start;
  let acc = 0;
  if (start > 0) for (let r = 0; r < headerRowCount; r++) acc += rowHeights[r] ?? 0;
  let best = start;
  for (let r = firstBody; r < rowCount; r++) {
    acc += rowHeights[r] ?? 0;
    if (acc > bodyBudget + 0.01) break;
    if (breakableAfter[r] ?? true) best = r + 1;
  }
  // The first slice must carry a body row past the header; a continuation
  // at least its first row. Below that floor the caller decides.
  const floor = (start > 0 ? firstBody : headerRowCount) + 1;
  // Back off group heads left at the cut, but only when a row that is not
  // one remains: a run of nothing but heads is not a heading at all.
  let cut = best;
  while (cut > floor && groupHeaderRow[cut - 1]) cut--;
  return cut > floor || best <= floor ? cut : best;
}

/** Fewest body rows the closing slice of a split table carries: a last
 *  page holding a row or two under a repeated header reads as stranded. */
export const MIN_TAIL_ROWS = 3;

/**
 * The slice of a table, from `startRow` on, that a room fits: the rows
 * {@link planTableSlice} allows within `budget` px of body, the closing
 * slice given at least {@link MIN_TAIL_ROWS} rows (handed back from this
 * one at a breakable edge, not under a group head, when it can spare
 * them), then checked by `fits` — the caption may wrap differently with
 * its suffix, and the closing slice carries the note instead of the
 * marker — backing off a row at a time over breakable edges while it
 * fails. `floor` is the exclusive end row of the smallest slice worth
 * setting. Below it, or when even that slice fails `fits`, the result is
 * `null`, unless `force`: then the smallest slice is returned (it
 * overflows, as a dominating figure would). `split` makes a slice that
 * stops short of the last row go on (`continues`, the marker); without it
 * the rows left over are dropped (`overflow: 'clip'`). Shared by floated
 * tables (`splitTableFloat`, a band's room) and inline ones (#634, the
 * room left in a column).
 */
export function chooseTableSlice(
  metrics: TableRowMetrics,
  startRow: number,
  budget: number,
  opts: { floor: number; force: boolean; split: boolean; fits: (slice: TableSliceSpec) => boolean },
): TableSliceSpec | null {
  const rowCount = metrics.rowHeights.length;
  const { floor, split } = opts;
  let end = planTableSlice(metrics, startRow, budget);
  if (end < floor) {
    if (!opts.force) return null;
    end = floor;
  }
  const tail = rowCount - end;
  if (split && tail > 0 && tail < MIN_TAIL_ROWS) {
    let e = rowCount - MIN_TAIL_ROWS;
    while (e > floor && (!(metrics.breakableAfter[e - 1] ?? true) || metrics.groupHeaderRow[e - 1])) e--;
    if (e >= floor && e >= end - MIN_TAIL_ROWS) end = e;
  }
  const sliceFor = (e: number): TableSliceSpec => ({ startRow, endRow: e, continues: e < rowCount && split });
  let slice = sliceFor(end);
  for (let guard = 0; guard < 8 && end > floor && !opts.fits(slice); guard++) {
    do end--; while (end > floor && !(metrics.breakableAfter[end - 1] ?? true));
    slice = sliceFor(end);
  }
  if (!opts.force && !opts.fits(slice)) return null;
  return slice;
}
