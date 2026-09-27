import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import type { DesignElement, PostextConfig, Resource, VDTBlock, VDTDocument } from '../../index';

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

const pt = (value: number) => ({ value, unit: 'pt' as const });

const figure = (id: string, height = 200): Resource => ({
  id,
  typeId: 'figure',
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 400, height },
  placement: { span: 'side' },
});

const title: DesignElement = {
  kind: 'text',
  id: 'title',
  content: '{titleText}',
  fontSize: pt(20),
  overflow: 'wrap',
  placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } },
};

/** The chapter numeral of a textbook opener: anchored to the page's top
 *  right corner, set in the outer margin column at the head of the text
 *  block (the margins are 20pt at the top and 20pt on the recto's outer
 *  side). */
const numeral = (extra: Partial<DesignElement> = {}): DesignElement => ({
  kind: 'text',
  id: 'numeral',
  content: '4',
  fontSize: pt(60),
  lineHeight: 1,
  overflow: 'wrap',
  placement: { anchor: { to: 'page', edge: 'top-right' }, offset: { x: pt(-20), y: pt(20) }, size: { width: pt(60) } },
  ...extra,
} as DesignElement);

/** One-and-a-half layout whose side column is a float-only channel at the
 *  outer edge of mirrored margins (as in `sideColumn.test.ts`). */
const config = (elements: DesignElement[], span: 'column' | 'page' = 'column'): PostextConfig => ({
  page: { dpi: 72, width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(30), right: pt(20), mirror: true } },
  layout: { layoutType: 'oneAndHalf', gutterWidth: pt(10), sideColumnPercent: 30, sideColumnRole: 'floats', sideColumnSide: 'outer' },
  header: { elements: [] },
  footer: { elements: [] },
  calloutStyles: [{ id: 'key', name: 'Key', title: 'Key', span: 'side' }],
  headings: {
    balancing: { enabled: false },
    levels: [{ level: 1, span, breakBefore: { enabled: true, parity: 'odd' }, advancedDesign: { enabled: true, slot: { elements } } }],
  },
});

const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the main column so the flow advances steadily.`;
const filler = (n: number) => Array.from({ length: n }, (_, i) => para(i)).join('\n\n');

const sideOf = (doc: VDTDocument, page: number) => doc.pages[page]!.columns.find((c) => c.kind === 'side')!;
const floatsOf = (doc: VDTDocument): Array<{ page: number; block: VDTBlock }> =>
  doc.pages.flatMap((p) => (p.floats ?? []).map((b) => ({ page: p.index, block: b })));
/** The numeral as painted: the heading's in-column overlay, or the page's
 *  opener band for a `span: 'page'` heading. */
const numeralBox = (doc: VDTDocument) => {
  const page = doc.pages[0]!;
  const heading = page.columns.flatMap((c) => c.blocks).find((b) => b.type === 'heading')!;
  const slot = heading.designOverlay ?? page.openerBand!;
  // Overlay blocks are in the order of the slot's elements.
  return slot.blocks[1]!.bbox;
};

describe('heading design elements in the side channel (EF-78)', () => {
  it('the numeral sits in the side column (the premise of the tests below)', () => {
    const doc = buildDocument({ markdown: '# Chapter\n\nText.' }, config([title, numeral()]));
    const side = sideOf(doc, 0);
    const box = numeralBox(doc);
    expect(box.x).toBeGreaterThanOrEqual(side.bbox.x - 0.5);
    expect(box.x + box.width).toBeLessThanOrEqual(side.bbox.x + side.bbox.width + 0.5);
    expect(box.y).toBeCloseTo(side.bbox.y, 5);
  });

  it('a side figure cited on the opener goes under the numeral, not over it', () => {
    const doc = buildDocument(
      { markdown: '# Chapter\n\nThe first paragraph cites the side figure (:ref{id="fig"}).\n\nMore text.', resources: [figure('fig', 120)] },
      config([title, numeral()]),
    );
    const fl = floatsOf(doc);
    expect(fl.length).toBe(1);
    const { page, block } = fl[0]!;
    expect(page).toBe(0);
    const box = numeralBox(doc);
    expect(block.bbox.y).toBeGreaterThanOrEqual(box.y + box.height - 0.01);
  });

  it('the same under a page-spanning opener', () => {
    const doc = buildDocument(
      { markdown: '# Chapter\n\nThe first paragraph cites the side figure (:ref{id="fig"}).\n\nMore text.', resources: [figure('fig', 120)] },
      config([title, numeral()], 'page'),
    );
    const fl = floatsOf(doc);
    expect(fl.length).toBe(1);
    expect(fl[0]!.page).toBe(0);
    const box = numeralBox(doc);
    expect(fl[0]!.block.bbox.y).toBeGreaterThanOrEqual(box.y + box.height - 0.01);
  });

  it('a side box set beside the opener goes under the numeral too', () => {
    const doc = buildDocument(
      { markdown: '# Chapter\n\n:::callout{type="key"}\nA key concept set beside the text.\n:::\n\nMore text.' },
      config([title, numeral()]),
    );
    const frame = (doc.pages[0]!.floats ?? []).find((b) => b.callout)!;
    expect(frame).toBeDefined();
    const box = numeralBox(doc);
    expect(frame.bbox.y).toBeGreaterThanOrEqual(box.y + box.height - 0.01);
  });

  it('a figure the rest of the side column cannot hold waits for the next page', () => {
    // 400 × 1100 set 105pt wide in the side column: about 290pt with its
    // caption, which the empty column (360pt) holds but not what the
    // numeral leaves of it, so the figure moves on.
    const doc = buildDocument(
      { markdown: `# Chapter\n\nThe first paragraph cites the side figure (:ref{id="fig"}).\n\n${filler(30)}`, resources: [figure('fig', 1100)] },
      config([title, numeral()]),
    );
    const fl = floatsOf(doc);
    expect(fl.length).toBe(1);
    expect(fl[0]!.page).toBe(1);
  });

  it('an element with reserve: false leaves the side column free', () => {
    const doc = buildDocument(
      { markdown: '# Chapter\n\nThe first paragraph cites the side figure (:ref{id="fig"}).\n\nMore text.', resources: [figure('fig', 120)] },
      config([title, numeral({ reserve: false })]),
    );
    const fl = floatsOf(doc);
    expect(fl[0]!.page).toBe(0);
    expect(fl[0]!.block.bbox.y).toBeCloseTo(sideOf(doc, 0).bbox.y, 5);
  });

  describe('a section number hung in the margin beside a heading further down the page', () => {
    /** An H2 whose number hangs in the side column, level with its title
     *  (its right edge 54pt right of the main column, which ends 10pt
     *  before the side column starts). */
    const sectionNumber: DesignElement = {
      kind: 'text',
      id: 'num',
      content: '{number}',
      fontSize: pt(14),
      overflow: 'wrap',
      placement: { anchor: { to: 'container', edge: 'top-right' }, offset: { x: pt(54), y: pt(0) }, size: { width: pt(40) } },
    } as DesignElement;
    const h2Config = (): PostextConfig => {
      const c = config([title]);
      c.headings!.levels = [
        { level: 1, breakBefore: { enabled: true, parity: 'odd' } },
        { level: 2, numberingTemplate: '{1}.{2}', advancedDesign: { enabled: true, slot: { elements: [{ ...title, fontSize: pt(12) } as DesignElement, sectionNumber] } } },
      ];
      return c;
    };
    const h2Of = (doc: VDTDocument) => doc.pages[0]!.columns.flatMap((c) => c.blocks).find((b) => b.type === 'heading' && b.headingLevel === 2)!;
    const numberBox = (doc: VDTDocument) => h2Of(doc).designOverlay!.blocks[1]!.bbox;
    const overlaps = (a: { y: number; height: number }, b: { y: number; height: number }): boolean =>
      a.y < b.y + b.height - 0.01 && b.y < a.y + a.height - 0.01;

    it('the number stands in the side column, below the head of the page (the premise)', () => {
      const doc = buildDocument({ markdown: `# Chapter\n\n${filler(6)}\n\n## Section\n\nText.` }, h2Config());
      const side = sideOf(doc, 0);
      const box = numberBox(doc);
      expect(box.x).toBeGreaterThanOrEqual(side.bbox.x - 0.5);
      expect(box.x + box.width).toBeLessThanOrEqual(side.bbox.x + side.bbox.width + 0.5);
      expect(box.y).toBeGreaterThan(side.bbox.y + 150);
    });

    it('a side figure cited after the heading still takes the head of the side column', () => {
      const doc = buildDocument(
        { markdown: `# Chapter\n\n${filler(6)}\n\n## Section\n\nThis cites the side figure (:ref{id="fig"}).\n\n${filler(2)}`, resources: [figure('fig', 200)] },
        h2Config(),
      );
      const fl = floatsOf(doc);
      expect(fl.length).toBe(1);
      expect(fl[0]!.page).toBe(0);
      expect(fl[0]!.block.bbox.y).toBeCloseTo(sideOf(doc, 0).bbox.y, 5);
    });

    it('side figures stack above the number while they fit, and the next one goes under it', () => {
      const doc = buildDocument(
        {
          markdown: `# Chapter\n\n${filler(4)}\n\n## Section\n\nThis cites :ref{id="a"}, :ref{id="b"} and :ref{id="c"}.\n\n${filler(2)}`,
          resources: [figure('a', 250), figure('b', 250), figure('c', 250)],
        },
        h2Config(),
      );
      const box = numberBox(doc);
      const all = floatsOf(doc);
      const onPage0 = all.filter((f) => f.page === 0).map((f) => f.block.bbox);
      // The first figure takes the head of the channel, above the number;
      // the second, which would reach down to it, goes under it; the third
      // no longer fits and waits for the next page.
      expect(onPage0).toHaveLength(2);
      expect(onPage0[0]!.y).toBeCloseTo(sideOf(doc, 0).bbox.y, 5);
      expect(onPage0[0]!.y + onPage0[0]!.height).toBeLessThan(box.y);
      expect(onPage0[1]!.y).toBeGreaterThanOrEqual(box.y + box.height);
      for (const b of onPage0) expect(overlaps(b, box)).toBe(false);
      expect(all.filter((f) => f.page === 1)).toHaveLength(1);
    });
  });

  it('a design that stays in the main column leaves the side column as it was', () => {
    const doc = buildDocument(
      { markdown: '# Chapter\n\nThe first paragraph cites the side figure (:ref{id="fig"}).\n\nMore text.', resources: [figure('fig', 120)] },
      config([title]),
    );
    const fl = floatsOf(doc);
    expect(fl[0]!.page).toBe(0);
    expect(fl[0]!.block.bbox.y).toBeCloseTo(sideOf(doc, 0).bbox.y, 5);
  });
});
