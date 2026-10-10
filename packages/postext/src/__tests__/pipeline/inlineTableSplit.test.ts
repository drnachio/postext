import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { chooseTableSlice, MIN_TAIL_ROWS, type TableRowMetrics } from '../../pipeline/resourceLayout';
import type { PostextConfig, Resource, TableCell, VDTDocument, VDTBlock } from '../../index';

// Inline tables split across columns and pages (#634).

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

const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });
const pt = (value: number) => ({ value, unit: 'pt' as const });

/** A header row plus `n` body rows, placed where its `::resource` stands. */
const table = (id: string, n: number, extra: Partial<Resource> = {}, rows?: TableCell[][]): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: 'Activities by age group.',
  note: 'Source: the reference book.',
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: rows ?? [
        [cell('Task', { isHeader: true }), cell('Age', { isHeader: true })],
        ...Array.from({ length: n }, (_, i) => [cell(`Task ${i + 1}`), cell('Yes')]),
      ],
    },
  },
  placement: { position: 'here' },
  ...extra,
});

const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { layoutType: 'double', gutterWidth: pt(12) },
  bodyText: { fontSize: pt(10), lineHeight: pt(13) },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  header: { elements: [] },
  footer: { elements: [] },
};

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const build = (markdown: string, resources: Resource[], config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown, resources }, config);

/** The table's slices in the flow, in reading order, with their column. */
const slicesOf = (doc: VDTDocument, id: string) =>
  doc.pages.flatMap((page) => page.columns.flatMap((col) => col.blocks
    .filter((b) => b.type === 'resource' && b.resourceBlock?.resource.id === id)
    .map((block) => ({ page, col, block }))));
const rbOf = (b: VDTBlock) => b.resourceBlock!;
const captionText = (b: VDTBlock) => rbOf(b).captionLines.map((l) => l.text).join(' ');
const bodyRows = (b: VDTBlock) => rbOf(b).table!.cells.filter((c) => !c.isHeader).map((c) => c.row);

/** Three paragraphs, then a 40-row table, then a closing paragraph. */
const MD = `${filler(3)}\n\n::resource{id="tab"}\n\nThe paragraph after the table.\n\n${filler(4, 10)}`;

describe('inline tables split between rows (#634)', () => {
  it('a 40-row table continues column after column, header repeated, caption suffixed, note on the last slice', () => {
    const doc = build(MD, [table('tab', 40)]);
    const slices = slicesOf(doc, 'tab');
    expect(slices.length).toBeGreaterThan(1);
    let next = 0;
    slices.forEach(({ block }, i) => {
      const rb = rbOf(block);
      const slice = rb.slice!;
      expect(slice.startRow).toBe(next);
      next = slice.endRow;
      expect(slice.continued).toBe(i > 0);
      expect(slice.continues).toBe(i < slices.length - 1);
      // The header row is laid out on every slice.
      const header = rb.table!.cells.filter((c) => c.isHeader);
      expect(header.length).toBe(2);
      expect(header.every((c) => c.row === 0)).toBe(true);
      expect(captionText(block).includes('(cont.)')).toBe(i > 0);
      expect(rb.continuesLines.length > 0).toBe(i < slices.length - 1);
      expect(rb.noteLines.length > 0).toBe(i === slices.length - 1);
    });
    expect(next).toBe(41);
    // Each continuation opens its column, with no gap above it.
    for (const { col, block } of slices.slice(1)) {
      expect(col.blocks[0]).toBe(block);
      expect(block.bbox.y).toBeCloseTo(col.bbox.y, 6);
    }
    // The first slice keeps at least the header and two body rows; the
    // last at least three rows.
    expect(bodyRows(slices[0]!.block).length / 2).toBeGreaterThanOrEqual(2);
    expect(new Set(bodyRows(slices[slices.length - 1]!.block)).size).toBeGreaterThanOrEqual(MIN_TAIL_ROWS);
    // Every slice sits in its column.
    for (const { col, block } of slices) {
      expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(col.bbox.y + col.bbox.height + 0.5);
    }
    // The paragraph after the table follows its last slice, below it.
    const last = slices[slices.length - 1]!;
    const after = last.col.blocks[last.col.blocks.indexOf(last.block) + 1]!;
    expect(after.lines[0]!.text).toContain('The paragraph after');
    expect(after.bbox.y).toBeGreaterThan(last.block.bbox.y + last.block.bbox.height);
  });

  it('the first slice fills the column the table starts in', () => {
    const doc = build(MD, [table('tab', 40)]);
    const [first] = slicesOf(doc, 'tab');
    // Preceded by the paragraphs, it takes the rest of the column.
    expect(first!.col.blocks.indexOf(first!.block)).toBeGreaterThan(0);
    const room = first!.col.bbox.y + first!.col.bbox.height - (first!.block.bbox.y + first!.block.bbox.height);
    expect(room).toBeLessThan(40);
  });

  it('splitInline: false moves the table whole, as up to postext 1.24', () => {
    const doc = build(MD, [table('tab', 12)], { ...PAGE, tableStyle: { splitInline: false } });
    const slices = slicesOf(doc, 'tab');
    expect(slices).toHaveLength(1);
    expect(rbOf(slices[0]!.block).slice).toBeUndefined();
  });

  it('a table that fits its column is placed whole and unchanged', () => {
    const md = `Intro paragraph.\n\n::resource{id="tab"}\n\nAfter.`;
    const a = build(md, [table('tab', 5)]);
    const b = build(md, [table('tab', 5)], { ...PAGE, tableStyle: { splitInline: false } });
    const sa = slicesOf(a, 'tab');
    expect(sa).toHaveLength(1);
    expect(rbOf(sa[0]!.block).slice).toBeUndefined();
    expect(JSON.stringify(a.pages)).toBe(JSON.stringify(b.pages));
  });

  it('a short table that does not fit moves whole (too few rows to cut)', () => {
    const md = `${filler(5)}\n\n::resource{id="tab"}\n\nAfter.`;
    const doc = build(md, [table('tab', 4)]);
    expect(slicesOf(doc, 'tab')).toHaveLength(1);
  });

  it('never cuts through a rowspan, nor leaves a group head at a slice foot', () => {
    const rows: TableCell[][] = [[cell('Group', { isHeader: true }), cell('Item', { isHeader: true })]];
    for (let g = 0; g < 10; g++) {
      rows.push([cell(`Group ${g}`, { colSpan: 2 })]);
      rows.push([cell(`Span ${g}`, { rowSpan: 3 }), cell('a')]);
      rows.push([cell('b')]);
      rows.push([cell('c')]);
    }
    const doc = build(MD, [table('tab', 0, {}, rows)]);
    const slices = slicesOf(doc, 'tab');
    expect(slices.length).toBeGreaterThan(1);
    for (const { block } of slices.slice(0, -1)) {
      const end = rbOf(block).slice!.endRow;
      // Rows 1, 5, 9… are group heads; 2–4, 6–8… a rowspan of three.
      const k = (end - 1) % 4;
      expect(k).toBe(0); // the slice ends after the last row of a span
    }
  });

  it("'clip' keeps the leading rows of a table taller than a column, at a column head", () => {
    const doc = build(MD, [table('tab', 80)], { ...PAGE, tableStyle: { overflow: 'clip' } });
    const slices = slicesOf(doc, 'tab');
    expect(slices).toHaveLength(1);
    const { col, block } = slices[0]!;
    const rb = rbOf(block);
    expect(col.blocks[0]).toBe(block);
    expect(rb.slice).toEqual(expect.objectContaining({ startRow: 0, continued: false, continues: false }));
    expect(rb.slice!.endRow).toBeLessThan(81);
    expect(rb.continuesLines).toEqual([]);
    expect(block.bbox.y + block.bbox.height).toBeLessThanOrEqual(col.bbox.y + col.bbox.height + 0.5);
  });

  it("'hide' leaves out a table taller than a column; a shorter one stays", () => {
    const hidden = build(MD, [table('tab', 80)], { ...PAGE, tableStyle: { overflow: 'hide' } });
    expect(slicesOf(hidden, 'tab')).toHaveLength(0);
    const kept = build(MD, [table('tab', 12)], { ...PAGE, tableStyle: { overflow: 'hide' } });
    expect(slicesOf(kept, 'tab')).toHaveLength(1);
  });

  it('a named table style decides for its own tables', () => {
    const config: PostextConfig = { ...PAGE, tableStyles: [{ id: 'whole', splitInline: false }] };
    const doc = build(MD, [table('tab', 40, { table: { styleId: 'whole', model: table('x', 40).table!.model } })], config);
    expect(slicesOf(doc, 'tab')).toHaveLength(1);
  });

  it('a continuation in a column of another width is laid out at that width', () => {
    const config: PostextConfig = {
      ...PAGE,
      page: { width: pt(400), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'oneAndHalf', sideColumnRole: 'text', sideColumnPercent: 30, gutterWidth: pt(10) },
    };
    const doc = build(`${filler(2)}\n\n::resource{id="tab"}\n\nAfter.`, [table('tab', 40)], config);
    const slices = slicesOf(doc, 'tab');
    expect(slices.length).toBeGreaterThan(1);
    const widths = new Set(slices.map(({ col }) => col.bbox.width.toFixed(1)));
    expect(widths.size).toBeGreaterThan(1);
    for (const { col, block } of slices) {
      expect(rbOf(block).bodyRect.width).toBeLessThanOrEqual(col.bbox.width + 0.5);
      expect(rbOf(block).bodyRect.width).toBeGreaterThan(col.bbox.width * 0.9);
    }
  });

  it('a waiting page-wide top float takes the head of the page the table goes on to (EF-160)', () => {
    const fig: Resource = {
      id: 'fig', typeId: 'figure', kind: 'svg', caption: 'A figure.', createdAt: 0, updatedAt: 0,
      svg: { fileId: 'f.svg', width: 400, height: 40 },
      placement: { position: 'top', span: 'page' },
    };
    // The figure is cited in the column the table starts in, too late
    // for a slot on that page.
    const md = `${filler(6)}\n\nSee :ref{id="fig"}.\n\n::resource{id="tab"}\n\nAfter.\n\n${filler(6, 20)}`;
    const doc = build(md, [table('tab', 60), fig]);
    const slices = slicesOf(doc, 'tab');
    expect(slices.length).toBeGreaterThan(1);
    const figPage = doc.pages.find((p) => (p.floats ?? []).some((f) => f.resourceBlock?.resource.id === 'fig'))!;
    const firstSlicePage = slices[0]!.page.index;
    // The figure heads the page right after the table's first slice, and a
    // slice of the table runs on under it.
    expect(figPage.index).toBe(firstSlicePage + 1);
    expect(slices.some(({ page }) => page.index === figPage.index)).toBe(true);
  });

  it('builds twice to the same pages with balancing on', () => {
    const config: PostextConfig = { ...PAGE, headings: { balancing: { enabled: true }, levels: [{ level: 1, breakBefore: { enabled: false } }] } };
    const md = `# Title\n\n${MD}`;
    const a = build(md, [table('tab', 40)], config);
    const b = build(md, [table('tab', 40)], config);
    expect(JSON.stringify(a.pages)).toBe(JSON.stringify(b.pages));
    expect(slicesOf(a, 'tab').length).toBeGreaterThan(1);
  });
});

describe('chooseTableSlice', () => {
  const metrics = (n: number, header = 1): TableRowMetrics => ({
    rowHeights: Array.from({ length: n }, () => 10),
    headerRowCount: header,
    breakableAfter: Array.from({ length: n }, () => true),
    groupHeaderRow: Array.from({ length: n }, () => false),
  });

  it('cuts at the rows the budget holds and hands rows to a short tail', () => {
    const m = metrics(21);
    expect(chooseTableSlice(m, 0, 100, { floor: 3, force: false, split: true, fits: () => true }))
      .toEqual({ startRow: 0, endRow: 10, continues: true });
    // 19 of 21 rows fit: the closing slice would carry 2, so it gets 3.
    expect(chooseTableSlice(m, 0, 190, { floor: 3, force: false, split: true, fits: () => true })!.endRow).toBe(18);
  });

  it('returns null below the floor unless forced, and backs off while `fits` fails', () => {
    const m = metrics(21);
    expect(chooseTableSlice(m, 0, 20, { floor: 3, force: false, split: true, fits: () => true })).toBeNull();
    expect(chooseTableSlice(m, 0, 20, { floor: 3, force: true, split: true, fits: () => true })!.endRow).toBe(3);
    expect(chooseTableSlice(m, 0, 100, { floor: 3, force: false, split: true, fits: (s) => s.endRow <= 7 })!.endRow).toBe(7);
    // `clip`: the leading rows, nothing goes on.
    expect(chooseTableSlice(m, 0, 100, { floor: 2, force: false, split: false, fits: () => true }))
      .toEqual({ startRow: 0, endRow: 10, continues: false });
  });
});
