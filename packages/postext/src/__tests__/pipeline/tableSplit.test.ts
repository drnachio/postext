import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, TableCell, VDTDocument, VDTBlock } from '../../index';

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

/** A header row plus `n` body rows — far taller than a page for large `n`. */
const table = (id: string, n: number, extra: Partial<Resource> = {}): Resource => ({
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
      rows: [
        [cell('Task', { isHeader: true }), cell('3 to 6', { isHeader: true }), cell('7 to 10', { isHeader: true })],
        ...Array.from({ length: n }, (_, i) => [cell(`Task ${i + 1}`), cell('Yes'), cell('Yes')]),
      ],
    },
  },
  placement: { span: 'page' },
  ...extra,
});

const pt = (value: number) => ({ value, unit: 'pt' as const });

/** Two-column page with balancing off (single pass, deterministic). */
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
};

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const build = (markdown: string, resources: Resource[], config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown, resources }, config);

const floatsOf = (doc: VDTDocument, id: string) =>
  doc.pages.flatMap((p) => (p.floats ?? []).filter((b) => b.resourceBlock!.resource.id === id).map((b) => ({ page: p, block: b })));
const rbOf = (b: VDTBlock) => b.resourceBlock!;
const captionText = (b: VDTBlock) => rbOf(b).captionLines.map((l) => l.text).join(' ');
const withinContent = (page: VDTDocument['pages'][number], b: VDTBlock) =>
  b.bbox.y >= page.contentArea.y - 1e-6
  && b.bbox.y + b.bbox.height <= page.contentArea.y + page.contentArea.height + 1e-6;

describe('tables taller than the page', () => {
  const ROWS = 60;
  const markdown = `Intro :ref{id="tab"} text.\n\n${filler(40)}`;

  it('split (default): continues on the following pages with the header repeated', () => {
    const doc = build(markdown, [table('tab', ROWS)]);
    const slices = floatsOf(doc, 'tab');
    expect(slices.length).toBeGreaterThan(1);
    // One slice per page, on consecutive pages after the referencing page.
    for (let i = 1; i < slices.length; i++) {
      expect(slices[i]!.page.index).toBe(slices[i - 1]!.page.index + 1);
    }
    expect(slices[0]!.page.index).toBeGreaterThan(0);
    // Rows are carried in order, each exactly once, header rows excluded.
    let next = 0;
    for (let i = 0; i < slices.length; i++) {
      const { page, block } = slices[i]!;
      const rb = rbOf(block);
      const slice = rb.slice!;
      expect(slice).toBeDefined();
      expect(slice.startRow).toBe(next);
      expect(slice.endRow).toBeGreaterThan(slice.startRow);
      next = slice.endRow;
      expect(slice.continued).toBe(i > 0);
      expect(slice.continues).toBe(i < slices.length - 1);
      // Every slice sits inside its page.
      expect(withinContent(page, block)).toBe(true);
      // The header row is laid out on every slice, at its top.
      const header = rb.table!.cells.filter((c) => c.isHeader);
      expect(header).toHaveLength(3);
      expect(header.every((c) => c.row === 0)).toBe(true);
      expect(Math.min(...header.map((c) => c.rect.y))).toBeCloseTo(block.bbox.y + rb.bodyRect.y, 6);
      // Body rows of the slice only.
      const body = rb.table!.cells.filter((c) => !c.isHeader).map((c) => c.row);
      expect(Math.min(...body)).toBe(Math.max(1, slice.startRow));
      expect(Math.max(...body)).toBe(slice.endRow - 1);
      // Caption suffix, marker and note.
      expect(captionText(block).includes('(cont.)')).toBe(i > 0);
      expect(rb.continuesLines.length > 0).toBe(i < slices.length - 1);
      expect(rb.noteLines.length > 0).toBe(i === slices.length - 1);
      expect(block.id).toBe(i === 0 ? 'float-tab' : `float-tab-cont-${slice.startRow}`);
    }
    expect(next).toBe(ROWS + 1);
    // The text keeps flowing after the table.
    const lastSlicePage = slices[slices.length - 1]!.page.index;
    expect(doc.pages.length).toBeGreaterThan(lastSlicePage);
    const textAfter = doc.pages.slice(lastSlicePage).flatMap((p) => p.columns.flatMap((c) => c.blocks));
    expect(textAfter.length).toBeGreaterThan(0);
  });

  it('a slice fills its page: the columns under a page-span slice keep no text room', () => {
    const doc = build(markdown, [table('tab', ROWS)]);
    const first = floatsOf(doc, 'tab')[0]!;
    // Most of the page: at least 80% of the content height.
    expect(first.block.bbox.height).toBeGreaterThan(first.page.contentArea.height * 0.8);
  });

  it('clip: only the rows that fit the first page, note kept, no marker', () => {
    const doc = build(markdown, [table('tab', ROWS)], { ...PAGE, tableStyle: { overflow: 'clip' } });
    const slices = floatsOf(doc, 'tab');
    expect(slices).toHaveLength(1);
    const rb = rbOf(slices[0]!.block);
    expect(rb.slice).toEqual(expect.objectContaining({ startRow: 0, continued: false, continues: false }));
    expect(rb.slice!.endRow).toBeLessThan(ROWS + 1);
    expect(rb.continuesLines).toEqual([]);
    expect(rb.noteLines.length).toBeGreaterThan(0);
    expect(withinContent(slices[0]!.page, slices[0]!.block)).toBe(true);
  });

  it('hide: the table is left out', () => {
    const doc = build(markdown, [table('tab', ROWS)], { ...PAGE, tableStyle: { overflow: 'hide' } });
    expect(floatsOf(doc, 'tab')).toHaveLength(0);
    // The flow is unaffected: text still lays out.
    expect(doc.pages.length).toBeGreaterThan(1);
  });

  it('the closing slice never strands one or two rows under a repeated header', () => {
    // Sweep row counts so some would leave a one- or two-row tail.
    for (let rows = 24; rows <= 44; rows++) {
      const doc = build(markdown, [table('tab', rows)]);
      const slices = floatsOf(doc, 'tab');
      const last = rbOf(slices[slices.length - 1]!.block).slice;
      if (!last || !last.continued) continue;
      const bodyRows = last.endRow - last.startRow;
      expect(bodyRows, `${rows} rows → tail of ${bodyRows}`).toBeGreaterThanOrEqual(3);
      // Rows still add up.
      let next = 0;
      for (const { block } of slices) {
        expect(rbOf(block).slice!.startRow).toBe(next);
        next = rbOf(block).slice!.endRow;
      }
      expect(next).toBe(rows + 1);
    }
  });

  it('a table that fits a page is never sliced', () => {
    const doc = build(markdown, [table('tab', 6)]);
    const slices = floatsOf(doc, 'tab');
    expect(slices).toHaveLength(1);
    expect(rbOf(slices[0]!.block).slice).toBeUndefined();
  });

  it('Spanish documents mark continuations with "Continúa"', () => {
    const doc = build(markdown, [table('tab', ROWS)], { ...PAGE, locale: 'es' });
    const slices = floatsOf(doc, 'tab');
    expect(slices.length).toBeGreaterThan(1);
    expect(rbOf(slices[0]!.block).continuesLines[0]!.text).toBe('Continúa');
  });
});
