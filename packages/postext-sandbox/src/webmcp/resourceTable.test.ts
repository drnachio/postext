import { describe, expect, it } from 'vitest';
import { tableGridIssues, type TableModel } from 'postext';
import { buildTable, type TableContext } from './resourceTable.js';

const context: TableContext = {
  imageIds: new Set(['logo']),
  styleIds: ['ruled'],
  palette: [{ id: 'main', name: 'Main', value: { hex: '#224466', model: 'hex' } }],
};

const texts = (model: TableModel): string[][] => model.rows.map((row) => row.map((cell) => cell.content));

describe('a table built for a resource', () => {
  it('takes plain rows, with one header row unless told otherwise', () => {
    const table = buildTable({ rows: [['Size', 'Use'], ['A5', 'Novels'], ['A4']] }, undefined, context);
    expect(table.model.headerRowCount).toBe(1);
    expect(table.model.rows[0]).toEqual([{ content: 'Size', isHeader: true }, { content: 'Use', isHeader: true }]);
    expect(table.model.rows[2]).toEqual([{ content: 'A4' }, { content: '' }]);
    expect(buildTable({ tsv: 'a\tb\nc\td\n', headerRows: 0 }, undefined, context).model).toEqual({ rows: [[{ content: 'a' }, { content: 'b' }], [{ content: 'c' }, { content: 'd' }]], headerRowCount: 0 });
    expect(() => buildTable({ rows: [] }, undefined, context)).toThrow('The table has no cells.');
    expect(() => buildTable({}, undefined, context)).toThrow('A table needs "rows", "tsv" or "cells".');
    expect(() => buildTable({ rows: [['a']], tsv: 'a' }, undefined, context)).toThrow(/one of "rows", "tsv" or "cells"/);
  });

  it('takes cells with their formatting, and lays their merges as the editor does', () => {
    const table = buildTable({
      cells: [
        [{ content: 'Paper', isHeader: true, colSpan: 2, align: 'center' }, { content: 'hidden text', isHeader: true }, { content: 'Use', isHeader: true }],
        [{ content: 'A', rowSpan: 2, verticalAlign: 'middle', background: '#f4e9d8' }, { content: 'A5', image: { resourceId: 'logo', width: 0.4 } }, { content: 'Novels', background: { paletteId: 'main' } }],
        [{ content: '' }, { content: 'A4', image: { resourceId: 'logo', width: 1 } }, { content: 'Reports', align: 'end' }],
      ],
      columnWidths: [1, 2, 3],
    }, undefined, context);
    const { rows } = table.model;
    expect(tableGridIssues(table.model)).toEqual([]);
    expect(table.model.headerRowCount).toBe(1);
    expect(table.model.columnWidths).toEqual([1, 2, 3]);
    expect(rows[0]![0]).toEqual({ content: 'Paper', isHeader: true, align: 'center', colSpan: 2 });
    expect(rows[0]![1]).toEqual({ content: 'hidden text', isHeader: true, hiddenBy: { row: 0, col: 0 } });
    expect(rows[1]![0]).toEqual({ content: 'A', verticalAlign: 'middle', background: { hex: '#f4e9d8', model: 'hex' }, rowSpan: 2 });
    expect(rows[2]![0]!.hiddenBy).toEqual({ row: 1, col: 0 });
    expect(rows[1]![1]!.image).toEqual({ resourceId: 'logo', width: 0.4 });
    expect(rows[2]![1]!.image).toEqual({ resourceId: 'logo' });
    expect(rows[1]![2]!.background).toEqual({ hex: '#224466', model: 'hex', paletteId: 'main' });

    // What was read is what is taken: the stored rows give the same table.
    const again = buildTable({ cells: rows }, table, context);
    expect(again.model).toEqual(table.model);
  });

  it('refuses a grid the editor could not have made, naming the cell', () => {
    const fail = (cells: unknown): string => {
      try {
        buildTable({ cells: cells as never }, undefined, context);
      } catch (err) {
        return (err as Error).message;
      }
      return '';
    };
    expect(fail([[{ content: 'a', colSpan: 2 }], [{ content: 'b' }, { content: 'c' }]])).toMatch(/row 1 has 2 cell\(s\) and row 0 has 1/);
    expect(fail([[{ content: 'a', colSpan: 3 }, { content: '' }]])).toMatch(/table\.cells\[0\]\[0\]: a colSpan of 3 runs past the last column \(the table has 2\)/);
    expect(fail([[{ content: 'a' }], [{ content: 'b', rowSpan: 2 }]])).toMatch(/table\.cells\[1\]\[0\]: a rowSpan of 2 runs past the last row/);
    expect(fail([[{ content: 'a', colSpan: 2 }, { content: 'b', rowSpan: 2 }], [{ content: 'c' }, { content: 'd' }]])).toMatch(/table\.cells\[0\]\[1\] spans other cells, but it lies under the merge of table\.cells\[0\]\[0\]/);
    expect(fail([[{ content: 'a' }, { content: 'b', rowSpan: 2 }], [{ content: 'c', colSpan: 2 }, { content: 'd' }]])).toMatch(/table\.cells\[1\]\[0\]: its merge overlaps the merge of table\.cells\[0\]\[1\] at table\.cells\[1\]\[1\]/);
    expect(fail([[{ content: 'a' }, { content: 'b', hiddenBy: { row: 0, col: 0 } }]])).toMatch(/table\.cells\[0\]\[1\]\.hiddenBy names table\.cells\[0\]\[0\], whose colSpan and rowSpan do not reach it/);
    expect(fail([[{ content: 'a', image: { resourceId: 'nope' } }]])).toMatch(/table\.cells\[0\]\[0\]\.image names "nope".*The pictures: logo\./);
    expect(fail([[{ content: 'a', image: { resourceId: 'logo', width: 40 } }]])).toMatch(/image\.width is a share of the cell's width/);
    expect(fail([[{ content: 'a', background: 'red' }]])).toMatch(/background needs a hex colour/);
    expect(fail([[{ content: 'a', background: { paletteId: 'accent' } }]])).toMatch(/does not have\. Its colours: main\./);
  });

  it('keeps the formatting of the cells that stay when only the texts are given', () => {
    const formatted = buildTable({
      cells: [
        [{ content: 'Paper', isHeader: true, colSpan: 2 }, { content: '', isHeader: true }, { content: 'Use', isHeader: true }],
        [{ content: 'A', isHeader: true }, { content: 'A5', align: 'right', background: '#eeeeee' }, { content: 'Novels' }],
      ],
      columnWidths: [1, 2, 3],
      style: 'ruled',
      direction: 'rtl',
    }, undefined, context);

    // Other texts, a row more and a column fewer.
    const table = buildTable({ rows: [['Format', ''], ['B', 'B5'], ['C', 'C5']] }, formatted, context);
    expect(texts(table.model)).toEqual([['Format', ''], ['B', 'B5'], ['C', 'C5']]);
    expect(table.model.rows[0]![0]).toMatchObject({ isHeader: true, colSpan: 2 });
    expect(table.model.rows[0]![1]!.hiddenBy).toEqual({ row: 0, col: 0 });
    expect(table.model.rows[1]![1]).toEqual({ content: 'B5', align: 'right', background: { hex: '#eeeeee', model: 'hex' } });
    expect(table.model.rows[1]![0]!.isHeader).toBe(true);
    expect(table.model.rows[2]).toEqual([{ content: 'C' }, { content: 'C5' }]);
    expect(table.model.columnWidths).toEqual([1, 2]);
    expect(table.model.headerRowCount).toBe(1);
    expect(table).toMatchObject({ styleId: 'ruled', direction: 'rtl' });
    expect(tableGridIssues(table.model)).toEqual([]);
  });

  it('changes the table that is there: its headers, widths, style and direction', () => {
    const base = buildTable({ rows: [['a', 'b'], ['c', 'd'], ['e', 'f']] }, undefined, context);
    const headed = buildTable({ headerRows: 2, headerColumns: 1 }, base, context);
    expect(headed.model.headerRowCount).toBe(2);
    expect(headed.model.rows.map((row) => row.map((cell) => cell.isHeader === true))).toEqual([[true, true], [true, true], [true, false]]);
    expect(buildTable({ headerColumns: 0 }, headed, context).model.rows[2]![0]).toEqual({ content: 'e' });

    const styled = buildTable({ style: 'ruled', direction: 'rtl', columnWidths: [3, 1] }, base, context);
    expect(styled).toMatchObject({ styleId: 'ruled', direction: 'rtl', model: { columnWidths: [3, 1] } });
    const plain = buildTable({ style: null, direction: null, columnWidths: null }, styled, context);
    expect(plain).toEqual({ model: base.model });
    expect(() => buildTable({ style: 'fancy' }, base, context)).toThrow(/No table style "fancy"\. The book's named table styles: ruled/);
    expect(() => buildTable({ columnWidths: [1] }, base, context)).toThrow(/has 1 width\(s\) and the table 2 column\(s\)/);
    expect(() => buildTable({ columnWidths: [1, 0] }, base, context)).toThrow(/columnWidths\[1\] must be a number above 0/);
  });

  it('transposes a table, as the editor\'s button does', () => {
    const existing = buildTable({ rows: [['Year', 'Rain'], ['1990', '410'], ['2000', '395']], columnWidths: [2, 1] }, undefined, context);
    const turned = buildTable({ transpose: true }, existing, context);
    expect(texts(turned.model)).toEqual([['Year', '1990', '2000'], ['Rain', '410', '395']]);
    // The header row became a header column; the weights are dropped.
    expect(turned.model.rows.map((row) => row[0]!.isHeader)).toEqual([true, true]);
    expect(turned.model.headerRowCount).toBeUndefined();
    expect(turned.model.columnWidths).toBeUndefined();
    // New content is transposed after it is set; widths apply to the result.
    const fresh = buildTable({ rows: [['a', 'b'], ['c', 'd']], headerRows: 0, transpose: true, columnWidths: [1, 3] }, undefined, context);
    expect(texts(fresh.model)).toEqual([['a', 'c'], ['b', 'd']]);
    expect(fresh.model.columnWidths).toEqual([1, 3]);
  });
});
