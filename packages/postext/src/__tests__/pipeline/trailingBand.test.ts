import { describe, it, expect } from 'vitest';
import { buildDocument, buildDocumentPass } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, VDTDocument, VDTPage } from '../../index';
import { parseMarkdown } from '../../parse';

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
const para = (i: number) => `Paragraph ${i} carries enough words to take a few lines of the narrow column so the flow advances steadily.`;
const filler = (n: number, from = 0) => Array.from({ length: n }, (_, i) => para(from + i)).join('\n\n');

const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
};
const withBalancing = (balancing: NonNullable<PostextConfig['headings']>['balancing']): PostextConfig =>
  ({ ...PAGE, headings: { ...PAGE.headings, balancing } });

const build = (md: string, config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown: md }, config, createMeasurementCache());

/** Used height per text column of `page` (band 0). */
const usedHeights = (page: VDTPage): number[] =>
  page.columns.filter((c) => c.kind !== 'span' && c.blocks.length > 0).map((c) => c.bbox.height - c.availableHeight);
const usedBottoms = (page: VDTPage): number[] =>
  page.columns.filter((c) => c.kind !== 'span' && c.blocks.length > 0).map((c) => c.bbox.y + c.bbox.height - c.availableHeight);

// Column 0 fills the page, column 1 gets a few paragraphs: a "lame" close.
const LAME = filler(20);

describe('trailing band balance', () => {
  it('the closing columns of the document end level (within one grid line)', () => {
    const doc = build(LAME);
    const last = doc.pages[doc.pages.length - 1]!;
    const [b0, b1] = usedBottoms(last);
    expect(b1).toBeDefined();
    expect(Math.abs(b0! - b1!)).toBeLessThanOrEqual(doc.baselineGrid + 0.5);
    // The columns were cut level: neither reaches the page bottom.
    for (const c of last.columns) {
      expect(c.bbox.y + c.bbox.height).toBeLessThan(last.contentArea.y + last.contentArea.height - 1);
    }
    expect(doc.iterationCount).toBeGreaterThan(1);
  });

  it('is proposed by the first pass, keyed by the end of the document', () => {
    const content = { markdown: LAME };
    const pass = buildDocumentPass(content, PAGE, createMeasurementCache());
    const blocks = parseMarkdown(LAME);
    const cap = pass.bandCapProposals.get(blocks.length);
    expect(cap).toBeDefined();
    expect(cap!.kind).toBe('trailing');
    expect(cap!.startContentIndex).toBe(0);
  });

  it('trailing: false keeps the old close (first column full, second short)', () => {
    const doc = build(LAME, withBalancing({ trailing: false }));
    const last = doc.pages[doc.pages.length - 1]!;
    const [u0, u1] = usedHeights(last);
    expect(u0! - u1!).toBeGreaterThan(doc.baselineGrid * 3);
    expect(last.columns[0]!.bbox.y + last.columns[0]!.bbox.height).toBeCloseTo(last.contentArea.y + last.contentArea.height, 5);
  });

  it('balancing disabled: no proposal at all', () => {
    const pass = buildDocumentPass({ markdown: LAME }, withBalancing({ enabled: false }), createMeasurementCache());
    expect(pass.bandCapProposals.size).toBe(0);
  });

  it('a chapter opener levels the page that closes the previous chapter', () => {
    const config: PostextConfig = { ...PAGE, headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' } }] } };
    const doc = build(`# One\n\n${LAME}\n\n# Two\n\n${filler(2)}`, config);
    const two = doc.blocks.find((b) => b.type === 'heading' && b.lines[0]?.text.includes('Two'))!;
    const closing = doc.pages[two.pageIndex - 1]!;
    const [b0, b1] = usedBottoms(closing);
    expect(b1).toBeDefined();
    expect(Math.abs(b0! - b1!)).toBeLessThanOrEqual(doc.baselineGrid + 0.5);
  });

  it('a chapter-closing fixed box sits under the levelled columns on the same page', () => {
    const config: PostextConfig = {
      ...PAGE,
      calloutStyles: [{ id: 'badge', title: 'Self-assessment', placement: 'fixed', width: 'auto' }],
    };
    const doc = build(`${LAME}\n\n:::callout{type="badge"}\n:::`, config);
    const frame = doc.blocks.find((b) => b.type === 'callout')!;
    const last = doc.pages[doc.pages.length - 1]!;
    expect(frame.pageIndex).toBe(last.index);
    const [b0, b1] = usedBottoms(last);
    expect(Math.abs(b0! - b1!)).toBeLessThanOrEqual(doc.baselineGrid + 0.5);
    expect(frame.bbox.y).toBeGreaterThanOrEqual(Math.max(b0!, b1!) - 1e-6);
  });

  it('a page with a forced column break is left alone', () => {
    const doc = build(`${filler(4)}\n\n:::columnbreak\n\n${filler(2)}`);
    const last = doc.pages[doc.pages.length - 1]!;
    expect(last.columns[0]!.forcedBreak).toBe(true);
    expect(last.columns[0]!.bbox.y + last.columns[0]!.bbox.height).toBeCloseTo(last.contentArea.y + last.contentArea.height, 5);
  });
});
