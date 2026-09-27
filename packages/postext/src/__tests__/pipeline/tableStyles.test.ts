import { describe, it, expect } from 'vitest';
import { layoutResourceBlock } from '../../pipeline/resourceLayout';
import type { TableSliceSpec } from '../../pipeline/resourceLayout';
import { resolveAllConfig } from '../../pipeline/config';
import { buildDocument } from '../../pipeline';
import { defaultResourceTypes } from '../../defaults/resourceTypes';
import { renderToHtml } from '../../html-backend';
import { renderPageToCanvas } from '../../canvas-backend';
import { tableCellFill, tableCellFillRects, tableFrameOutline } from '../../vdt';
import { stripTableStyleDefaults } from '../../defaults/tableStyle';
import { dimensionToPx } from '../../units';
import type { PostextConfig, Resource, TableCell, TableModel } from '../../types';

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

const COLUMN_WIDTH = 400;
const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

function model(n = 3): TableModel {
  return {
    headerRowCount: 1,
    rows: [
      [cell('Task', { isHeader: true }), cell('Done', { isHeader: true })],
      ...Array.from({ length: n }, (_, i) => [cell(`Task ${i + 1}`), cell('Yes')]),
    ],
  };
}

const table = (id: string, styleId?: string, rows = 3, extra: Partial<Resource> = {}): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: 'A table.',
  createdAt: 0,
  updatedAt: 0,
  table: { model: model(rows), ...(styleId ? { styleId } : {}) },
  ...extra,
});

function layout(resource: Resource, config?: PostextConfig, slice?: TableSliceSpec) {
  const resourceTypes = config?.resourceTypes ?? defaultResourceTypes();
  return layoutResourceBlock({
    resource,
    resourceType: resourceTypes.find((t) => t.id === resource.typeId),
    number: '1',
    resolved: resolveAllConfig(config),
    columnWidth: COLUMN_WIDTH,
    resourceNumbering: { [resource.id]: { number: '1', typeId: resource.typeId, heading: { h1: 0, h2: 0, h3: 0, h4: 0, h5: 0, h6: 0 } } },
    resourceTypes,
    resources: [resource],
    ...(slice ? { slice } : {}),
  });
}

const STYLES: PostextConfig = {
  tableStyle: { borderColor: hex('#163a76'), borderWidth: pt(1.3), borderRadius: pt(10) },
  tableStyles: [
    {
      id: 'option',
      name: 'Option row',
      rules: 'outer',
      borderColor: hex('#7a9cc6'),
      borderWidth: pt(1),
      borderRadius: pt(8),
      cellPadding: pt(6),
      bodyFontFamily: 'Georgia',
      headerBackgroundEnabled: false,
    },
    { id: 'plain', borderRadius: pt(0) },
  ],
};

describe('named table styles', () => {
  it('two tables in one document take different borders, rules, padding and fonts', () => {
    const resolved = resolveAllConfig(STYLES);
    const dpi = resolved.page.dpi;
    const global = layout(table('a'), STYLES).block.table!;
    const option = layout(table('b', 'option'), STYLES).block.table!;
    expect(global.rules).toBe('grid');
    expect(global.borderColor).toBe('#163a76');
    expect(global.borderWidthPx).toBeCloseTo(dimensionToPx(pt(1.3), dpi), 6);
    expect(global.headerBackground).toBeDefined();
    expect(option.rules).toBe('outer');
    expect(option.borderColor).toBe('#7a9cc6');
    expect(option.borderWidthPx).toBeCloseTo(dimensionToPx(pt(1), dpi), 6);
    expect(option.headerBackground).toBeUndefined();
    expect(option.fontString).toContain('Georgia');
    expect(global.fontString).not.toContain('Georgia');
    // Padding: the first text line sits `cellPadding` below the cell top.
    const firstLineY = (t: typeof global) => t.cells.find((c) => c.row === 1 && c.col === 0)!;
    const pad = (t: typeof global) => firstLineY(t).lines[0]!.bbox.y - firstLineY(t).rect.y;
    expect(pad(option)).toBeCloseTo(dimensionToPx(pt(6), dpi), 6);
    expect(pad(global)).not.toBeCloseTo(pad(option), 3);
  });

  it('inherits unset fields from the global tableStyle', () => {
    const option = layout(table('b', 'option'), STYLES).block.table!;
    const global = layout(table('a'), STYLES).block.table!;
    // Header typography is unset in both: the same resolved fonts.
    expect(option.headerFontString).toBe(global.headerFontString);
    expect(option.headerColor).toBe(global.headerColor);
    // A style that sets nothing but its id is the global style.
    const bare = layout(table('c'), { ...STYLES, tableStyles: [{ id: 'bare' }] }).block.table!;
    const bareStyled = layout(table('c', 'bare'), { ...STYLES, tableStyles: [{ id: 'bare' }] }).block.table!;
    expect(bareStyled).toEqual(bare);
  });

  it('falls back to the global style for an unknown or unset id', () => {
    const global = layout(table('a'), STYLES).block.table!;
    const unknown = layout(table('c', 'missing'), STYLES).block.table!;
    expect(unknown.borderColor).toBe(global.borderColor);
    expect(unknown.rules).toBe(global.rules);
    expect(unknown.frameRadii).toEqual(global.frameRadii);
  });

  it('resolves palette colours in a named style', () => {
    const config: PostextConfig = {
      colorPalette: [{ id: 'accent', name: 'Accent', value: hex('#abcdef') }],
      tableStyles: [{ id: 'tinted', borderColor: { hex: '#000000', model: 'hex', paletteId: 'accent' } }],
    };
    expect(layout(table('a', 'tinted'), config).block.table!.borderColor).toBe('#abcdef');
  });
});

describe('table borderRadius', () => {
  it('is absent by default (square frame, unchanged layout)', () => {
    const plain = layout(table('a'));
    expect(plain.block.table!.frameRadii).toBeUndefined();
    // A zero radius in a named style also keeps the frame square.
    expect(layout(table('a', 'plain'), STYLES).block.table!.frameRadii).toBeUndefined();
  });

  it('rounds all four corners of a whole table', () => {
    const dpi = resolveAllConfig(STYLES).page.dpi;
    const r = dimensionToPx(pt(10), dpi);
    expect(layout(table('a'), STYLES).block.table!.frameRadii).toEqual([r, r, r, r]);
    const r8 = dimensionToPx(pt(8), dpi);
    expect(layout(table('b', 'option'), STYLES).block.table!.frameRadii).toEqual([r8, r8, r8, r8]);
  });

  it('is clamped to half the table height', () => {
    const config: PostextConfig = { tableStyle: { borderRadius: pt(500) } };
    const t = layout(table('a', undefined, 1), config).block.table!;
    const h = t.rowEdges[t.rowEdges.length - 1]!;
    expect(t.frameRadii).toEqual([h / 2, h / 2, h / 2, h / 2]);
  });

  it('a split table rounds the top of its first part and the bottom of its last', () => {
    const r = dimensionToPx(pt(10), resolveAllConfig(STYLES).page.dpi);
    const res = table('a', undefined, 12);
    const first = layout(res, STYLES, { startRow: 0, endRow: 5, continues: true }).block.table!;
    const middle = layout(res, STYLES, { startRow: 5, endRow: 9, continues: true }).block.table!;
    const last = layout(res, STYLES, { startRow: 9, endRow: 13, continues: false }).block.table!;
    expect(first.frameRadii).toEqual([r, r, 0, 0]);
    expect(middle.frameRadii).toBeUndefined();
    expect(last.frameRadii).toEqual([0, 0, r, r]);
  });

  it('tableFrameOutline grows the rounded corners only', () => {
    const t = { rowEdges: [0, 10, 40], frameRadii: [4, 4, 0, 0] as [number, number, number, number] };
    expect(tableFrameOutline(t, 5, 6, 100, 1)).toEqual({ x: 4, y: 5, width: 102, height: 42, radii: [5, 5, 0, 0] });
  });

  it('the HTML backend clips the fills and rounds the frame', () => {
    const PAGE: PostextConfig = {
      ...STYLES,
      page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    };
    const doc = buildDocument({ markdown: 'Text :ref{id="a"} and :ref{id="b"}.', resources: [table('a'), table('b', 'option')] }, PAGE);
    const html = renderToHtml(doc);
    expect(html).toContain('overflow:hidden;border-radius:');
    const bordered = html.match(/border:[^;]+solid #163a76;border-radius:/g) ?? [];
    expect(bordered.length).toBe(1);
    expect(html).toMatch(/solid #7a9cc6;border-radius:/);
  });
});

describe('per-style overflow', () => {
  const PAGE: PostextConfig = {
    page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
    headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
    tableStyles: [{ id: 'hidden', overflow: 'hide' }],
  };
  const filler = Array.from({ length: 30 }, (_, i) => `Paragraph ${i} carries enough words to take a few lines of the narrow column.`).join('\n\n');

  it("a style's overflow applies to its tables only", () => {
    const resources = [
      table('split', undefined, 60, { placement: { span: 'page' } }),
      table('gone', 'hidden', 60, { placement: { span: 'page' } }),
    ];
    const doc = buildDocument({ markdown: `See :ref{id="split"} and :ref{id="gone"}.\n\n${filler}`, resources }, PAGE);
    const slices = (id: string) => doc.pages.flatMap((p) => (p.floats ?? []).filter((b) => b.resourceBlock!.resource.id === id));
    expect(slices('split').length).toBeGreaterThan(1);
    expect(slices('gone')).toHaveLength(0);
  });
});

describe('zebra rows (bodyAlternateBackground)', () => {
  const ZEBRA: PostextConfig = {
    tableStyle: { bodyBackgroundEnabled: true, bodyBackground: hex('#ffffff'), bodyAlternateBackgroundEnabled: true, bodyAlternateBackground: hex('#eef3fa') },
  };
  const striped = (t: { cells: { row: number; col: number; alternate?: boolean }[] }) =>
    [...new Set(t.cells.filter((c) => c.alternate).map((c) => c.row))];

  it('is off by default: no alternate cells, no alternate fill, the same table as before', () => {
    const t = layout(table('a', undefined, 4)).block.table!;
    expect(striped(t)).toEqual([]);
    expect(t.bodyAlternateBackground).toBeUndefined();
    expect(Object.keys(t)).not.toContain('bodyAlternateBackground');
    // A colour alone does not switch it on.
    const colourOnly = layout(table('a', undefined, 4), { tableStyle: { bodyAlternateBackground: hex('#eef3fa') } }).block.table!;
    expect(colourOnly).toEqual(t);
  });

  it('stripes every second body row, counting from the row after the header', () => {
    const t = layout(table('a', undefined, 5), ZEBRA).block.table!;
    expect(t.bodyAlternateBackground).toBe('#eef3fa');
    // Row 0 is the header; body rows 1–5: the 2nd and 4th are alternate.
    expect(striped(t)).toEqual([2, 4]);
    const fill = (row: number) => tableCellFill(t, t.cells.find((c) => c.row === row && c.col === 0)!);
    expect([0, 1, 2, 3].map(fill)).toEqual([t.headerBackground, '#ffffff', '#eef3fa', '#ffffff']);
  });

  it('keeps a cell fill over the stripe and the stripe of a merged cell’s first row', () => {
    const m: TableModel = {
      headerRowCount: 1,
      rows: [
        [cell('H', { isHeader: true }), cell('I', { isHeader: true })],
        [cell('a'), cell('b')],
        [cell('c', { rowSpan: 2 }), cell('d', { background: hex('#ff0000') })],
        [cell('', { hiddenBy: { row: 2, col: 0 } }), cell('f')],
      ],
    };
    const t = layout({ ...table('m'), table: { model: m } }, ZEBRA).block.table!;
    const at = (row: number, col: number) => t.cells.find((c) => c.row === row && c.col === col)!;
    expect(at(2, 0).alternate).toBe(true);
    expect(tableCellFill(t, at(2, 1))).toBe('#ff0000');
    expect(at(3, 1).alternate).toBeUndefined();
  });

  it('a continued slice keeps every row’s stripe', () => {
    const res = table('a', undefined, 12);
    const whole = layout(res, ZEBRA).block.table!;
    const part = layout(res, ZEBRA, { startRow: 6, endRow: 13, continues: false }).block.table!;
    const rowsOf = (t: typeof whole) => striped(t).filter((r) => r >= 6);
    expect(rowsOf(part)).toEqual(rowsOf(whole));
    expect(part.cells.filter((c) => c.row === 0).every((c) => !c.alternate)).toBe(true);
  });

  it('a named style sets its own zebra rows, and the default is stripped', () => {
    const config: PostextConfig = { tableStyles: [{ id: 'z', bodyAlternateBackgroundEnabled: true }] };
    expect(striped(layout(table('a', 'z', 4), config).block.table!)).toEqual([2, 4]);
    expect(layout(table('a', 'z', 4), config).block.table!.bodyAlternateBackground).toBe('#f2f2f2');
    expect(striped(layout(table('a', undefined, 4), config).block.table!)).toEqual([]);
    expect(stripTableStyleDefaults({ bodyAlternateBackgroundEnabled: false, bodyAlternateBackground: hex('#f2f2f2') })).toBeUndefined();
    expect(stripTableStyleDefaults({ bodyAlternateBackgroundEnabled: true })).toEqual({ bodyAlternateBackgroundEnabled: true });
  });

  it('follows the palette', () => {
    const config: PostextConfig = {
      colorPalette: [{ id: 'stripe', name: 'Stripe', value: hex('#123456') }],
      tableStyle: { bodyAlternateBackgroundEnabled: true, bodyAlternateBackground: { hex: '#000000', model: 'hex', paletteId: 'stripe' } },
    };
    expect(layout(table('a', undefined, 2), config).block.table!.bodyAlternateBackground).toBe('#123456');
  });

  it('the canvas backend paints the alternate fill', () => {
    const doc = buildDocument({ markdown: '::resource{id="a"}\n', resources: [table('a', undefined, 4, { placement: { position: 'here' } })] }, ZEBRA);
    const fills: string[] = [];
    const ctx: Record<string | symbol, unknown> = new Proxy({}, {
      get(target: Record<string | symbol, unknown>, key) {
        if (key === 'fillRect') return () => { fills.push(String(target.fillStyle)); };
        if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
        if (key in target) return target[key];
        return () => undefined;
      },
      set(target, key, value) { target[key] = value; return true; },
    });
    const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    expect(fills.filter((f) => f === '#eef3fa')).toHaveLength(4);
  });

  it('the HTML backend paints the alternate fill', () => {
    const doc = buildDocument({ markdown: '::resource{id="a"}\n', resources: [table('a', undefined, 4, { placement: { position: 'here' } })] }, ZEBRA);
    const html = renderToHtml(doc);
    // Four zebra cells, painted with the strips they run under their later
    // neighbours (EF-64, `tableCellFillRects`).
    const t = doc.blocks.find((b) => b.resourceBlock)!.resourceBlock!.table!;
    expect(t.cells.filter((c) => tableCellFill(t, c) === '#eef3fa')).toHaveLength(4);
    const painted = tableCellFillRects(t).filter((f) => f.fill === '#eef3fa').flatMap((f) => f.rects);
    expect((html.match(/background:#eef3fa;/g) ?? []).length).toBe(painted.length);
  });
});
