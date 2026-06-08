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
