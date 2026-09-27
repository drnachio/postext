import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, Resource, TableCell, VDTDocument } from '../../index';

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

const words = 'numbers hang in the margin beside each heading so the reader can find a section at a glance while the text keeps its own measure'.split(' ');
const para = (n: number, s: number) => `${Array.from({ length: n }, (_, k) => words[(k * 5 + s) % words.length]).join(' ')}.`;
const cell = (content: string, extra: Partial<TableCell> = {}): TableCell => ({ content, ...extra });

/** An inline (`here`) table of `rows` body rows. */
const table = (rows: number): Resource => ({
  id: 'tab', typeId: 'table', kind: 'table', caption: 'Table.', createdAt: 0, updatedAt: 0,
  table: { model: { headerRowCount: 1, rows: [[cell('A', { isHeader: true }), cell('B', { isHeader: true })], ...Array.from({ length: rows }, (_, i) => [cell(`${i}`), cell(`Row ${i}`)])] } },
  placement: { position: 'here' },
});
/** A figure `height` px tall (at 400 px wide) that floats to the head of a page. */
const figure = (height: number, extra: Partial<Resource> = {}): Resource => ({
  id: 'fig', typeId: 'figure', kind: 'svg', caption: 'Figure.', createdAt: 0, updatedAt: 0,
  svg: { fileId: 'f.svg', width: 400, height },
  placement: { position: 'top', span: 'page' },
  ...extra,
});
const config: PostextConfig = { page: { sizePreset: '17x24', dpi: 100 }, layout: { layoutType: 'single' } };

/** The side-heads repro: the figure is cited on page 1, three paragraphs
 *  later an inline table does not fit page 1 and opens page 2. */
const build = (fig: Resource, rows = 12, before = 3): VDTDocument => {
  const paras = [
    ...Array.from({ length: 5 }, (_, i) => para(60, i)),
    `See :ref{id="fig"} for the layout. ${para(40, 9)}`,
    ...Array.from({ length: before }, (_, i) => para(60, 20 + i)),
    '::resource{id="tab"}',
    ...Array.from({ length: 8 }, (_, i) => para(60, 40 + i)),
  ];
  return buildDocument({ markdown: `# Title\n\n${paras.join('\n\n')}`, resources: [fig, table(rows)] }, config, createMeasurementCache());
};

const figurePage = (doc: VDTDocument): number => doc.pages.findIndex((p) => (p.floats ?? []).some((f) => f.id === 'float-fig'));
const tableBlock = (doc: VDTDocument) => doc.blocks.find((b) => b.type === 'resource' && b.resourceBlock?.resource.id === 'tab')!;

describe('a page an inline table opens takes the floats waiting for it (EF-160)', () => {
  it('sets the figure at the head of that page, above the table', () => {
    for (const before of [3, 4]) {
      const doc = build(figure(150), 12, before);
      const tab = tableBlock(doc);
      // The table does not fit page 1: it opens page 2…
      expect(tab.pageIndex, `${before}`).toBe(1);
      expect(doc.pages[0]!.floats ?? []).toHaveLength(0);
      // …and the figure takes page 2's head, above it (up to postext 1.4
      // it waited for page 3).
      expect(figurePage(doc), `${before}`).toBe(1);
      const fig = doc.pages[1]!.floats!.find((f) => f.id === 'float-fig')!;
      expect(fig.bbox.y + fig.bbox.height).toBeLessThanOrEqual(tab.bbox.y);
    }
  });

  it('leaves the head to the table when the two do not fit together', () => {
    // A figure too tall to share page 2 with the table, and a table too
    // long to share it with the figure: the table opens page 2 and the
    // figure waits for page 3, as before.
    for (const [height, rows] of [[400, 12], [150, 20]] as const) {
      const doc = build(figure(height), rows);
      const tab = tableBlock(doc);
      expect(tab.pageIndex, `${height}/${rows}`).toBe(1);
      expect(tab.bbox.y).toBeCloseTo(doc.pages[1]!.contentArea.y, 0);
      expect(figurePage(doc), `${height}/${rows}`).toBe(2);
    }
  });
});
