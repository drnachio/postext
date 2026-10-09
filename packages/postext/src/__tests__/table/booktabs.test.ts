import { describe, it, expect } from 'vitest';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import type { TableSliceSpec } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { resolveTableStyleConfig, stripTableStyleDefaults } from '../../defaults/tableStyle';
import { resolveBodyTextConfig } from '../../defaults';
import { buildDocument } from '../../pipeline/build';
import { renderToHtml } from '../../html-backend';
import { renderResourceBlock } from '../../canvas-backend/renderResourceBlock';
import type { PostextConfig, Resource, TableCell, TableModel, TableStyleConfig } from '../../types';
import type { VDTBlock, VDTTableStroke } from '../../vdt';

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
const px = (value: number) => ({ value, unit: 'px' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });
const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

/** A 20px body cell size: heavy 1.6px, light 1px, span 0.6px, trim 10px. */
const BOOKTABS: TableStyleConfig = { rules: 'booktabs', bodyFontSize: px(20) };
const HEAVY = 1.6;
const LIGHT = 1;
const SPAN = 0.6;
const TRIM = 10;

const simpleModel = (bodyRows: number, headerRowCount = 1): TableModel => ({
  headerRowCount,
  rows: [
    ...(headerRowCount > 0 ? [[cell('A', { isHeader: true }), cell('B', { isHeader: true }), cell('C', { isHeader: true })]] : []),
    ...Array.from({ length: bodyRows }, (_, i) => [cell(`r${i}`), cell('x'), cell('y')]),
  ],
});

/** Two header rows: "Group" spans columns 1–3 above "A B C"; column 0 is a
 *  rowspan head. Every fifth body row is a group head across the table. */
const spanningModel = (bodyRows: number, groups = false): TableModel => {
  const rows: TableCell[][] = [
    [cell('Item', { isHeader: true, rowSpan: 2 }), cell('Group', { isHeader: true, colSpan: 3 }), cell('', { hiddenBy: { row: 0, col: 1 } }), cell('', { hiddenBy: { row: 0, col: 1 } })],
    [cell('', { hiddenBy: { row: 0, col: 0 } }), cell('A', { isHeader: true }), cell('B', { isHeader: true }), cell('C', { isHeader: true })],
  ];
  for (let i = 0; i < bodyRows; i++) {
    const r = rows.length;
    if (groups && i % 5 === 0) {
      rows.push([cell(`Section ${i}`, { colSpan: 4 }), cell('', { hiddenBy: { row: r, col: 0 } }), cell('', { hiddenBy: { row: r, col: 0 } }), cell('', { hiddenBy: { row: r, col: 0 } })]);
    } else {
      rows.push([cell(`Row ${i}`), cell('1'), cell('2'), cell('3')]);
    }
  }
  return { rows, headerRowCount: 2 };
};

const tableResource = (model: TableModel, extra: Partial<NonNullable<Resource['table']>> = {}): Resource => ({
  id: 'tab-1',
  typeId: 'table',
  kind: 'table',
  caption: 'A table.',
  createdAt: 0,
  updatedAt: 0,
  table: { model, ...extra },
});

function layout(resource: Resource, tableStyle: TableStyleConfig | undefined, slice?: TableSliceSpec, config: PostextConfig = {}) {
  const resourceTypes = defaultResourceTypes();
  const resolved = resolveAllConfig({ ...config, ...(tableStyle ? { tableStyle } : {}) });
  return layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === resource.typeId),
    number: '1',
    resolved,
    columnWidth: COLUMN_WIDTH,
    resourceNumbering: { [resource.id]: { number: '1', typeId: resource.typeId, heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes,
    resources: [resource],
    ...(slice ? { slice } : {}),
  }).block.table!;
}

const full = (s: VDTTableStroke) => s.x1 === 0 && s.x2 === COLUMN_WIDTH;

describe('booktabs config', () => {
  it('resolves the booktabs defaults and strips them back', () => {
    const ts = resolveTableStyleConfig({ rules: 'booktabs' }, resolveBodyTextConfig(undefined));
    expect(ts.heavyRuleWidth).toEqual({ value: 0.08, unit: 'em' });
    expect(ts.lightRuleWidth).toEqual({ value: 0.05, unit: 'em' });
    expect(ts.spanRuleWidth).toEqual({ value: 0.03, unit: 'em' });
    expect(ts.spanRules).toBe('trimmed');
    expect(ts.spanRuleTrim).toEqual({ value: 0.5, unit: 'em' });
    expect(ts.groupRules).toBe(false);
    expect(ts.continuedFootRule).toBe('light');
    expect(stripTableStyleDefaults({ rules: 'booktabs', heavyRuleWidth: { value: 0.08, unit: 'em' }, spanRules: 'trimmed', groupRules: false, continuedFootRule: 'light' }))
      .toEqual({ rules: 'booktabs' });
    expect(stripTableStyleDefaults({ spanRules: 'full', groupRules: true, continuedFootRule: 'none', lightRuleWidth: pt(0.4) }))
      .toEqual({ spanRules: 'full', groupRules: true, continuedFootRule: 'none', lightRuleWidth: pt(0.4) });
  });
});

describe('booktabs strokes', () => {
  it('a table with one header row gets a heavy top rule, a light header rule and a heavy bottom rule', () => {
    const t = layout(tableResource(simpleModel(4)), BOOKTABS);
    const s = t.strokes!;
    expect(s).toHaveLength(3);
    expect(s.every(full)).toBe(true);
    expect(s.every((x) => x.y1 === x.y2)).toBe(true);
    expect(s[0]).toMatchObject({ y1: 0, widthPx: HEAVY });
    expect(s[1]!.y1).toBeCloseTo(t.rowEdges[1]!, 6);
    expect(s[1]!.widthPx).toBeCloseTo(LIGHT, 6);
    expect(s[2]!.y1).toBeCloseTo(t.rowEdges[t.rowEdges.length - 1]!, 6);
    expect(s[2]!.widthPx).toBeCloseTo(HEAVY, 6);
    // The widest stroke stands for the table's rules elsewhere (caption bar,
    // preflight).
    expect(t.borderWidthPx).toBeCloseTo(HEAVY, 6);
    expect(t.rules).toBe('booktabs');
  });

  it('resolves every width against the body cell size, not the header size', () => {
    const t = layout(tableResource(simpleModel(2)), { ...BOOKTABS, headerFontSize: px(40) });
    expect(t.strokes!.map((s) => +s.widthPx.toFixed(6))).toEqual([HEAVY, LIGHT, HEAVY]);
  });

  it('a table without header rows has no header rule', () => {
    const t = layout(tableResource(simpleModel(3, 0)), BOOKTABS);
    expect(t.strokes!.map((s) => +s.widthPx.toFixed(6))).toEqual([HEAVY, HEAVY]);
  });

  it('a head spanning three columns gets a trimmed rule under it, and only it', () => {
    const t = layout(tableResource(spanningModel(3)), BOOKTABS);
    const head = t.cells.find((c) => c.row === 0 && c.col === 1)!;
    const spans = t.strokes!.filter((s) => !full(s));
    expect(spans).toHaveLength(1);
    expect(spans[0]!.x1).toBeCloseTo(head.rect.x + TRIM, 6);
    expect(spans[0]!.x2).toBeCloseTo(head.rect.x + head.rect.width - TRIM, 6);
    expect(spans[0]!.y1).toBeCloseTo(t.rowEdges[1]!, 6);
    expect(spans[0]!.widthPx).toBeCloseTo(SPAN, 6);
    // Header rule under the second header row, not under the rowspan head.
    const header = t.strokes!.filter((s) => full(s) && Math.abs(s.widthPx - LIGHT) < 1e-6);
    expect(header).toHaveLength(1);
    expect(header[0]!.y1).toBeCloseTo(t.rowEdges[2]!, 6);
  });

  it("spanRules 'full' runs the whole cell, 'none' leaves it out", () => {
    const f = layout(tableResource(spanningModel(3)), { ...BOOKTABS, spanRules: 'full' });
    const head = f.cells.find((c) => c.row === 0 && c.col === 1)!;
    const span = f.strokes!.filter((s) => !full(s));
    expect(span).toHaveLength(1);
    expect(span[0]!.x1).toBeCloseTo(head.rect.x, 6);
    expect(span[0]!.x2).toBeCloseTo(head.rect.x + head.rect.width, 6);
    const n = layout(tableResource(spanningModel(3)), { ...BOOKTABS, spanRules: 'none' });
    expect(n.strokes!).toHaveLength(3);
    expect(n.strokes!.every(full)).toBe(true);
  });

  it('groupRules adds light rules above group-head rows, not at the top of a slice', () => {
    const model = spanningModel(12, true);
    const off = layout(tableResource(model), BOOKTABS);
    expect(off.strokes!.filter(full)).toHaveLength(3);
    const on = layout(tableResource(model), { ...BOOKTABS, groupRules: true });
    // Group heads at body rows 0, 5 and 10 (model rows 2, 7, 12): the first
    // follows the header rule straight away.
    const ruleYs = on.strokes!.filter((s) => full(s) && Math.abs(s.widthPx - LIGHT) < 1e-6).map((s) => s.y1);
    const top = (row: number) => on.cells.find((c) => c.row === row)!.rect.y;
    expect(ruleYs).toHaveLength(3);
    expect(ruleYs[0]).toBeCloseTo(on.rowEdges[2]!, 6); // header rule
    expect(ruleYs).toContainEqual(top(7));
    expect(ruleYs).toContainEqual(top(12));
    // A continuation that opens on a group head: no group rule over it.
    const slice = layout(tableResource(model), { ...BOOKTABS, groupRules: true }, { startRow: 7, endRow: 14, continues: false });
    const sliceYs = slice.strokes!.filter((s) => Math.abs(s.widthPx - LIGHT) < 1e-6 && full(s)).map((s) => s.y1);
    const sliceTop = (row: number) => slice.cells.find((c) => c.row === row)!.rect.y;
    // The header rule (which the opening group head sits on) and the rule
    // over the next group head.
    expect(sliceYs).toHaveLength(2);
    expect(sliceYs[0]).toBeCloseTo(slice.rowEdges[2]!, 6);
    expect(sliceTop(7)).toBeCloseTo(slice.rowEdges[2]!, 6);
    expect(sliceYs[1]).toBeCloseTo(sliceTop(12), 6);
  });

  it('a split table: every slice has the top and header rules; only the last one the heavy bottom rule', () => {
    const model = simpleModel(30);
    const parts: TableSliceSpec[] = [
      { startRow: 0, endRow: 11, continues: true },
      { startRow: 11, endRow: 21, continues: true },
      { startRow: 21, endRow: 31, continues: false },
    ];
    const tables = parts.map((p) => layout(tableResource(model), BOOKTABS, p));
    for (const [i, t] of tables.entries()) {
      const s = t.strokes!;
      expect(s).toHaveLength(3);
      expect(s[0]).toMatchObject({ y1: 0, widthPx: HEAVY });
      expect(s[1]!.y1).toBeCloseTo(t.rowEdges[1]!, 6);
      expect(s[1]!.widthPx).toBeCloseTo(LIGHT, 6);
      expect(s[2]!.y1).toBeCloseTo(t.rowEdges[t.rowEdges.length - 1]!, 6);
      expect(s[2]!.widthPx).toBeCloseTo(i < 2 ? LIGHT : HEAVY, 6);
    }
    const bottom = layout(tableResource(model), { ...BOOKTABS, continuedFootRule: 'bottom' }, parts[0]);
    expect(bottom.strokes![2]!.widthPx).toBeCloseTo(HEAVY, 6);
    const none = layout(tableResource(model), { ...BOOKTABS, continuedFootRule: 'none' }, parts[1]);
    expect(none.strokes!).toHaveLength(2);
  });

  it('a table that runs right to left puts the span rule under the mirrored head', () => {
    const t = layout(tableResource(spanningModel(3), { direction: 'rtl' }), BOOKTABS);
    const head = t.cells.find((c) => c.row === 0 && c.col === 1)!;
    // The spanning head covers columns 1–3: on the left once mirrored.
    expect(head.rect.x).toBeCloseTo(0, 6);
    const span = t.strokes!.filter((s) => !full(s));
    expect(span).toHaveLength(1);
    expect(span[0]!.x1).toBeCloseTo(head.rect.x + TRIM, 6);
    expect(span[0]!.x2).toBeCloseTo(head.rect.x + head.rect.width - TRIM, 6);
  });

  it('borders: false and widths of 0 drop the rules', () => {
    const off = layout(tableResource(simpleModel(2)), { ...BOOKTABS, borders: false });
    expect(off.strokes).toBeUndefined();
    expect(off.borderWidthPx).toBe(0);
    const noHeavy = layout(tableResource(simpleModel(2)), { ...BOOKTABS, heavyRuleWidth: pt(0) });
    expect(noHeavy.strokes!).toHaveLength(1);
  });

  it('fractional widths survive', () => {
    const t = layout(tableResource(simpleModel(2)), { rules: 'booktabs', lightRuleWidth: pt(0.4) });
    const dpi = resolveAllConfig().page.dpi;
    expect(t.strokes![1]!.widthPx).toBeCloseTo(0.4 * (dpi / 72), 6);
  });

  it('the other patterns carry no strokes', () => {
    for (const rules of ['grid', 'horizontal', 'outer', 'none'] as const) {
      const t = layout(tableResource(spanningModel(4, true)), { rules });
      expect('strokes' in t).toBe(false);
      expect(JSON.stringify(t)).not.toContain('strokes');
    }
    expect('strokes' in layout(tableResource(simpleModel(2)), undefined)).toBe(false);
  });

  it('the caption bar overhangs the body by half the heavy rule', () => {
    const resourceTypes = defaultResourceTypes();
    const resource = tableResource(simpleModel(2));
    const resolved = resolveAllConfig({ tableStyle: BOOKTABS, captionStyle: { backgroundEnabled: true } });
    const { block } = layoutResourceBlock({
      resource,
      resourceType: resourceTypes.find((t) => t.id === 'table'),
      number: '1',
      resolved,
      columnWidth: COLUMN_WIDTH,
      resourceNumbering: { [resource.id]: { number: '1', typeId: 'table', heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
      resourceTypes,
      resources: [resource],
    });
    expect(block.captionBar!.rect.x).toBeCloseTo(-HEAVY / 2, 6);
  });
});

describe('booktabs renderers', () => {
  const resource: Resource = { ...tableResource(spanningModel(6, true)), placement: { span: 'column' } };
  const config: PostextConfig = { tableStyle: { ...BOOKTABS, groupRules: true, borderColor: { hex: '#123456', model: 'hex' } } };
  const doc = buildDocument({ markdown: `See :ref{id="tab-1"}.\n\nSome text after the table.`, resources: [resource] }, config);
  const block = doc.pages.flatMap((p) => [...p.columns.flatMap((c) => c.blocks), ...(p.floats ?? [])])
    .find((b) => b.resourceBlock?.table) as VDTBlock;
  const rb = block.resourceBlock!;
  const t = rb.table!;
  const bx = block.bbox.x + rb.bodyRect.x;
  const by = block.bbox.y + rb.bodyRect.y;
  /** The strokes on the page, rounded for comparison. */
  const expected = t.strokes!.map((s) => [s.x1 + bx, s.y1 + by, s.x2 + bx, s.y2 + by, s.widthPx].map((v) => +v.toFixed(3)));

  it('the canvas strokes exactly the layout strokes', () => {
    const lines: number[][] = [];
    let width = 0;
    let from: [number, number] = [0, 0];
    const ctx = new Proxy({} as Record<string | symbol, unknown>, {
      get(target, key) {
        if (key === 'moveTo') return (x: number, y: number) => { from = [x, y]; };
        if (key === 'lineTo') return (x: number, y: number) => { lines.push([from[0], from[1], x, y, width].map((v) => +v.toFixed(3))); };
        if (key in target) return target[key];
        if (key === 'measureText') return () => ({ width: 0 });
        return () => undefined;
      },
      set(target, key, value) {
        if (key === 'lineWidth') width = value as number;
        target[key] = value;
        return true;
      },
    }) as unknown as CanvasRenderingContext2D;
    renderResourceBlock(ctx, block);
    expect(lines).toEqual(expected);
  });

  it('the HTML viewer draws one box per stroke, centred on it', () => {
    const html = renderToHtml(doc);
    const boxes = [...html.matchAll(/<div aria-hidden="true" style="position:absolute;left:([\d.-]+)px;top:([\d.-]+)px;width:([\d.-]+)px;height:([\d.-]+)px;background:#123456;"><\/div>/g)]
      .map((m) => {
        const [x, y, w, h] = m.slice(1, 5).map(Number) as [number, number, number, number];
        return [x, y + h / 2, x + w, y + h / 2, h].map((v) => +v.toFixed(3));
      });
    expect(boxes).toEqual(expected);
    expect(expected.length).toBeGreaterThanOrEqual(5);
  });
});
