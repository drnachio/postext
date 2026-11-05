import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { flowRectToPage, resourceBlockRectToPage } from '../../vdt.js';
import type { PostextConfig, Resource, TableCell } from '../../index.js';
import { documentDisplayList, pageDisplayList } from './index.js';
import type { DisplayItem, DisplayPage } from './types.js';

// Deterministic stub: every character is 7 px wide.
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

const pt = (value: number) => ({ value, unit: 'pt' as const });
type TextItem = Extract<DisplayItem, { kind: 'text' }>;
type TableItem = Extract<DisplayItem, { kind: 'table' }>;
const textItems = (pages: DisplayPage[]): TextItem[] => pages.flatMap((p) => p.items.filter((i): i is TextItem => i.kind === 'text'));
const centre = (r: { x: number; y: number; width: number; height: number }) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });

describe('display list frames (#1388)', () => {
  it('turns a vertical page\'s flow a quarter turn onto the sheet', () => {
    const md = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわをん';
    const doc = buildDocument({ markdown: md }, {
      locale: 'ja',
      page: { dpi: 72, width: pt(215), height: pt(240), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single', writingMode: 'vertical-rl' },
      headings: { balancing: { enabled: false } },
      header: { elements: [] },
      footer: { elements: [] },
    } as PostextConfig);
    const page = doc.pages[0]!;
    expect(page.flow?.writingMode).toBe('vertical-rl');
    const dl = pageDisplayList(doc, 0);
    expect(dl.vertical).toBe(true);
    const block = page.columns[0]!.blocks[0]!;
    const item = textItems([dl]).find((i) => i.role === 'body')!;
    expect(item.rotate).toBe(90);
    // The unturned box keeps the flow's size, centred where the flow box
    // lands on the sheet.
    const sheet = flowRectToPage(page, block.bbox);
    expect(centre(item.bbox).x).toBeCloseTo(centre(sheet).x, 6);
    expect(centre(item.bbox).y).toBeCloseTo(centre(sheet).y, 6);
    expect(item.bbox.width).toBeCloseTo(block.bbox.width, 6);
    // Lines keep their flow geometry relative to the box.
    block.lines.forEach((l, i) => {
      const line = item.lines[i]!;
      expect(line.vertical).toBe(true);
      expect(line.baseline - item.bbox.y).toBeCloseTo(l.baseline - block.bbox.y, 6);
      expect(line.x - item.bbox.x).toBeCloseTo(l.bbox.x - block.bbox.x, 6);
    });
    for (const line of item.lines) line.map.forEach((off, i) => { if (off >= 0) expect(md[off]).toBe(line.text[i]); });
  });

  it('turns a rotated table with its caption and maps cells into the resource', () => {
    const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });
    const res: Resource = {
      id: 't1', typeId: 'table', kind: 'table', caption: 'Services and benefits.', createdAt: 0, updatedAt: 0,
      table: {
        model: {
          headerRowCount: 1,
          rows: [
            [cell('Service', { isHeader: true }), cell('Grade I', { isHeader: true }), cell('Grade II', { isHeader: true })],
            ...Array.from({ length: 4 }, (_, i) => [cell(`Service ${i + 1}`), cell('Yes'), cell('No')]),
          ],
        },
      },
      placement: { rotate: 'ccw' },
    } as Resource;
    const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the column.`;
    const md = `${para(0)} :ref{id="t1"}\n\n${Array.from({ length: 6 }, (_, i) => para(i + 1)).join('\n\n')}`;
    const doc = buildDocument({ markdown: md, resources: [res] }, {
      page: { width: pt(400), height: pt(500), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
      headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
      header: { elements: [] },
      footer: { elements: [] },
    } as PostextConfig);
    const at = doc.pages.findIndex((p) => (p.floats ?? []).some((b) => b.resourceBlock?.resource.id === 't1'));
    expect(at).toBeGreaterThanOrEqual(0);
    const block = doc.pages[at]!.floats!.find((b) => b.resourceBlock?.resource.id === 't1')!;
    const rb = block.resourceBlock!;
    expect(rb.rotation?.direction).toBe('ccw');
    const dl = documentDisplayList(doc)[at]!;
    const table = dl.items.find((i): i is TableItem => i.kind === 'table')!;
    expect(table.rotate).toBe(-90);
    // Centred where the upright body lands on the page.
    const rows = rb.table!.rowEdges;
    const body = resourceBlockRectToPage(rb, { x: rb.bodyRect.x, y: rb.bodyRect.y, width: rb.bodyRect.width, height: rows[rows.length - 1]! });
    expect(centre(table.rect).x).toBeCloseTo(centre(body).x, 3);
    expect(table.rect.width).toBeCloseTo(rb.bodyRect.width, 6);
    // Cells sit inside the table, in its unturned frame, with their text.
    expect(table.cells).toHaveLength(15);
    for (const c of table.cells) {
      expect(c.rect.x).toBeGreaterThanOrEqual(table.rect.x - 0.5);
      expect(c.rect.x + c.rect.width).toBeLessThanOrEqual(table.rect.x + table.rect.width + 0.5);
      expect(c.item).not.toBeNull();
      const content = res.table!.model.rows[c.row]![c.col]!.content;
      const text = c.item!.lines.map((l) => l.text).join('');
      expect(c.item!.source!.resource).toEqual({ resourceId: 't1', field: 'cell', row: c.row, col: c.col });
      c.item!.source!.map.forEach((off, i) => { if (off >= 0) expect(content[off]).toBe(text[i]); });
      expect(c.item!.source!.map.filter((o) => o >= 0).length).toBe(content.length);
      for (const l of c.item!.lines) for (const r of l.runs) {
        expect(r.x).toBeGreaterThanOrEqual(c.rect.x - 0.5);
        expect(r.x + r.width).toBeLessThanOrEqual(c.rect.x + c.rect.width + 0.5);
      }
    }
    expect(table.columnEdges).toHaveLength(4);
    const caption = textItems([dl]).find((i) => i.role === 'caption')!;
    expect(caption.rotate).toBe(-90);
  });

  it('marks running heads as generated text', () => {
    const doc = buildDocument({ markdown: 'Some text on the page.' }, {
      page: { dpi: 72, width: pt(300), height: pt(400), margins: { top: pt(40), bottom: pt(40), left: pt(20), right: pt(20) } },
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [{ kind: 'text', id: 'folio', content: 'Page {pageNumber}.', fontSize: pt(8), overflow: 'wrap', align: 'start', placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: 'fill' } } }] },
    } as PostextConfig);
    const dl = pageDisplayList(doc, 0);
    const footer = textItems([dl]).find((i) => i.role === 'footer')!;
    expect(footer.lines.map((l) => l.text).join('')).toBe('Page 1.');
    expect(footer.source!.generated).toBe(true);
    expect(footer.source!.map.every((o) => o === -1)).toBe(true);
    // Painted after the page's flow.
    expect(dl.items.indexOf(footer)).toBe(dl.items.length - 1);
  });
});
