import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
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

const sentences = (n: number, from = 0) =>
  Array.from({ length: n }, (_, i) => `Sentence number ${from + i + 1} of this paragraph runs on to fill the measure.`).join(' ');
/** `n` sentences in paragraphs of `per`. */
const paragraphs = (n: number, per: number) => {
  const out: string[] = [];
  for (let i = 0; i < n; i += per) out.push(sentences(Math.min(per, n - i), i));
  return out.join('\n\n');
};

const figure = (placement: Resource['placement']): Resource => ({
  id: 'fig',
  typeId: 'figure',
  kind: 'bitmap',
  caption: 'A figure.',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'f.png', format: 'png', width: 1000, height: 400 },
  placement,
});

const build = (markdown: string, placement: Resource['placement'], layoutType: 'single' | 'double'): VDTDocument => {
  const config: PostextConfig = { layout: { layoutType }, headings: { levels: [] } };
  return buildDocument({ markdown, resources: [figure(placement)] }, config, createMeasurementCache());
};

/** `a` sentences of text, then paragraph B citing the figure near its end
 *  (after ten sentences), then more text. */
const citingLate = (a: number) =>
  `${paragraphs(a, 8)}\n\n${sentences(10)} The figure is cited here (:ref{id="fig"}). ${sentences(2)}\n\n${paragraphs(120, 10)}`;

const locate = (doc: VDTDocument) => {
  let float: { page: number; x: number; y: number } | undefined;
  let ref: { page: number; x: number; y: number } | undefined;
  for (const p of doc.pages) {
    for (const f of p.floats ?? []) float = { page: p.index, x: f.bbox.x, y: f.bbox.y };
    for (const c of p.columns) {
      for (const b of c.blocks) {
        for (const l of b.lines ?? []) {
          if (!ref && l.segments?.some((s) => s.refResourceId === 'fig')) ref = { page: p.index, x: l.bbox.x, y: l.bbox.y };
        }
      }
    }
  }
  return { float: float!, ref: ref! };
};

/** The float sits above the line citing it: on an earlier page, or higher on
 *  the same page (in the same column, for a column float). */
const aboveCitation = (doc: VDTDocument, pageSpan: boolean): boolean => {
  const { float, ref } = locate(doc);
  if (float.page !== ref.page) return float.page < ref.page;
  return float.y < ref.y && (pageSpan || Math.abs(float.x - ref.x) < 1);
};

describe('a float never lands above the line that cites it (EF-69)', () => {
  it('a page-wide top figure cited on the next page waits for the page after it', () => {
    // Paragraph B starts at the foot of page 1 and its citation falls on
    // page 2 (a = 116…127): the head of page 2 is above the citation.
    for (const a of [116, 120, 124, 126]) {
      const doc = build(citingLate(a), { position: 'top', span: 'page' }, 'single');
      const { float, ref } = locate(doc);
      expect(aboveCitation(doc, true), `a=${a}`).toBe(false);
      expect(float.page, `a=${a}`).toBe(ref.page + 1);
      expect(float.y).toBeCloseTo(doc.pages[float.page]!.contentArea.y, 0);
    }
  }, 30_000);

  it('holds for page-wide figures over two columns', () => {
    for (const a of [287, 290, 293, 296, 299]) {
      const doc = build(citingLate(a), { position: 'top', span: 'page' }, 'double');
      expect(aboveCitation(doc, true), `a=${a}`).toBe(false);
    }
  }, 30_000);

  it('holds for column figures placed automatically', () => {
    // The first free slot after the citation is the foot of its column or
    // the head of the next, never the head of the column that holds it.
    for (const a of [288, 291, 294, 297]) {
      const doc = build(citingLate(a), { position: 'auto', span: 'column' }, 'double');
      expect(aboveCitation(doc, false), `a=${a}`).toBe(false);
    }
  }, 30_000);

  it('holds for a citation that ends its paragraph on the next page (EF-69 addendum)', () => {
    // figures-float-where-cited moved a citation to the end of the paragraph
    // before: that paragraph's last line opens page 2, and the figure used
    // to take the head of page 2 above it (a = 127, 128 in 1.4).
    for (const a of [127, 128]) {
      const md = `${paragraphs(a, 8)} Many terminal moraines hold back lakes (:ref{id="fig"}).\n\n${paragraphs(80, 10)}`;
      for (const placement of [{ position: 'top', span: 'page' }, { position: 'auto', span: 'column' }] as Resource['placement'][]) {
        const doc = build(md, placement, 'single');
        const { float, ref } = locate(doc);
        expect(ref.page, `a=${a}`).toBe(1);
        expect(aboveCitation(doc, placement!.span === 'page'), `a=${a} ${placement!.position}/${placement!.span}`).toBe(false);
        expect(float.page, `a=${a}`).toBeGreaterThanOrEqual(ref.page);
      }
    }
  }, 60_000);

  it('holds for a citation in the part of a split box that opens the next page', () => {
    // A box that splits between its paragraphs: the head closes page 1, the
    // paragraph citing the figure opens page 2 — the figure waits for it.
    const config: PostextConfig = {
      layout: { layoutType: 'single' },
      headings: { levels: [] },
      calloutStyles: [{ id: 'note', keepTogether: false }],
    };
    const box = (n: number) =>
      `:::callout{type="note"}\n${Array.from({ length: n }, (_, i) => sentences(4, i * 4)).join('\n\n')}\n\nThe figure is cited here (:ref{id="fig"}). ${sentences(2)}\n:::`;
    let split = 0;
    for (const a of [104, 106, 108, 110, 112]) {
      const md = `${paragraphs(a, 8)}\n\n${box(4)}\n\n${paragraphs(120, 10)}`;
      const doc = buildDocument({ markdown: md, resources: [figure({ position: 'top', span: 'page' })] }, config, createMeasurementCache());
      const frames = doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.filter((b) => b.type === 'callout').map(() => p.index)));
      const { ref } = locate(doc);
      if (frames.length > 1 && ref.page > frames[0]!) split++;
      expect(aboveCitation(doc, true), `a=${a}`).toBe(false);
    }
    expect(split).toBeGreaterThan(0);
  }, 30_000);

  it('holds for a heading that cites the figure, which keep-with-next may still carry on', () => {
    // The heading closes column 2 of page 1. Its figure used to be released
    // as soon as the heading was set: it took the foot of column 2, the
    // paragraph after the heading then lacked widow room there, and
    // keep-with-next pulled the heading to page 2, under its own figure
    // (a = 112, 113). The figure now waits for the paragraph's first line.
    for (const a of [110, 111, 112, 113, 114]) {
      const md = `${paragraphs(a, 7)}\n\n## A heading citing (:ref{id="fig"})\n\n${paragraphs(40, 6)}`;
      for (const placement of [{ position: 'auto', span: 'column' }, { position: 'top', span: 'page' }] as Resource['placement'][]) {
        const doc = buildDocument({ markdown: md, resources: [figure(placement)] }, { layout: { layoutType: 'double' } }, createMeasurementCache());
        expect(aboveCitation(doc, placement!.span === 'page'), `a=${a} ${placement!.position}/${placement!.span}`).toBe(false);
      }
    }
    // The same when a box follows the heading: the box is what it keeps with
    // (a = 120…124 put the figure at the head of page 2, over the heading).
    for (const a of [120, 122, 124]) {
      const md = `${paragraphs(a, 7)}\n\n## A heading citing (:ref{id="fig"})\n\n:::callout{type="note"}\n${sentences(6)}\n:::\n\n${paragraphs(40, 6)}`;
      const doc = buildDocument({ markdown: md, resources: [figure({ position: 'auto', span: 'column' })] }, { layout: { layoutType: 'double' } }, createMeasurementCache());
      expect(aboveCitation(doc, false), `box a=${a}`).toBe(false);
    }
  }, 30_000);

  it('a citation on the page the paragraph starts still takes the head of the next page', () => {
    // The citation opens paragraph B, which starts on page 1 and runs on:
    // the head of page 2 comes after it in reading order.
    const md = `${paragraphs(100, 8)}\n\nThe figure is cited here (:ref{id="fig"}). ${sentences(40)}\n\n${paragraphs(80, 10)}`;
    const doc = build(md, { position: 'top', span: 'page' }, 'single');
    const { float, ref } = locate(doc);
    expect(ref.page).toBe(0);
    expect(float.page).toBe(1);
    expect(float.y).toBeCloseTo(doc.pages[1]!.contentArea.y, 0);
  });
});

describe('a float cited by the block that closes a flow segment lands after it (EF-69)', () => {
  // The chapter barrier drains every pending float onto the pages before
  // it; a figure the barrier block itself cites belongs to the new chapter.
  const chapterTwo = (heading: string) =>
    `# One\n\n${sentences(30)}\n\n${heading}\n\n${sentences(20)}\n\n${paragraphs(40, 8)}`;
  const run = (markdown: string, placement: Resource['placement'], config: PostextConfig) => {
    const doc = buildDocument({ markdown, resources: [figure(placement)] }, config, createMeasurementCache());
    const { float, ref } = locate(doc);
    const opener = doc.pages.findIndex((p) => p.columns.some((c) => c.blocks.some((b) => b.type === 'heading' && b.lines.some((l) => l.text.includes('Two')))));
    return { doc, float, ref, opener };
  };
  const placements: Resource['placement'][] = [{ position: 'top', span: 'page' }, { position: 'auto', span: 'column' }];

  it('a heading with breakBefore', () => {
    const config: PostextConfig = {
      layout: { layoutType: 'double' },
      headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] },
    };
    for (const placement of placements) {
      const { doc, float, ref, opener } = run(chapterTwo('# Two, with its figure (:ref{id="fig"})'), placement, config);
      const label = `${placement!.position}/${placement!.span}`;
      expect(opener, label).toBeGreaterThan(0);
      expect(ref.page, label).toBe(opener);
      expect(float.page, label).toBeGreaterThanOrEqual(opener);
      expect(aboveCitation(doc, placement!.span === 'page'), label).toBe(false);
    }
  }, 30_000);

  it('a heading level set across the page (span: page)', () => {
    const config: PostextConfig = {
      layout: { layoutType: 'double' },
      headings: { levels: [{ level: 1, span: 'page', breakBefore: { enabled: false } }] },
    };
    for (const placement of placements) {
      const { doc, float, ref, opener } = run(chapterTwo('# Two, with its figure (:ref{id="fig"})'), placement, config);
      const label = `${placement!.position}/${placement!.span}`;
      expect(opener, label).toBeGreaterThan(0);
      expect(ref.page, label).toBe(opener);
      expect(float.page, label).toBeGreaterThanOrEqual(opener);
      expect(aboveCitation(doc, placement!.span === 'page'), label).toBe(false);
    }
  }, 30_000);

  it('the first paragraph after a part', () => {
    const config: PostextConfig = {
      layout: { layoutType: 'double' },
      headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
    };
    const md = `# One\n\n${sentences(30)}\n\n:::part{number="II" title="Two"}\n:::\n\nThe part opens citing its figure (:ref{id="fig"}). ${sentences(20)}\n\n${paragraphs(40, 8)}`;
    for (const placement of placements) {
      const doc = buildDocument({ markdown: md, resources: [figure(placement)] }, config, createMeasurementCache());
      const { float, ref } = locate(doc);
      const part = doc.pages.findIndex((p) => p.partInfo);
      const label = `${placement!.position}/${placement!.span}`;
      expect(part, label).toBeGreaterThan(0);
      expect(ref.page, label).toBeGreaterThan(part);
      expect(float.page, label).toBeGreaterThanOrEqual(ref.page);
      expect(aboveCitation(doc, placement!.span === 'page'), label).toBe(false);
    }
  }, 30_000);
});
