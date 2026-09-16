import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { PostextConfig, Resource, VDTDocument } from '../../index';

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

/** One-and-a-half layout whose side column is a float-only channel at the
 *  outer edge of mirrored margins. Balancing off (single pass). */
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(30), right: pt(20), mirror: true } },
  layout: { layoutType: 'oneAndHalf', gutterWidth: pt(10), sideColumnPercent: 30, sideColumnRole: 'floats', sideColumnSide: 'outer' },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  calloutStyles: [{ id: 'key', name: 'Key', title: 'Key', span: 'side' }],
};

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the main column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const build = (markdown: string, resources: Resource[] = [], config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown, resources }, config);

const sideOf = (doc: VDTDocument, page: number) => doc.pages[page]!.columns.find((c) => c.kind === 'side')!;
const mainOf = (doc: VDTDocument, page: number) => doc.pages[page]!.columns.find((c) => c.kind !== 'side' && c.kind !== 'span')!;
const floatsOf = (doc: VDTDocument) =>
  doc.pages.flatMap((p) => (p.floats ?? []).map((b) => ({ page: p.index, block: b })));

describe('float-only side column (oneAndHalf, sideColumnRole: floats)', () => {
  it('body text flows only into the main column; the side column stays empty', () => {
    const doc = build(filler(80));
    expect(doc.pages.length).toBeGreaterThan(1);
    for (const p of doc.pages) {
      const side = p.columns.find((c) => c.kind === 'side');
      expect(side).toBeDefined();
      expect(side!.blocks.length).toBe(0);
      expect(side!.availableHeight).toBeCloseTo(side!.bbox.height, 5);
      const main = mainOf(doc, p.index);
      expect(main.index).toBe(0);
    }
    expect(mainOf(doc, 1).blocks.length).toBeGreaterThan(0);
  });

  it('an outer side column sits right on rectos and left on versos', () => {
    const doc = build(filler(80));
    const recto = doc.pages[0]!;
    const verso = doc.pages[1]!;
    expect(sideOf(doc, 0).bbox.x).toBeGreaterThan(mainOf(doc, 0).bbox.x);
    expect(sideOf(doc, 1).bbox.x).toBeLessThan(mainOf(doc, 1).bbox.x);
    // Same widths on both pages; the recto's side column ends at the
    // content area's right edge, the verso's starts at its left edge.
    expect(sideOf(doc, 0).bbox.width).toBeCloseTo(sideOf(doc, 1).bbox.width, 5);
    expect(sideOf(doc, 0).bbox.x + sideOf(doc, 0).bbox.width).toBeCloseTo(recto.contentArea.x + recto.contentArea.width, 5);
    expect(sideOf(doc, 1).bbox.x).toBeCloseTo(verso.contentArea.x, 5);
  });

  it('a span: side figure stacks in the side column beside the paragraph that cites it', () => {
    const doc = build(`${filler(4)}\n\nHere is the reference :ref{id="f1"} in the text.\n\n${filler(6)}`, [figure('f1', { placement: { span: 'side' } })]);
    const fl = floatsOf(doc);
    expect(fl.length).toBe(1);
    const { page, block } = fl[0]!;
    expect(page).toBe(0);
    const side = sideOf(doc, 0);
    expect(block.columnIndex).toBe(side.index);
    expect(block.bbox.x).toBeCloseTo(side.bbox.x, 5);
    expect(block.bbox.width).toBeCloseTo(side.bbox.width, 5);
    // Not above the citing paragraph, and the side column's stack moved on.
    const citing = mainOf(doc, 0).blocks.find((b) => b.lines.some((l) => l.text?.includes('reference')))!;
    expect(block.bbox.y).toBeGreaterThanOrEqual(citing.bbox.y - 1e-6);
    expect(side.availableHeight).toBeLessThan(side.bbox.height - block.bbox.height);
    // The main column kept its full height: a side float cuts no band.
    const main = mainOf(doc, 0);
    expect(main.bbox.height).toBeCloseTo(doc.pages[0]!.contentArea.height, 5);
  });

  it('a second side figure stacks under the first; one that does not fit waits for the next page', () => {
    const doc = build(
      `Cites :ref{id="a"} and :ref{id="b"} and :ref{id="c"} at once.\n\n${filler(20)}`,
      [figure('a', { height: 500 }), figure('b', { height: 500 }), figure('c', { height: 500 })].map((r) => ({ ...r, placement: { span: 'side' as const } })),
    );
    const fl = floatsOf(doc);
    expect(fl.map((f) => f.block.resourceBlock!.resource.id)).toEqual(['a', 'b', 'c']);
    const [a, b, c] = fl;
    expect(a!.page).toBe(0);
    expect(b!.page).toBe(0);
    expect(b!.block.bbox.y).toBeGreaterThan(a!.block.bbox.y + a!.block.bbox.height - 1e-6);
    expect(c!.page).toBe(1);
    expect(c!.block.columnIndex).toBe(sideOf(doc, 1).index);
    expect(c!.block.bbox.x).toBeCloseTo(sideOf(doc, 1).bbox.x, 5);
  });

  it('a span: side callout leaves the flow into the side column beside the text', () => {
    const doc = build(`${filler(3)}\n\n:::callout{type="key"}\nA key concept set beside the text.\n:::\n\n${filler(6)}`);
    const side = sideOf(doc, 0);
    const frames = (doc.pages[0]!.floats ?? []).filter((b) => b.callout);
    expect(frames.length).toBe(1);
    const frame = frames[0]!;
    expect(frame.columnIndex).toBe(side.index);
    expect(frame.bbox.x).toBeCloseTo(side.bbox.x, 5);
    expect(frame.bbox.width).toBeCloseTo(side.bbox.width, 5);
    expect(side.availableHeight).toBeLessThan(side.bbox.height);
    // The main column holds only the paragraphs: the box is not in the flow.
    expect(mainOf(doc, 0).blocks.every((b) => !b.callout)).toBe(true);
    expect(mainOf(doc, 0).blocks.length).toBe(9);
  });

  it('a page-span figure crosses the side column and reserves its band there too', () => {
    const doc = build(`Intro :ref{id="wide"} text.\n\n${filler(12)}`, [figure('wide', { placement: { span: 'page', position: 'bottom' } })]);
    const fl = floatsOf(doc);
    expect(fl.length).toBe(1);
    const { page, block } = fl[0]!;
    const area = doc.pages[page]!.contentArea;
    expect(block.bbox.width).toBeCloseTo(area.width, 5);
    const side = sideOf(doc, page);
    // The side column ends above the figure's band.
    expect(side.bbox.y + side.bbox.height).toBeLessThanOrEqual(block.bbox.y + 1e-6);
  });

  it('without a side column, span: side degrades to a column float', () => {
    const doc = build(
      `Intro :ref{id="f1"} text.\n\n${filler(12)}`,
      [figure('f1', { placement: { span: 'side' } })],
      { ...PAGE, layout: { layoutType: 'double', gutterWidth: pt(10) } },
    );
    const fl = floatsOf(doc);
    expect(fl.length).toBe(1);
    expect(doc.pages[0]!.columns.every((c) => c.kind !== 'side')).toBe(true);
    const col = doc.pages[0]!.columns[fl[0]!.block.columnIndex]!;
    expect(fl[0]!.block.bbox.width).toBeCloseTo(col.bbox.width, 5);
  });
});
