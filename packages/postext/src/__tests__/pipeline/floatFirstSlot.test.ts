import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, VDTDocument, VDTBlock } from '../../index';

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

const figure = (id: string, opts: { placement?: Resource['placement']; height?: number } = {}): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height: opts.height ?? 200 },
  ...(opts.placement ? { placement: opts.placement } : {}),
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

const floatsOf = (doc: VDTDocument) =>
  doc.pages.flatMap((p) => (p.floats ?? []).map((b) => ({ page: p.index, block: b, id: b.resourceBlock!.resource.id })));
const floatById = (doc: VDTDocument, id: string) => floatsOf(doc).find((f) => f.id === id)!;
const bottomOf = (b: { bbox: { y: number; height: number } }) => b.bbox.y + b.bbox.height;
const textBlocksOnPage = (doc: VDTDocument, page: number): VDTBlock[] =>
  doc.pages[page]!.columns.flatMap((c) => c.blocks);

describe('first-available-slot float placement', () => {
  it('auto: a float referenced in the first column lands at the bottom of that column on the same page', () => {
    const doc = build(`Intro :ref{id="f1"} text.\n\n${filler(12)}`, [figure('f1')]);
    const f = floatById(doc, 'f1');
    expect(f.page).toBe(0);
    const col = doc.pages[0]!.columns[f.block.columnIndex]!;
    expect(f.block.columnIndex).toBe(0);
    // Sits under the column's text, inside the page content area.
    expect(f.block.bbox.y).toBeGreaterThanOrEqual(bottomOf(col) - 1e-6);
    expect(bottomOf(f.block)).toBeLessThanOrEqual(doc.pages[0]!.contentArea.y + doc.pages[0]!.contentArea.height + 1e-6);
    // The column was shortened to make room and the text kept flowing.
    expect(bottomOf(col)).toBeLessThan(doc.pages[0]!.contentArea.y + doc.pages[0]!.contentArea.height - 1);
    expect(doc.pages[0]!.columns[1]!.blocks.length).toBeGreaterThan(0);
  });

  it('top: only top slots — the next empty column of the same page', () => {
    const doc = build(`Intro :ref{id="f1"} text.\n\n${filler(20)}`, [figure('f1', { placement: { position: 'top' } })]);
    const f = floatById(doc, 'f1');
    expect(f.page).toBe(0);
    expect(f.block.columnIndex).toBe(1);
    expect(f.block.bbox.y).toBeCloseTo(doc.pages[0]!.contentArea.y, 5);
    const col1 = doc.pages[0]!.columns[1]!;
    expect(col1.bbox.y).toBeGreaterThan(doc.pages[0]!.contentArea.y);
    expect(col1.blocks.length).toBeGreaterThan(0);
  });

  it('a float that fits nowhere on the page does not hold up a later one', () => {
    const doc = build(
      `Intro :ref{id="tall"} then :ref{id="small"}.\n\n${filler(12)}`,
      [figure('tall', { height: 4000 }), figure('small', { height: 150 })],
    );
    expect(floatById(doc, 'small').page).toBe(0);
    expect(floatById(doc, 'tall').page).toBeGreaterThan(0);
  });

  it('numbering follows first-reference order even when a later float lands first', () => {
    const doc = build(
      `Intro :ref{id="tall"} then :ref{id="small"}.\n\n${filler(12)}`,
      [figure('tall', { height: 4000 }), figure('small', { height: 150 })],
    );
    expect(floatById(doc, 'tall').block.resourceBlock!.number).toBe('1');
    expect(floatById(doc, 'small').block.resourceBlock!.number).toBe('2');
  });

  it('page-span: the bottom of the current page when every column has room, else the next page', () => {
    const fits = build(`Intro :ref{id="f1"} text.\n\n${filler(12)}`, [figure('f1', { placement: { span: 'page' } })]);
    const f = floatById(fits, 'f1');
    expect(f.page).toBe(0);
    expect(f.block.bbox.width).toBeCloseTo(fits.pages[0]!.contentArea.width, 5);
    for (const col of fits.pages[0]!.columns) expect(bottomOf(col)).toBeLessThanOrEqual(f.block.bbox.y + 1e-6);

    // Referenced in the second column: the first column is full, so the
    // band cannot be reserved on this page any more.
    const late = build(`${filler(16)}\n\nLater :ref{id="f1"} text.\n\n${filler(12)}`, [figure('f1', { placement: { span: 'page' } })]);
    const ref = late.blocks.find((b) => b.lines.some((l) => l.text.includes('Later')))!;
    expect(ref.pageIndex).toBe(0);
    expect(ref.columnIndex).toBe(1);
    expect(floatById(late, 'f1').page).toBe(1);
  });

  it('::pagebreak sends pending floats to the page that follows, never onto a blank parity page', () => {
    const doc = build(
      `${filler(24)}\n\nLate :ref{id="f1"} text.\n\n:::pagebreak{parity="odd"}\n\n${filler(3)}`,
      [figure('f1', { height: 600 })],
    );
    const f = floatById(doc, 'f1');
    expect(doc.pages[1]!.blankForParity).toBe(true);
    expect(doc.pages[1]!.floats ?? []).toHaveLength(0);
    expect(f.page).toBe(2);
    expect(textBlocksOnPage(doc, 2).length).toBeGreaterThan(0);
  });
});

describe('chapter barriers', () => {
  const CHAPTERS: PostextConfig = {
    ...PAGE,
    headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
  };

  it('a pending float gets its own page before a breakBefore heading, never after it', () => {
    const doc = build(`# One\n\n${filler(24)}\n\nLate :ref{id="f1"} text.\n\n# Two\n\n${filler(2)}`, [figure('f1', { height: 600 })], CHAPTERS);
    const f = floatById(doc, 'f1');
    const two = doc.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('Two'))!;
    expect(f.page).toBe(1);
    expect(textBlocksOnPage(doc, 1)).toHaveLength(0);
    expect(two.pageIndex).toBe(2);
  });

  it('same for a span:page heading and a :::part opener', () => {
    const span = build(`# One\n\n${filler(24)}\n\nLate :ref{id="f1"} text.\n\n# Two\n\n${filler(2)}`, [figure('f1', { height: 600 })], {
      ...PAGE,
      headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false }, span: 'page' }] },
    });
    expect(floatById(span, 'f1').page).toBe(1);
    expect(span.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('Two'))!.pageIndex).toBe(2);

    const part = build(`${filler(24)}\n\nLate :ref{id="f1"} text.\n\n:::part{number="I" title="Part"}\n:::\n\n${filler(2)}`, [figure('f1', { height: 600 })], {
      ...PAGE,
      parts: { breakBefore: { parity: 'any' }, breakAfter: { enabled: true, parity: 'any' } },
    });
    expect(floatById(part, 'f1').page).toBe(1);
    expect(part.pages[1]!.partInfo).toBeUndefined();
    expect(part.pages.findIndex((p) => p.partInfo)).toBe(2);
  });

  it('a floatBarrier callout drains pending floats before the box', () => {
    const md = `${filler(24)}\n\nLate :ref{id="f1"} text.\n\n:::callout{type="kp"}\nKey points.\n:::\n\n${filler(2)}`;
    const config: PostextConfig = { ...PAGE, calloutStyles: [{ id: 'kp', floatBarrier: true }] };
    const doc = build(md, [figure('f1', { height: 600 })], config);
    const frame = doc.blocks.find((b) => b.type === 'callout')!;
    const f = floatById(doc, 'f1');
    // The float takes a page opened ahead of the box; the box follows it
    // (below it on that page when there is room, else on the next page).
    expect(f.page).toBe(1);
    expect(frame.pageIndex).toBeGreaterThanOrEqual(1);
    if (frame.pageIndex === 1) expect(frame.bbox.y).toBeGreaterThanOrEqual(bottomOf(f.block) - 1e-6);
    // Without the flag the box stays on page 0 and the float waits for the
    // end of the document.
    const plain = build(md, [figure('f1', { height: 600 })], { ...PAGE, calloutStyles: [{ id: 'kp' }] });
    expect(plain.blocks.find((b) => b.type === 'callout')!.pageIndex).toBe(0);
    expect(floatById(plain, 'f1').page).toBe(1);
  });

  it('end of document: leftover floats are appended after the last page', () => {
    const doc = build(`${filler(24)}\n\nLate :ref{id="f1"} text.`, [figure('f1', { height: 600 })]);
    expect(doc.pages).toHaveLength(2);
    expect(floatById(doc, 'f1').page).toBe(1);
  });
});
