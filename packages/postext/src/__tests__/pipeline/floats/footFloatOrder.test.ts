import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/index.js';
import type { PostextConfig, Resource, VDTDocument } from '../../../index.js';

// #1437: floats stacked at the foot of one column read top to bottom in
// their own order. Each bottom float took the column's foot as it stood,
// above the ones already there, so figure 2 stood above figure 1.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } { return { width: s.length * 7 }; }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const figure = (id: string, height: number, caption = `Figure ${id}.`): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height },
  placement: { position: 'bottom' },
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const page = (columnCount: number): PostextConfig => ({
  page: { width: pt(420), height: pt(600), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  layout: { columnCount },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
});

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the column so the flow advances.`;
const filler = (n: number) => Array.from({ length: n }, (_, i) => para(i)).join('\n\n');

const floatsOf = (doc: VDTDocument) =>
  doc.pages.flatMap((p) => (p.floats ?? []).map((b) => ({ page: p.index, block: b, id: b.resourceBlock!.resource.id })));

function expectReadingOrder(doc: VDTDocument, ids: string[]): void {
  const floats = ids.map((id) => floatsOf(doc).find((f) => f.id === id)!);
  // All at the foot of one column of one page, so the order is visible.
  expect(new Set(floats.map((f) => `${f.page}/${f.block.columnIndex}`)).size).toBe(1);
  for (let i = 1; i < floats.length; i++) {
    const above = floats[i - 1]!.block.bbox;
    const below = floats[i]!.block.bbox;
    expect(above.y + above.height).toBeLessThanOrEqual(below.y + 0.01);
  }
  // The last one stands on the foot of the content area.
  const pageOf = doc.pages[floats[0]!.page]!;
  const last = floats[floats.length - 1]!.block.bbox;
  expect(last.y + last.height).toBeLessThanOrEqual(pageOf.contentArea.y + pageOf.contentArea.height + 0.01);
  // The column's text ends above the first float.
  const col = pageOf.columns[floats[0]!.block.columnIndex]!;
  expect(col.bbox.y + col.bbox.height).toBeLessThanOrEqual(floats[0]!.block.bbox.y + 0.01);
}

describe('floats at the foot of a column stand in reading order (#1437)', () => {
  it('one column: figure 1 above figure 2', () => {
    const doc = buildDocument(
      { markdown: `See :ref{id="a"} and :ref{id="b"}.\n\n${filler(4)}`, resources: [figure('a', 60), figure('b', 90)] },
      page(1),
    );
    expectReadingOrder(doc, ['a', 'b']);
  });

  it('two columns: figure 1 above figure 2 at the foot of the citing column', () => {
    const doc = buildDocument(
      { markdown: `See :ref{id="a"} and :ref{id="b"}.\n\n${filler(4)}`, resources: [figure('a', 140, 'Figure a, with a caption that takes two lines of the narrow column.'), figure('b', 100)] },
      page(2),
    );
    expectReadingOrder(doc, ['a', 'b']);
  });

  it('three figures keep their order', () => {
    const doc = buildDocument(
      { markdown: `See :ref{id="a"}, :ref{id="b"} and :ref{id="c"}.\n\n${filler(3)}`, resources: [figure('a', 50), figure('b', 70), figure('c', 40)] },
      page(1),
    );
    expectReadingOrder(doc, ['a', 'b', 'c']);
  });
});
