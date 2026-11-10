import { describe, expect, it } from 'vitest';
import { mergeCells } from '../../table/model.js';
import { transposeTable } from '../../table/transpose.js';
import type { TableModel } from '../../types.js';

const text = (m: TableModel) => m.rows.map((r) => r.map((c) => c.content));

describe('transposeTable', () => {
  const table: TableModel = {
    headerRowCount: 1,
    columnWidths: [2, 1, 1],
    rows: [
      [{ content: 'Patología', isHeader: true }, { content: 'Signos', isHeader: true }, { content: 'Imagen', isHeader: true }],
      [{ content: 'Cáncer' }, { content: 'Peso', align: 'right' }, { content: 'Radiografía' }],
    ],
  };

  it('swaps rows and columns, the cells with their settings', () => {
    const t = transposeTable(table);
    expect(text(t)).toEqual([['Patología', 'Cáncer'], ['Signos', 'Peso'], ['Imagen', 'Radiografía']]);
    expect(t.rows[1]![1]!.align).toBe('right');
  });

  it('turns the header rows into a header column, and back', () => {
    const t = transposeTable(table);
    expect(t.headerRowCount).toBeUndefined();
    expect(t.rows.map((r) => r[0]!.isHeader)).toEqual([true, true, true]);
    const back = transposeTable(t);
    expect(back.headerRowCount).toBe(1);
    expect(text(back)).toEqual(text(table));
  });

  it('drops the column weights', () => {
    expect(transposeTable(table).columnWidths).toBeUndefined();
  });

  it('swaps the spans of a merge and its hidden cells', () => {
    const merged = mergeCells(
      { rows: [[{ content: 'a' }, { content: 'b' }, { content: 'c' }], [{ content: 'd' }, { content: 'e' }, { content: 'f' }]] },
      { start: { row: 0, col: 0 }, end: { row: 0, col: 1 } },
    );
    const t = transposeTable(merged);
    expect(t.rows[0]![0]!.rowSpan).toBe(2);
    expect(t.rows[0]![0]!.colSpan).toBeUndefined();
    expect(t.rows[1]![0]!.hiddenBy).toEqual({ row: 0, col: 0 });
  });

  it('pads ragged rows before swapping', () => {
    const t = transposeTable({ rows: [[{ content: 'a' }, { content: 'b' }], [{ content: 'c' }]] });
    expect(text(t)).toEqual([['a', 'c'], ['b', '']]);
  });
});
