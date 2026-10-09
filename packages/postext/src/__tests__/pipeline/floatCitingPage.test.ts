import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { resolveResourcePlacement } from '../../pipeline/floatPlacement';
import { createMeasurementCache } from '../../measure';
import { renderToHtml } from '../../html-backend';
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

const figure = (id: string, placement?: Resource['placement'], typeId = 'figure'): Resource => ({
  id,
  typeId,
  kind: 'bitmap',
  caption: `Figure ${id}.`,
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: `${id}.png`, format: 'png', width: 1000, height: 400 },
  ...(placement ? { placement } : {}),
});

const DOUBLE: PostextConfig = { layout: { layoutType: 'double' }, headings: { levels: [] } };

const build = (markdown: string, resources: Resource[], config: PostextConfig = DOUBLE, onPass?: () => void): VDTDocument =>
  buildDocument({ markdown, resources }, config, createMeasurementCache(), onPass ? { onPass } : undefined);

/** `a` sentences of text, then a paragraph citing `id` after four
 *  sentences, then `tail` more sentences. */
const citing = (a: number, tail = 200, id = 'fig') =>
  `${paragraphs(a, 8)}\n\n${sentences(4)} The figure is cited here (:ref{id="${id}"}). ${sentences(2)}\n\n${paragraphs(tail, 10)}`;

const floatOf = (doc: VDTDocument, id: string) => {
  for (const p of doc.pages) {
    for (const f of p.floats ?? []) {
      if (f.resourceBlock?.resource.id === id) return { page: p.index, column: f.columnIndex ?? 0, bbox: f.bbox };
    }
  }
  return undefined;
};

const refOf = (doc: VDTDocument, id: string) => {
  for (const p of doc.pages) {
    for (const c of p.columns) {
      for (const b of c.blocks) {
        for (const l of b.lines ?? []) {
          if (l.segments?.some((s) => s.refResourceId === id)) return { page: p.index, column: c.index, y: l.bbox.y };
        }
      }
    }
  }
  return undefined;
};

/** Every block and float of every page, where it stands. */
const signature = (doc: VDTDocument): string =>
  JSON.stringify(doc.pages.map((p) => ({
    floats: (p.floats ?? []).map((f) => [f.id, Math.round(f.bbox.x), Math.round(f.bbox.y), Math.round(f.bbox.height)]),
    columns: p.columns.map((c) => c.blocks.map((b) => [b.id, b.contentIndex, Math.round(b.bbox.y), b.lines.length])),
  })));

const PAGE_TOP = { position: 'top', span: 'page' } as const;

describe('floats at the head of the page or column that cites them (#633)', () => {
  it('a page-wide top figure cited mid-page heads that page, the text above the reference set under it', () => {
    const md = citing(320);
    const plain = build(md, [figure('fig', PAGE_TOP)]);
    expect(refOf(plain, 'fig')!.page).toBe(2);
    expect(floatOf(plain, 'fig')!.page).toBe(3);

    const doc = build(md, [figure('fig', { ...PAGE_TOP, citingPage: true })]);
    const f = floatOf(doc, 'fig')!;
    const ref = refOf(doc, 'fig')!;
    const page = doc.pages[2]!;
    expect(f.page).toBe(2);
    expect(ref.page).toBe(2);
    expect(f.bbox.y).toBeCloseTo(page.contentArea.y, 0);
    expect(ref.y).toBeGreaterThan(f.bbox.y + f.bbox.height);
    // Every line of the page, the ones above the reference included, runs
    // under the figure.
    for (const c of page.columns) {
      for (const b of c.blocks) expect(b.bbox.y).toBeGreaterThanOrEqual(f.bbox.y + f.bbox.height - 0.5);
    }
  }, 60_000);

  it('the HTML viewer reads the figure after the paragraph that cites it', () => {
    const doc = build(citing(320), [figure('fig', { ...PAGE_TOP, citingPage: true })]);
    expect(floatOf(doc, 'fig')!.page).toBe(2);
    // The page's blocks come in reading order, its floats after its text:
    // the link to the figure, then the figure's block.
    const html = renderToHtml(doc);
    const page = html.slice(html.indexOf('id="pt-p-2"'), html.indexOf('id="pt-p-3"'));
    const cited = page.indexOf('href="#pt-res-fig"');
    const float = page.indexOf('data-block-id="float-fig"');
    expect(cited).toBeGreaterThan(0);
    expect(float).toBeGreaterThan(cited);
  }, 60_000);

  it('changes nothing unless asked', () => {
    for (const a of [230, 290, 320]) {
      const md = citing(a);
      const plain = signature(build(md, [figure('fig', PAGE_TOP)]));
      expect(signature(build(md, [figure('fig', { ...PAGE_TOP, citingPage: false })])), `a=${a}`).toBe(plain);
      expect(signature(build(md, [figure('fig', PAGE_TOP)], { ...DOUBLE, layout: { layoutType: 'double', floatsAtCitingPage: false } })), `a=${a}`).toBe(plain);
      // A resource's `false` overrides the document default.
      expect(signature(build(md, [figure('fig', { ...PAGE_TOP, citingPage: false })], { ...DOUBLE, layout: { layoutType: 'double', floatsAtCitingPage: true } })), `a=${a}`).toBe(plain);
      // Bottom floats already take the foot of the citing page.
      const bottom = signature(build(md, [figure('fig', { position: 'bottom', span: 'page' })]));
      expect(signature(build(md, [figure('fig', { position: 'bottom', span: 'page', citingPage: true })])), `a=${a}`).toBe(bottom);
    }
  }, 120_000);

  it('takes the document default and the type default', () => {
    const md = citing(320);
    const own = signature(build(md, [figure('fig', { ...PAGE_TOP, citingPage: true })]));
    expect(signature(build(md, [figure('fig', PAGE_TOP)], { ...DOUBLE, layout: { layoutType: 'double', floatsAtCitingPage: true } }))).toBe(own);
    const typed: PostextConfig = {
      ...DOUBLE,
      resourceTypes: [{ id: 'plate', name: 'Plate', shortLabel: 'Pl.', numberingTemplate: '{n}', counterFormat: 'decimal', resetOn: 'never', captionPrefix: 'Plate {n}. ', defaultPlacement: { ...PAGE_TOP, citingPage: true } }],
    };
    const doc = build(md, [figure('fig', undefined, 'plate')], typed);
    expect(floatOf(doc, 'fig')!.page).toBe(2);
  }, 60_000);

  it('refuses the head when the text it pushes down takes the reference to the next page', () => {
    // Cited near the foot of page 2's second column: under the figure the
    // citing line would go to page 3, so the figure heads page 3 as today.
    const md = citing(290);
    let plainPasses = 0;
    let passes = 0;
    const plain = build(md, [figure('fig', PAGE_TOP)], DOUBLE, () => { plainPasses++; });
    const doc = build(md, [figure('fig', { ...PAGE_TOP, citingPage: true })], DOUBLE, () => { passes++; });
    expect(refOf(doc, 'fig')!.page).toBe(1);
    expect(floatOf(doc, 'fig')!.page).toBe(2);
    expect(signature(doc)).toBe(signature(plain));
    // One round proposes, one finds the citing line moved and places again
    // without it: within the three extra rounds.
    expect(passes - plainPasses).toBeLessThanOrEqual(3);
  }, 60_000);

  it('keeps some text above the fold (`layout.maxTopFraction`)', () => {
    const md = citing(320);
    const plain = signature(build(md, [figure('fig', PAGE_TOP)]));
    const tight: PostextConfig = { ...DOUBLE, layout: { layoutType: 'double', maxTopFraction: 0.1 } };
    expect(signature(build(md, [figure('fig', { ...PAGE_TOP, citingPage: true })], tight))).toBe(signature(build(md, [figure('fig', PAGE_TOP)], tight)));
    expect(signature(build(md, [figure('fig', PAGE_TOP)], tight))).toBe(plain);
  }, 60_000);

  it('a column float cited in the right column heads that column', () => {
    const md = citing(245);
    const plain = build(md, [figure('fig', { position: 'top', span: 'column' })]);
    expect(refOf(plain, 'fig')).toMatchObject({ page: 1, column: 1 });
    expect(floatOf(plain, 'fig')!.page).toBe(2);

    const doc = build(md, [figure('fig', { position: 'top', span: 'column', citingPage: true })]);
    const f = floatOf(doc, 'fig')!;
    const ref = refOf(doc, 'fig')!;
    expect(f).toMatchObject({ page: 1, column: 1 });
    expect(ref).toMatchObject({ page: 1, column: 1 });
    expect(f.bbox.y).toBeCloseTo(doc.pages[1]!.contentArea.y, 0);
    expect(ref.y).toBeGreaterThan(f.bbox.y + f.bbox.height);
    // The left column keeps its whole height.
    expect(doc.pages[1]!.columns[0]!.blocks[0]!.bbox.y).toBeCloseTo(doc.pages[1]!.contentArea.y, 0);
  }, 60_000);

  it('never sets a figure ahead of an earlier one of its sequence', () => {
    // Figure a (taking the first free slot after its reference) and figure
    // b (allowed the head of its citing page) are both cited on page 3: a
    // is not set when page 3 opens, so b may not head it.
    const md = `${paragraphs(320, 8)}\n\nThe first figure (:ref{id="a"}). ${sentences(2)} The second figure (:ref{id="b"}). ${sentences(2)}\n\n${paragraphs(200, 10)}`;
    const doc = build(md, [figure('a', PAGE_TOP), figure('b', { ...PAGE_TOP, citingPage: true })]);
    const a = floatOf(doc, 'a')!;
    const b = floatOf(doc, 'b')!;
    expect(refOf(doc, 'b')!.page).toBe(2);
    expect(b.page).toBeGreaterThan(2);
    expect(b.page > a.page || (b.page === a.page && b.bbox.y > a.bbox.y)).toBe(true);

    // Another sequence does not hold it back.
    const other = build(md, [figure('a', PAGE_TOP, 'table'), figure('b', { ...PAGE_TOP, citingPage: true })]);
    expect(floatOf(other, 'b')!.page).toBe(2);
  }, 60_000);

  it('heads its page under an earlier figure of its sequence that page sets first', () => {
    // Figure a is cited at the foot of page 2 and opens page 3; figure b,
    // cited on page 3, heads it under a.
    const md = `${paragraphs(290, 8)}\n\n${sentences(4)} The first figure (:ref{id="a"}). ${sentences(2)}\n\n${paragraphs(40, 8)}\n\n${sentences(2)} The second figure (:ref{id="b"}). ${sentences(2)}\n\n${paragraphs(200, 10)}`;
    const doc = build(md, [figure('a', PAGE_TOP), figure('b', { ...PAGE_TOP, citingPage: true })]);
    const a = floatOf(doc, 'a')!;
    const b = floatOf(doc, 'b')!;
    const ref = refOf(doc, 'b')!;
    expect(a.page).toBe(2);
    expect(b.page).toBe(ref.page);
    expect(b.page).toBe(2);
    expect(b.bbox.y).toBeGreaterThan(a.bbox.y);
    expect(ref.y).toBeGreaterThan(b.bbox.y + b.bbox.height);
  }, 60_000);

  it('never heads a page an explicit break opens', () => {
    const plainCfg: PostextConfig = { ...DOUBLE, headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] } };
    const cases: Array<[string, PostextConfig]> = [
      // A `:::pagebreak`, then text citing the figure on the page it opens.
      [`${paragraphs(240, 8)}\n\n:::pagebreak\n:::\n\n${citing(30)}`, DOUBLE],
      // A chapter opener.
      [`# One\n\n${paragraphs(240, 8)}\n\n# Two\n\n${citing(30)}`, plainCfg],
      // The document's first page.
      [citing(30), DOUBLE],
    ];
    for (const [md, config] of cases) {
      const plain = build(md, [figure('fig', PAGE_TOP)], config);
      const doc = build(md, [figure('fig', { ...PAGE_TOP, citingPage: true })], config);
      expect(floatOf(plain, 'fig')!.page).toBeGreaterThan(refOf(plain, 'fig')!.page);
      expect(signature(doc)).toBe(signature(plain));
    }
  }, 120_000);

  it('never heads a page above a page-span heading that comes before the reference', () => {
    const config: PostextConfig = { ...DOUBLE, headings: { levels: [{ level: 2, breakBefore: { enabled: false }, span: 'page' }] } };
    const md = `${paragraphs(300, 8)}\n\n## A section\n\n${citing(30)}`;
    const plain = build(md, [figure('fig', PAGE_TOP)], config);
    const doc = build(md, [figure('fig', { ...PAGE_TOP, citingPage: true })], config);
    const heading = plain.blocks.find((b) => b.type === 'heading')!;
    expect(refOf(plain, 'fig')!.page).toBe(heading.pageIndex);
    expect(signature(doc)).toBe(signature(plain));
  }, 60_000);

  it('balancing and the closing page\'s trailing cap keep the figure on its page', () => {
    // The figure heads page 3; the text it pushes down closes on page 4,
    // whose band the trailing cap levels.
    const md = citing(320, 100);
    const doc = build(md, [figure('fig', { ...PAGE_TOP, citingPage: true })]);
    expect(floatOf(doc, 'fig')!.page).toBe(2);
    expect(refOf(doc, 'fig')!.page).toBe(2);
    const last = doc.pages[doc.pages.length - 1]!;
    expect(last.index).toBe(3);
    expect(last.columns.some((c) => c.bandCapped)).toBe(true);
  }, 60_000);

  it('applies to top and auto floats of a column or page span only', () => {
    const fig = (placement: Resource['placement']) => figure('a', placement);
    expect(resolveResourcePlacement(fig({ position: 'top', citingPage: true }), undefined).citingPage).toBe(true);
    expect(resolveResourcePlacement(fig({ citingPage: true }), undefined).citingPage).toBe(true);
    expect(resolveResourcePlacement(fig({ position: 'bottom', citingPage: true }), undefined).citingPage).toBe(false);
    expect(resolveResourcePlacement(fig({ position: 'here', citingPage: true }), undefined).citingPage).toBe(false);
    expect(resolveResourcePlacement(fig({ position: 'top', rotate: 'ccw', citingPage: true }), undefined).citingPage).toBe(false);
    expect(resolveResourcePlacement(fig({ position: 'top', span: 'side', citingPage: true }), undefined).citingPage).toBe(false);
    expect(resolveResourcePlacement(fig({ position: 'top' }), undefined, false, undefined, true).citingPage).toBe(true);
    expect(resolveResourcePlacement(fig({ position: 'top', citingPage: false }), undefined, false, undefined, true).citingPage).toBe(false);
  });
});
