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

/** A small column-span table (a different numbering sequence from figures). */
const smallTable = (id: string): Resource => ({
  id,
  typeId: 'table',
  kind: 'table',
  caption: `Table ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  table: {
    model: {
      headerRowCount: 1,
      rows: [
        [{ content: 'A', isHeader: true }, { content: 'B', isHeader: true }],
        [{ content: '1' }, { content: '2' }],
      ],
    },
  },
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

  it('a float that fits nowhere on the page holds up the later ones of its sequence', () => {
    const doc = build(
      `Intro :ref{id="tall"} then :ref{id="small"}.\n\n${filler(12)}`,
      [figure('tall', { height: 4000 }), figure('small', { height: 150 })],
    );
    // Figure 2 waits for figure 1 (which needs a fresh page) and lands
    // after it in reading order, never on the referencing page before it.
    const tall = floatById(doc, 'tall');
    const small = floatById(doc, 'small');
    expect(tall.page).toBeGreaterThan(0);
    expect(small.page).toBeGreaterThanOrEqual(tall.page);
    if (small.page === tall.page) {
      expect(small.block.columnIndex).toBeGreaterThanOrEqual(tall.block.columnIndex);
    }
  });

  it('a waiting float does not hold up a later one of the other sequence', () => {
    const doc = build(
      `Intro :ref{id="tall"} then :ref{id="tab"}.\n\n${filler(12)}`,
      [figure('tall', { height: 4000 }), smallTable('tab')],
    );
    // Table 1 takes the referencing page while figure 1 waits for a fresh one.
    expect(floatById(doc, 'tab').page).toBe(0);
    expect(floatById(doc, 'tall').page).toBeGreaterThan(0);
  });

  it('numbering follows first-reference order', () => {
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

describe('page-span box right after a float reference', () => {
  it('the float takes the head of the empty column and the box cuts under text and figure alike', () => {
    // The figure is referenced by the very last paragraph before the box:
    // a band cap could not level the band (the reference would spill into
    // the figure's column and the figure would lose its slot), so the
    // float goes to the top of the empty second column and the box lands
    // on the same page below both — the slack under the figure is the
    // compositor's trade. Nothing of the box moves to the next page.
    const config: PostextConfig = {
      ...PAGE,
      calloutStyles: [{ id: 'box', span: 'page', floatBarrier: true }],
    };
    const md = `${filler(5)}\n\nSee :ref{id="f1"} here.\n\n:::callout{type="box"}\nBox.\n:::\n\n${filler(2)}`;
    const doc = build(md, [figure('f1', { height: 260 })], config);
    const f = floatById(doc, 'f1');
    expect(f.page).toBe(0);
    expect(f.block.columnIndex).toBe(1);
    expect(f.block.bbox.y).toBeCloseTo(doc.pages[0]!.contentArea.y, 5);
    const page = doc.pages[0]!;
    const span = page.columns.find((c) => c.kind === 'span');
    expect(span).toBeDefined();
    const box = doc.blocks.find((b) => b.type === 'callout')!;
    expect(box.pageIndex).toBe(0);
    // The band above the box: text in column 0, only the figure in column 1.
    const band0 = page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === 0);
    expect(band0[0]!.blocks.length).toBeGreaterThan(0);
    expect(band0[1]!.blocks).toHaveLength(0);
    expect(span!.bbox.y).toBeGreaterThanOrEqual(bottomOf(f.block) - 1e-6);
    // The text after the box flows in the band below it, on the same page.
    const after = page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === 1);
    expect(after.some((c) => c.blocks.length > 0)).toBe(true);
  });
});

describe('band caps under a top float', () => {
  it('a page-span box arriving mid-page cuts the band level even when one column starts under a float', () => {
    // The float takes the top of the second column; the box then arrives
    // with the columns uneven, so a band cap levels them: both text columns
    // of band 0 must end at the same absolute height, and the span column
    // must start right there.
    const config: PostextConfig = {
      ...PAGE,
      calloutStyles: [{ id: 'box', span: 'page' }],
    };
    const md = `Intro :ref{id="f1"} text.\n\n${filler(9)}\n\n:::callout{type="box"}\nBox.\n:::\n\n${filler(3)}`;
    const doc = build(md, [figure('f1', { placement: { position: 'top' } })], config);
    const f = floatById(doc, 'f1');
    expect(f.page).toBe(0);
    expect(f.block.columnIndex).toBe(1);
    const page = doc.pages[0]!;
    const span = page.columns.find((c) => c.kind === 'span');
    expect(span).toBeDefined();
    const band0 = page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === 0);
    expect(band0).toHaveLength(2);
    const bottoms = band0.map((c) => c.bbox.y + c.bbox.height);
    expect(Math.abs(bottoms[0]! - bottoms[1]!)).toBeLessThan(0.01);
    expect(span!.bbox.y).toBeCloseTo(bottoms[0]!, 5);
    // The CONTENT ends level too: no column is left short of the cut by more
    // than a grid line (a zero-room column under the float must be skipped,
    // not force-filled, which would push the cut down on one side only).
    const usedBottoms = band0.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight));
    for (const b of usedBottoms) expect(bottoms[0]! - b).toBeLessThanOrEqual(doc.baselineGrid + 0.5);
    expect(band0.some((c) => c.blocks.length > 0)).toBe(true);
  });
});

describe('a float at the head of a column under a page-span opener', () => {
  it('lands below the opener band, not over it', () => {
    const config: PostextConfig = {
      ...PAGE,
      headings: {
        balancing: { enabled: false },
        levels: [{
          level: 1, span: 'page', breakBefore: { enabled: false },
          advancedDesign: { enabled: true, minHeight: pt(120), slot: { elements: [] } },
        }],
      },
    };
    const doc = build(`# Opener\n\nIntro :ref{id="t1"} text.\n\n${filler(3)}`, [
      { ...smallTable('t1'), placement: { position: 'top', span: 'column' } },
    ], config);
    const heading = doc.pages[0]!.columns.flatMap((c) => c.blocks).find((b) => b.type === 'heading')!;
    const f = floatById(doc, 't1');
    expect(f.page).toBe(0);
    expect(f.block.columnIndex).toBe(1);
    expect(f.block.bbox.y).toBeGreaterThanOrEqual(bottomOf(heading) - 1e-6);
  });
});

describe('a head-of-page float cited on the closing page of a chapter', () => {
  it('takes the free foot of that page instead of a page of its own before the next chapter', () => {
    const config: PostextConfig = {
      ...PAGE,
      headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
    };
    const doc = build(`# One\n\n${filler(2)}\n\nSee :ref{id="t1"}.\n\n# Two\n\n${filler(2, 10)}`, [
      { ...smallTable('t1'), placement: { position: 'top', span: 'page' } },
    ], config);
    const f = floatById(doc, 't1');
    const two = doc.pages.findIndex((p) => p.columns.some((c) => c.blocks.some((b) => b.type === 'heading' && b.lines[0]?.text.includes('Two'))));
    expect(f.page).toBe(0);
    expect(two).toBe(1);
  });
});

describe('a page-span float on the closing page of a chapter', () => {
  it('sits right under the text, not at the page foot', () => {
    const doc = build(`Intro :ref{id="t1"} text.\n\n${filler(2)}`, [
      { ...smallTable('t1'), placement: { position: 'bottom', span: 'page' } },
    ]);
    const f = floatById(doc, 't1');
    const page = doc.pages[f.page]!;
    const textBottom = Math.max(...page.columns.map((c) => c.bbox.y + (c.bbox.height - c.availableHeight)));
    const pageFoot = page.contentArea.y + page.contentArea.height;
    // The table starts within two grid lines of the text's foot…
    expect(f.block.bbox.y - textBottom).toBeLessThan(2 * doc.baselineGrid + 1e-6);
    expect(f.block.bbox.y).toBeGreaterThanOrEqual(textBottom - 1e-6);
    // …leaving the rest of the page free under it.
    expect(pageFoot - bottomOf(f.block)).toBeGreaterThan(4 * doc.baselineGrid);
  });
});
