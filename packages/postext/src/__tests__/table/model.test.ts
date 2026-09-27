import { describe, it, expect } from 'vitest';
import {
  addRow,
  addColumn,
  removeRow,
  removeColumn,
  mergeCells,
  unmergeCell,
  setCellContent,
  setAlignment,
  parseTSV,
  tableGridIssues,
} from '../../table/model';
import type { TableModel, TableCell } from '../../types';

/** Build a rectangular model whose cell contents are "r,c". */
const grid = (rows: number, cols: number): TableModel => ({
  rows: Array.from({ length: rows }, (_r, r) =>
    Array.from({ length: cols }, (_c, c): TableCell => ({ content: `${r},${c}` })),
  ),
});

const colCount = (m: TableModel): number =>
  m.rows.reduce((max, row) => Math.max(max, row.length), 0);

/** Cells covered by a merge must point at a real primary cell that is itself
 *  spanning — i.e. no orphaned hidden cells. */
const noOrphanHiddenCells = (m: TableModel): boolean =>
  m.rows.every((row) =>
    row.every((cell) => {
      if (!cell.hiddenBy) return true;
      const { row: pr, col: pc } = cell.hiddenBy;
      const primary = m.rows[pr]?.[pc];
      if (!primary) return false;
      return (primary.colSpan ?? 1) > 1 || (primary.rowSpan ?? 1) > 1;
    }),
  );

describe('table model — row/col structure', () => {
  it('addRow inserts a row at the index and keeps width', () => {
    const m = grid(2, 3);
    const next = addRow(m, 1);
    expect(next.rows).toHaveLength(3);
    expect(next.rows[1]).toHaveLength(3);
    expect(next.rows[1]!.every((c) => c.content === '')).toBe(true);
    // original untouched (no mutation)
    expect(m.rows).toHaveLength(2);
  });

  it('addRow clamps an out-of-range index to append', () => {
    const next = addRow(grid(2, 2), 99);
    expect(next.rows).toHaveLength(3);
  });

  it('addColumn inserts a column in every row', () => {
    const m = grid(2, 3);
    const next = addColumn(m, 1);
    expect(colCount(next)).toBe(4);
    expect(next.rows.every((r) => r.length === 4)).toBe(true);
    expect(m.rows[0]).toHaveLength(3); // original untouched
  });

  it('removeRow drops the row', () => {
    const next = removeRow(grid(3, 2), 1);
    expect(next.rows).toHaveLength(2);
    expect(next.rows[0]![0]!.content).toBe('0,0');
    expect(next.rows[1]![0]!.content).toBe('2,0');
  });

  it('removeRow on an out-of-range index is a no-op clone', () => {
    const m = grid(2, 2);
    const next = removeRow(m, 5);
    expect(next.rows).toHaveLength(2);
    expect(next).not.toBe(m); // new object
  });

  it('removeColumn drops the column from every row', () => {
    const next = removeColumn(grid(2, 3), 1);
    expect(colCount(next)).toBe(2);
    expect(next.rows[0]!.map((c) => c.content)).toEqual(['0,0', '0,2']);
  });

  it('preserves headerRowCount through structural edits', () => {
    const m: TableModel = { ...grid(3, 2), headerRowCount: 1 };
    expect(addRow(m, 0).headerRowCount).toBe(2);
    expect(addRow(m, 2).headerRowCount).toBe(1);
    expect(removeRow(m, 0).headerRowCount).toBe(0);
  });

  it('addColumn keeps columnWidths aligned (inserts the mean weight)', () => {
    const m: TableModel = { ...grid(2, 3), columnWidths: [2, 1, 3] };
    const next = addColumn(m, 1);
    expect(colCount(next)).toBe(4);
    expect(next.columnWidths).toEqual([2, 2, 1, 3]);
    // Appending clamps to the end; the original array is untouched.
    expect(addColumn(m, 99).columnWidths).toEqual([2, 1, 3, 2]);
    expect(m.columnWidths).toEqual([2, 1, 3]);
  });

  it('removeColumn splices the matching columnWidths entry', () => {
    const m: TableModel = { ...grid(2, 3), columnWidths: [2, 1, 3] };
    const next = removeColumn(m, 1);
    expect(colCount(next)).toBe(2);
    expect(next.columnWidths).toEqual([2, 3]);
    expect(m.columnWidths).toEqual([2, 1, 3]);
    // Out-of-range removal is a no-op clone that still carries the weights.
    expect(removeColumn(m, 7).columnWidths).toEqual([2, 1, 3]);
  });

  it('leaves columnWidths absent when the model has none', () => {
    const m = grid(2, 2);
    expect(addColumn(m, 0).columnWidths).toBeUndefined();
    expect(removeColumn(m, 0).columnWidths).toBeUndefined();
    expect(addRow(m, 0).columnWidths).toBeUndefined();
  });
});

describe('table model — content & alignment', () => {
  it('setCellContent replaces only the target cell', () => {
    const m = grid(2, 2);
    const next = setCellContent(m, { row: 0, col: 1 }, 'hello');
    expect(next.rows[0]![1]!.content).toBe('hello');
    expect(next.rows[0]![0]!.content).toBe('0,0');
    expect(m.rows[0]![1]!.content).toBe('0,1'); // original untouched
  });

  it('setCellContent on an out-of-bounds cell is a no-op clone', () => {
    const m = grid(1, 1);
    const next = setCellContent(m, { row: 5, col: 5 }, 'x');
    expect(next.rows[0]![0]!.content).toBe('0,0');
  });

  it('setAlignment sets and clears alignment', () => {
    const m = grid(1, 1);
    const set = setAlignment(m, { row: 0, col: 0 }, 'center', 'middle');
    expect(set.rows[0]![0]!.align).toBe('center');
    expect(set.rows[0]![0]!.verticalAlign).toBe('middle');
    const cleared = setAlignment(set, { row: 0, col: 0 }, undefined, undefined);
    expect(cleared.rows[0]![0]!.align).toBeUndefined();
    expect(cleared.rows[0]![0]!.verticalAlign).toBeUndefined();
  });

  it('content round-trips through a structural edit', () => {
    let m = grid(2, 2);
    m = setCellContent(m, { row: 0, col: 0 }, 'keep');
    m = addColumn(m, 2);
    expect(m.rows[0]![0]!.content).toBe('keep');
  });
});

describe('table model — merge / unmerge invariants', () => {
  it('merge spans the primary and hides the rest', () => {
    const m = grid(3, 3);
    const merged = mergeCells(m, { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    const primary = merged.rows[0]![0]!;
    expect(primary.colSpan).toBe(2);
    expect(primary.rowSpan).toBe(2);
    expect(primary.hiddenBy).toBeUndefined();
    expect(merged.rows[0]![1]!.hiddenBy).toEqual({ row: 0, col: 0 });
    expect(merged.rows[1]![0]!.hiddenBy).toEqual({ row: 0, col: 0 });
    expect(merged.rows[1]![1]!.hiddenBy).toEqual({ row: 0, col: 0 });
    expect(noOrphanHiddenCells(merged)).toBe(true);
  });

  it('a 1x1 merge is a no-op', () => {
    const m = grid(2, 2);
    const merged = mergeCells(m, { start: { row: 0, col: 0 }, end: { row: 0, col: 0 } });
    expect(merged.rows[0]![0]!.colSpan).toBeUndefined();
    expect(merged.rows[0]![0]!.rowSpan).toBeUndefined();
  });

  it('merge accepts a reversed (bottom-right to top-left) range', () => {
    const m = grid(3, 3);
    const merged = mergeCells(m, { start: { row: 1, col: 1 }, end: { row: 0, col: 0 } });
    expect(merged.rows[0]![0]!.colSpan).toBe(2);
    expect(merged.rows[0]![0]!.rowSpan).toBe(2);
    expect(noOrphanHiddenCells(merged)).toBe(true);
  });

  it('unmerge from the primary clears spans and hidden markers', () => {
    const m = grid(3, 3);
    const merged = mergeCells(m, { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    const un = unmergeCell(merged, { row: 0, col: 0 });
    expect(un.rows[0]![0]!.colSpan).toBeUndefined();
    expect(un.rows[0]![0]!.rowSpan).toBeUndefined();
    expect(un.rows.every((r) => r.every((c) => c.hiddenBy === undefined))).toBe(true);
    expect(noOrphanHiddenCells(un)).toBe(true);
  });

  it('unmerge from a hidden cell also clears the whole merge', () => {
    const m = grid(3, 3);
    const merged = mergeCells(m, { start: { row: 0, col: 0 }, end: { row: 1, col: 1 } });
    const un = unmergeCell(merged, { row: 1, col: 1 });
    expect(un.rows[0]![0]!.colSpan).toBeUndefined();
    expect(un.rows.every((r) => r.every((c) => c.hiddenBy === undefined))).toBe(true);
  });

  it('merge then unmerge round-trips to an equivalent grid', () => {
    const m = grid(3, 3);
    const merged = mergeCells(m, { start: { row: 0, col: 0 }, end: { row: 2, col: 2 } });
    const un = unmergeCell(merged, { row: 0, col: 0 });
    const contents = un.rows.map((r) => r.map((c) => c.content));
    expect(contents).toEqual([
      ['0,0', '0,1', '0,2'],
      ['1,0', '1,1', '1,2'],
      ['2,0', '2,1', '2,2'],
    ]);
    expect(noOrphanHiddenCells(un)).toBe(true);
  });

  it('unmerge on a non-merged cell is a harmless no-op', () => {
    const m = grid(2, 2);
    const un = unmergeCell(m, { row: 0, col: 0 });
    expect(un.rows[0]![0]!.colSpan).toBeUndefined();
    expect(noOrphanHiddenCells(un)).toBe(true);
  });
});

describe('table model — TSV paste normalization', () => {
  it('splits rows on newlines and cells on tabs', () => {
    const m = parseTSV('a\tb\tc\nd\te\tf');
    expect(m.rows).toHaveLength(2);
    expect(m.rows[0]!.map((c) => c.content)).toEqual(['a', 'b', 'c']);
    expect(m.rows[1]!.map((c) => c.content)).toEqual(['d', 'e', 'f']);
  });

  it('normalizes CRLF and CR line endings', () => {
    const m = parseTSV('a\tb\r\nc\td\re\tf');
    expect(m.rows.map((r) => r.map((c) => c.content))).toEqual([
      ['a', 'b'],
      ['c', 'd'],
      ['e', 'f'],
    ]);
  });

  it('pads ragged rows so the grid is rectangular', () => {
    const m = parseTSV('a\tb\tc\nd\ne\tf');
    expect(m.rows.every((r) => r.length === 3)).toBe(true);
    expect(m.rows[1]!.map((c) => c.content)).toEqual(['d', '', '']);
  });

  it('drops a single trailing newline but keeps interior blank rows', () => {
    const m = parseTSV('a\tb\n\nc\td\n');
    expect(m.rows).toHaveLength(3);
    expect(m.rows[1]!.map((c) => c.content)).toEqual(['', '']);
  });

  it('empty input yields an empty model', () => {
    expect(parseTSV('').rows).toEqual([]);
  });

  it('a single cell parses as a 1x1 grid', () => {
    const m = parseTSV('solo');
    expect(m.rows).toEqual([[{ content: 'solo' }]]);
  });
});

describe('table model — TSV header rows', () => {
  it('marks the leading rows as header rows', () => {
    const m = parseTSV('Part\tQty\nBolt\t4\nNut\t8', { headerRows: 1 });
    expect(m.headerRowCount).toBe(1);
    expect(m.rows[0]!.map((c) => c.isHeader)).toEqual([true, true]);
    expect(m.rows[1]!.map((c) => c.isHeader)).toEqual([undefined, undefined]);
  });

  it('clamps the header to the rows there are and ignores zero', () => {
    expect(parseTSV('a\tb', { headerRows: 5 }).headerRowCount).toBe(1);
    const none = parseTSV('a\tb\nc\td', { headerRows: 0 });
    expect(none.headerRowCount).toBeUndefined();
    expect(none.rows[0]![0]).toEqual({ content: 'a' });
    expect(parseTSV('a', { headerRows: -2 }).headerRowCount).toBeUndefined();
  });

  it('keeps the model without a header when no option is given', () => {
    expect(parseTSV('a\tb\nc\td')).toEqual({ rows: [[{ content: 'a' }, { content: 'b' }], [{ content: 'c' }, { content: 'd' }]] });
  });
});

describe('table model — grid validation', () => {
  it('accepts rectangular grids and merges made with mergeCells', () => {
    expect(tableGridIssues(grid(3, 3))).toEqual([]);
    const merged = mergeCells(mergeCells(grid(3, 3), { start: { row: 0, col: 0 }, end: { row: 0, col: 1 } }), {
      start: { row: 1, col: 2 },
      end: { row: 2, col: 2 },
    });
    expect(tableGridIssues(merged)).toEqual([]);
  });

  it('flags a colSpan whose covered cell was left out HTML-style', () => {
    const m: TableModel = {
      rows: [
        [{ content: 'A', colSpan: 2 }, { content: 'C' }],
        [{ content: '1' }, { content: '2' }, { content: '3' }],
      ],
    };
    expect(tableGridIssues(m)).toEqual([
      { kind: 'spanOverlap', row: 0, col: 1, coveredBy: { row: 0, col: 0 } },
      { kind: 'missingCells', row: 0, col: 2 },
    ]);
  });

  it('flags a rowSpan whose covered cell was left out of the next row', () => {
    const m: TableModel = {
      rows: [
        [{ content: 'A', rowSpan: 2 }, { content: 'B' }],
        [{ content: 'C' }],
      ],
    };
    expect(tableGridIssues(m)).toEqual([
      { kind: 'spanOverlap', row: 1, col: 0, coveredBy: { row: 0, col: 0 } },
      { kind: 'missingCells', row: 1, col: 1 },
    ]);
  });

  it('does not count positions a merge covers past a short row as holes', () => {
    const m: TableModel = {
      rows: [
        [{ content: 'A' }, { content: 'B', rowSpan: 2 }],
        [{ content: 'C' }],
      ],
    };
    expect(tableGridIssues(m)).toEqual([]);
  });
});

describe('table model — row/col edits across merges', () => {
  /** A 4×4 grid with a 2×2 merge at (1,1)–(2,2), primary "M". */
  const merged = (): TableModel => {
    const m = mergeCells(grid(4, 4), { start: { row: 1, col: 1 }, end: { row: 2, col: 2 } });
    return setCellContent(m, { row: 1, col: 1 }, 'M');
  };
  const primaryAt = (m: TableModel, row: number, col: number) => m.rows[row]![col]!;
  const coveredBy = (m: TableModel) =>
    m.rows.flatMap((row, r) => row.flatMap((cell, c) => (cell.hiddenBy ? [`${r},${c}>${cell.hiddenBy.row},${cell.hiddenBy.col}`] : [])));

  it('addRow before a merge moves it down, covered cells included', () => {
    const m = addRow(merged(), 0);
    expect(primaryAt(m, 2, 1)).toMatchObject({ content: 'M', rowSpan: 2, colSpan: 2 });
    expect(coveredBy(m)).toEqual(['2,2>2,1', '3,1>2,1', '3,2>2,1']);
    expect(tableGridIssues(m)).toEqual([]);
  });

  it('addRow inside a merge grows it over the new row', () => {
    const m = addRow(merged(), 2);
    expect(primaryAt(m, 1, 1)).toMatchObject({ content: 'M', rowSpan: 3, colSpan: 2 });
    expect(coveredBy(m)).toEqual(['1,2>1,1', '2,1>1,1', '2,2>1,1', '3,1>1,1', '3,2>1,1']);
    expect(tableGridIssues(m)).toEqual([]);
    // Right after the merge: untouched.
    expect(primaryAt(addRow(merged(), 3), 1, 1).rowSpan).toBe(2);
  });

  it('addColumn before or inside a merge moves or widens it', () => {
    const before = addColumn(merged(), 1);
    expect(primaryAt(before, 1, 2)).toMatchObject({ content: 'M', rowSpan: 2, colSpan: 2 });
    expect(tableGridIssues(before)).toEqual([]);
    const inside = addColumn(merged(), 2);
    expect(primaryAt(inside, 1, 1)).toMatchObject({ content: 'M', rowSpan: 2, colSpan: 3 });
    expect(coveredBy(inside)).toEqual(['1,2>1,1', '1,3>1,1', '2,1>1,1', '2,2>1,1', '2,3>1,1']);
    expect(tableGridIssues(inside)).toEqual([]);
  });

  it('removeRow of a covered row shrinks the merge; of its first row keeps the content', () => {
    const covered = removeRow(merged(), 2);
    expect(primaryAt(covered, 1, 1)).toMatchObject({ content: 'M', colSpan: 2 });
    expect(primaryAt(covered, 1, 1).rowSpan).toBeUndefined();
    expect(coveredBy(covered)).toEqual(['1,2>1,1']);
    expect(tableGridIssues(covered)).toEqual([]);
    const first = removeRow(merged(), 1);
    expect(primaryAt(first, 1, 1)).toMatchObject({ content: 'M', colSpan: 2 });
    expect(coveredBy(first)).toEqual(['1,2>1,1']);
    expect(tableGridIssues(first)).toEqual([]);
    // A row above the merge: it moves up.
    const above = removeRow(merged(), 0);
    expect(primaryAt(above, 0, 1)).toMatchObject({ content: 'M', rowSpan: 2, colSpan: 2 });
    expect(coveredBy(above)).toEqual(['0,2>0,1', '1,1>0,1', '1,2>0,1']);
  });

  it('removeColumn of a covered or first column shrinks the merge, keeping its content', () => {
    for (const at of [1, 2]) {
      const m = removeColumn(merged(), at);
      expect(primaryAt(m, 1, 1)).toMatchObject({ content: 'M', rowSpan: 2 });
      expect(primaryAt(m, 1, 1).colSpan).toBeUndefined();
      expect(coveredBy(m)).toEqual(['2,1>1,1']);
      expect(tableGridIssues(m)).toEqual([]);
    }
  });

  it('drops a merge whose last covered row or column goes, and leaves unmerged grids as before', () => {
    const wide = mergeCells(grid(3, 3), { start: { row: 1, col: 0 }, end: { row: 1, col: 1 } });
    const m = removeRow(wide, 1);
    expect(m.rows.flat().some((c) => c.hiddenBy || c.colSpan || c.rowSpan)).toBe(false);
    expect(removeRow(grid(3, 3), 1)).toEqual({ rows: [grid(3, 3).rows[0], grid(3, 3).rows[2]] });
  });
});
