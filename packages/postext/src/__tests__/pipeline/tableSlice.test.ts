import { describe, it, expect } from 'vitest';
import { layoutResourceBlock, planTableSlice, tableHeaderRowCount, tableSliceRows } from '../../pipeline/resourceLayout';
import type { TableRowMetrics, TableSliceSpec } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import type { PostextConfig, Resource, TableModel, TableCell } from '../../types';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const COLUMN_WIDTH = 600;

const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

/** Two header rows (with a rowspan in the first column), then `n` body rows
 *  where every fifth row is a single cell across the table (a group head). */
function bigModel(n: number): TableModel {
  const rows: TableCell[][] = [
    [cell('', { isHeader: true, rowSpan: 2 }), cell('Group', { isHeader: true, colSpan: 2 }), cell('', { hiddenBy: { row: 0, col: 1 } })],
    [cell('', { hiddenBy: { row: 0, col: 0 } }), cell('A', { isHeader: true }), cell('B', { isHeader: true })],
  ];
  for (let i = 0; i < n; i++) {
    if (i % 5 === 0) {
      rows.push([cell(`Section ${i}`, { colSpan: 3 }), cell('', { hiddenBy: { row: rows.length, col: 0 } }), cell('', { hiddenBy: { row: rows.length, col: 0 } })]);
    } else {
      rows.push([cell(`Row ${i}`), cell('x'), cell('y')]);
    }
  }
  return { rows, headerRowCount: 2 };
}

const tableResource = (model: TableModel, extra: Partial<Resource> = {}): Resource => ({
  id: 'tab-1',
  typeId: 'table',
  kind: 'table',
  caption: 'A long table.',
  createdAt: 0,
  updatedAt: 0,
  table: { model },
  ...extra,
});

function layout(resource: Resource, config?: PostextConfig, slice?: TableSliceSpec) {
  const resourceTypes = config?.resourceTypes ?? defaultResourceTypes();
  const resolved = resolveAllConfig(config);
  return layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === resource.typeId),
    number: '6-4',
    resolved,
    columnWidth: COLUMN_WIDTH,
    resourceNumbering: { [resource.id]: { number: '6-4', typeId: resource.typeId, heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes,
    resources: [resource],
    ...(slice ? { slice } : {}),
  });
}

const captionText = (lines: { text: string }[]) => lines.map((l) => l.text).join(' ');

describe('table row metrics', () => {
  it('a full layout reports one height per row, the header rows, rowspan edges and group heads', () => {
    const model = bigModel(12);
    const { tableRows, block } = layout(tableResource(model));
    expect(tableRows).toBeDefined();
    const m = tableRows!;
    expect(m.rowHeights).toHaveLength(model.rows.length);
    expect(m.headerRowCount).toBe(2);
    // The rowspan in the header ties rows 0 and 1 together.
    expect(m.breakableAfter[0]).toBe(false);
    expect(m.breakableAfter[1]).toBe(true);
    // Rows 2, 7, 12 are single full-width cells (group heads).
    expect(m.groupHeaderRow[2]).toBe(true);
    expect(m.groupHeaderRow[3]).toBe(false);
    expect(m.groupHeaderRow[7]).toBe(true);
    // Heights match the laid-out row edges.
    const edges = block.table!.rowEdges;
    for (let r = 0; r < m.rowHeights.length; r++) {
      expect(edges[r + 1]! - edges[r]!).toBeCloseTo(m.rowHeights[r]!, 6);
    }
    expect(block.slice).toBeUndefined();
    expect(block.continuesLines).toEqual([]);
  });

  it('header rows: declared count wins; otherwise the leading run of header cells', () => {
    expect(tableHeaderRowCount(bigModel(3))).toBe(2);
    const detected: TableModel = {
      rows: [
        [cell('h', { isHeader: true }), cell('h', { isHeader: true })],
        [cell('a'), cell('b')],
        [cell('c'), cell('d')],
      ],
    };
    expect(tableHeaderRowCount(detected)).toBe(1);
    // Never the whole table.
    const allHeaders: TableModel = { rows: [[cell('h', { isHeader: true })], [cell('h', { isHeader: true })]] };
    expect(tableHeaderRowCount(allHeaders)).toBe(1);
  });
});

describe('planTableSlice', () => {
  const metrics: TableRowMetrics = {
    rowHeights: [10, 10, 20, 20, 20, 20, 20, 20],
    headerRowCount: 2,
    breakableAfter: [false, true, true, false, true, true, true, true],
    groupHeaderRow: [false, false, false, false, false, true, false, false],
  };

  it('the first slice takes as many rows as fit the budget, header included', () => {
    // 10 + 10 + 20 + 20 = 60 → rows 0..3, but the rowspan after row 3 is not breakable → end 3.
    expect(planTableSlice(metrics, 0, 60)).toBe(3);
    expect(planTableSlice(metrics, 0, 80)).toBe(5);
  });

  it('a continuation pays for the repeated header rows', () => {
    // header 20 + rows 3,4 (40) = 60 → end 5; row 5 would need 80.
    expect(planTableSlice(metrics, 3, 60)).toBe(5);
    expect(planTableSlice(metrics, 3, 79)).toBe(5);
  });

  it('never ends on a group head when a row can be given back', () => {
    // header 20 + rows 3..5 = 80 fits, but row 5 heads a group → end 5.
    expect(planTableSlice(metrics, 3, 80)).toBe(5);
    // With row 6 also fitting the group head is carried along.
    expect(planTableSlice(metrics, 3, 100)).toBe(7);
  });

  it('returns the start row when nothing fits and the row count when everything does', () => {
    expect(planTableSlice(metrics, 3, 10)).toBe(3);
    expect(planTableSlice(metrics, 0, 1000)).toBe(8);
    expect(planTableSlice(metrics, 3, 1000)).toBe(8);
  });

  it('a cut that would back off over nothing but group heads stays where the rows fit', () => {
    // Rows 2..7 all flagged as heads (a boxed one-column table): the slice
    // keeps every row that fits instead of collapsing to the floor.
    const heads: TableRowMetrics = {
      ...metrics,
      groupHeaderRow: [false, false, true, true, true, true, true, true],
      breakableAfter: metrics.breakableAfter.map(() => true),
    };
    expect(planTableSlice(heads, 0, 100)).toBe(6);
    expect(planTableSlice(heads, 3, 100)).toBe(7);
  });
});

describe('one-column tables', () => {
  it('no row of a boxed one-column table is a group head', () => {
    const model: TableModel = { rows: Array.from({ length: 6 }, (_, i) => [cell(`row ${i}`)]) };
    const { tableRows } = layout(tableResource(model));
    expect(tableRows!.headerRowCount).toBe(0);
    expect(tableRows!.groupHeaderRow.every((g) => !g)).toBe(true);
    // 3 rows fit: the slice takes them all.
    const h = tableRows!.rowHeights[0]!;
    expect(planTableSlice(tableRows!, 0, h * 3 + 0.5)).toBe(3);
  });
});

describe('table slices', () => {
  const model = bigModel(20);
  const resource = tableResource(model, { note: 'Source: the source.' });

  it('tableSliceRows repeats the header rows before a continuation', () => {
    expect(tableSliceRows(model, { startRow: 0, endRow: 4, continues: true })).toEqual([0, 1, 2, 3]);
    expect(tableSliceRows(model, { startRow: 6, endRow: 9, continues: false })).toEqual([0, 1, 6, 7, 8]);
  });

  it('a first slice that continues: no suffix, a marker instead of the note, only its rows', () => {
    const { block, totalHeight } = layout(resource, undefined, { startRow: 0, endRow: 6, continues: true });
    expect(block.slice).toEqual({ startRow: 0, endRow: 6, continued: false, continues: true });
    expect(block.table!.rowEdges).toHaveLength(7);
    const rows = new Set(block.table!.cells.map((c) => c.row));
    expect([...rows].sort((a, b) => a - b)).toEqual([0, 1, 2, 3, 4, 5]);
    expect(captionText(block.captionLines)).not.toContain('(cont.)');
    expect(block.noteLines).toEqual([]);
    expect(block.continuesLines).toHaveLength(1);
    expect(block.continuesLines[0]!.text).toBe('Continued');
    // Flush right under the body.
    const marker = block.continuesLines[0]!;
    expect(marker.bbox.x + marker.bbox.width).toBeCloseTo(COLUMN_WIDTH, 6);
    expect(marker.bbox.y).toBeGreaterThan(block.bodyRect.y + block.bodyRect.height);
    expect(totalHeight).toBeCloseTo(marker.bbox.y + marker.bbox.height, 6);
  });

  it('a continuation repeats the header rows, keeps model row indices and suffixes the caption', () => {
    const { block } = layout(resource, undefined, { startRow: 6, endRow: 12, continues: true });
    expect(block.slice).toEqual({ startRow: 6, endRow: 12, continued: true, continues: true });
    const cells = block.table!.cells;
    // Header rows 0-1 sit at the top, then rows 6..11.
    expect(block.table!.rowEdges).toHaveLength(9);
    const header = cells.filter((c) => c.isHeader);
    expect(header.map((c) => c.row).sort((a, b) => a - b)).toEqual([0, 0, 1, 1]);
    expect(Math.max(...header.map((c) => c.rect.y + c.rect.height))).toBeLessThanOrEqual(block.table!.rowEdges[2]! + 1e-6);
    const body = cells.filter((c) => !c.isHeader);
    expect(Math.min(...body.map((c) => c.row))).toBe(6);
    expect(Math.max(...body.map((c) => c.row))).toBe(11);
    // The rowspan cell of the header still spans both repeated rows.
    const spanned = cells.find((c) => c.row === 0 && c.col === 0)!;
    expect(spanned.rowSpan).toBe(2);
    expect(spanned.rect.height).toBeCloseTo(block.table!.rowEdges[2]!, 6);
    expect(captionText(block.captionLines)).toContain('(cont.)');
    expect(block.continuesLines).toHaveLength(1);
    expect(block.noteLines).toEqual([]);
  });

  it('the closing slice carries the note and no marker', () => {
    const { block } = layout(resource, undefined, { startRow: 12, endRow: model.rows.length, continues: false });
    expect(block.slice).toEqual({ startRow: 12, endRow: model.rows.length, continued: true, continues: false });
    expect(block.continuesLines).toEqual([]);
    expect(block.noteLines.length).toBeGreaterThan(0);
    expect(captionText(block.captionLines)).toContain('(cont.)');
  });

  it('row heights of a slice equal the full layout\'s', () => {
    const full = layout(resource).tableRows!;
    const { block } = layout(resource, undefined, { startRow: 6, endRow: 12, continues: true });
    const edges = block.table!.rowEdges;
    const expected = [0, 1, 6, 7, 8, 9, 10, 11].map((r) => full.rowHeights[r]!);
    for (let i = 0; i < expected.length; i++) {
      expect(edges[i + 1]! - edges[i]!).toBeCloseTo(expected[i]!, 6);
    }
  });

  it('continuation strings follow the config: locale defaults and explicit overrides', () => {
    const es = layout(resource, { locale: 'es' }, { startRow: 6, endRow: 12, continues: true }).block;
    expect(es.continuesLines[0]!.text).toBe('Continúa');
    expect(captionText(es.captionLines)).toContain('(cont.)');
    const custom = layout(
      resource,
      { tableStyle: { continuedSuffix: '(continuación)', continuesMarker: 'Sigue en la página siguiente' } },
      { startRow: 6, endRow: 12, continues: true },
    ).block;
    expect(custom.continuesLines[0]!.text).toBe('Sigue en la página siguiente');
    expect(captionText(custom.captionLines)).toContain('(continuación)');
    const off = layout(resource, { tableStyle: { continuesMarkerEnabled: false } }, { startRow: 6, endRow: 12, continues: true }).block;
    expect(off.continuesLines).toEqual([]);
  });

  it('a slice covering the whole table from row 0 is the plain table', () => {
    const { block } = layout(resource, undefined, { startRow: 0, endRow: model.rows.length, continues: false });
    expect(block.slice).toBeUndefined();
    expect(block.noteLines.length).toBeGreaterThan(0);
  });
});
