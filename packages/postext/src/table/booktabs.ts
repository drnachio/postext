/**
 * The rules of a `'booktabs'` table (#625): LaTeX's `\toprule`, `\midrule`,
 * `\cmidrule` and `\bottomrule`, computed once from a laid-out table (or a
 * slice of one) so that every renderer strokes the same lines.
 */
import type { TableContinuedFootRule, TableSpanRules } from '../types';
import type { VDTResourceTableLayout, VDTTableStroke } from '../vdt';

/** The widths (px) and options of a booktabs table, resolved. */
export interface BooktabsRuleSpec {
  /** Top and bottom rules. */
  heavyPx: number;
  /** Rule under the header rows, group rules, a `'light'` continued foot. */
  lightPx: number;
  /** Rules under spanning header cells. */
  spanPx: number;
  spanRules: TableSpanRules;
  /** How much a `'trimmed'` span rule is shortened at each end. */
  spanTrimPx: number;
  groupRules: boolean;
  continuedFootRule: TableContinuedFootRule;
}

/** Edges closer than this are the same edge (rounding of summed heights). */
const EPS = 0.01;

/**
 * The strokes of a booktabs table laid out with its top at y = 0 (cells and
 * `rowEdges` in the table's frame, already mirrored for a table that runs
 * the other way): a heavy rule on the top edge, a light rule under the last
 * header row, a rule under every header cell spanning several columns above
 * that row, a light rule above each group-head body row (`groupRules`) and a
 * heavy rule under the last row — or the `continuedFootRule` when the table
 * (slice) goes on overleaf. A continuation slice repeats the header rows, so
 * it gets the top and header rules again. Strokes of zero width are left
 * out.
 *
 * `headerRowCount` is the model's (`tableHeaderRowCount`): its rows are
 * the first ones of every slice.
 */
export function booktabsStrokes(
  table: Pick<VDTResourceTableLayout, 'cells' | 'rowEdges' | 'columnEdges'>,
  headerRowCount: number,
  spec: BooktabsRuleSpec,
  continues: boolean,
): VDTTableStroke[] {
  const { cells, rowEdges, columnEdges } = table;
  const rowCount = rowEdges.length - 1;
  if (rowCount <= 0 || cells.length === 0) return [];
  const left = Math.min(...columnEdges);
  const right = Math.max(...columnEdges);
  const top = rowEdges[0] ?? 0;
  const bottom = rowEdges[rowCount] ?? top;
  const colCount = columnEdges.length - 1;
  const strokes: VDTTableStroke[] = [];
  const rule = (x1: number, x2: number, y: number, widthPx: number) => {
    if (widthPx > 0 && x2 - x1 > EPS) strokes.push({ x1, y1: y, x2, y2: y, widthPx });
  };

  rule(left, right, top, spec.heavyPx);

  // The header rows open every slice: they end at the edge of the slice's
  // `headerRowCount`-th row.
  const headRows = Math.min(headerRowCount, rowCount);
  const headerBottom = headRows > 0 ? rowEdges[headRows] ?? top : top;
  const hasHeaderRule = headRows > 0 && headerBottom < bottom - EPS;

  if (headRows > 0 && spec.spanRules !== 'none') {
    for (const cell of cells) {
      if (cell.row >= headerRowCount || cell.colSpan <= 1) continue;
      const y = cell.rect.y + cell.rect.height;
      if (y >= headerBottom - EPS) continue;
      const trim = spec.spanRules === 'trimmed' ? spec.spanTrimPx : 0;
      rule(cell.rect.x + trim, cell.rect.x + cell.rect.width - trim, y, spec.spanPx);
    }
  }

  if (hasHeaderRule) rule(left, right, headerBottom, spec.lightPx);

  if (spec.groupRules) {
    // A body row heads a group when its only cell runs across every column
    // (in a table of several), or when all its cells are header cells —
    // the rows `TableRowMetrics.groupHeaderRow` marks.
    const rows = new Map<number, { primaries: number; fullSpan: boolean; allHeader: boolean; y: number }>();
    for (const cell of cells) {
      if (cell.row < headerRowCount) continue;
      const r = rows.get(cell.row) ?? { primaries: 0, fullSpan: false, allHeader: true, y: cell.rect.y };
      r.primaries++;
      if (cell.colSpan >= colCount) r.fullSpan = true;
      if (!cell.isHeader) r.allHeader = false;
      r.y = Math.min(r.y, cell.rect.y);
      rows.set(cell.row, r);
    }
    for (const r of rows.values()) {
      const heads = (r.primaries === 1 && r.fullSpan && colCount > 1) || r.allHeader;
      // Not on the row that opens the slice: the top or header rule is there.
      if (heads && r.y > headerBottom + EPS && r.y < bottom - EPS) rule(left, right, r.y, spec.lightPx);
    }
  }

  const foot = !continues ? spec.heavyPx
    : spec.continuedFootRule === 'bottom' ? spec.heavyPx
    : spec.continuedFootRule === 'light' ? spec.lightPx
    : 0;
  rule(left, right, bottom, foot);
  return strokes;
}
