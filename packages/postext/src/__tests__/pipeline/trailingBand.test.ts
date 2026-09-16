import { describe, it, expect } from 'vitest';
import { buildDocument, buildDocumentPass } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, VDTDocument, VDTPage } from '../../index';
import { parseMarkdown } from '../../parse';
import { resolveTrailingCaps, type BandCap, type BandPassReport } from '../../pipeline/bandCaps';

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

  it('balancing fills the closing column of a capped band up to the cut', () => {
    // A heading inside the last column of the closing band: the level cut
    // leaves that column two lines short (the heading's own spacing does
    // not reach a grid line) and the heading takes them above it — the page
    // does not flow on, but the cap makes the column balanceable.
    const md = [filler(12), '', '## Sección', '', filler(7, 12)].join('\n');
    const doc = build(md);
    const last = doc.pages[doc.pages.length - 1]!;
    const cols = last.columns.filter((c) => c.kind !== 'span' && c.blocks.length > 0);
    expect(cols.length).toBe(2);
    expect(cols[1]!.trailingCap).toBe(true);
    for (const c of cols) expect(c.availableHeight).toBeLessThan(0.5);
    const [b0, b1] = usedBottoms(last);
    expect(Math.abs(b0! - b1!)).toBeLessThan(0.5);
    const col = cols[1]!;
    const hi = col.blocks.findIndex((b) => b.type === 'heading');
    expect(hi).toBeGreaterThan(0);
    const heading = col.blocks[hi]!;
    const prev = col.blocks[hi - 1]!;
    // The heading's margin alone is under a grid line; two lines were added.
    expect(heading.bbox.y - (prev.bbox.y + prev.bbox.height)).toBeGreaterThanOrEqual(2 * doc.baselineGrid - 0.5);
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

  // Driver-level (deterministic fake passes): two closing bands, the first
  // cap overflows on its first try and its retry moves the flow under the
  // second boundary, whose band then opens with another block. That cap is
  // replaced by the boundary's fresh proposal instead of being dropped, so
  // both bands end level once the first cap settles (EMP ch. 17: key points
  // on p. 201, the bibliography + self-assessment badge on p. 203).
  it('keeps a later boundary alive while an earlier cap is still being retried', () => {
    const capA: BandCap = { kind: 'trailing', startContentIndex: 133, startPart: 1, lines: 55, retries: 0 };
    const capB: BandCap = { kind: 'trailing', startContentIndex: 178, startPart: 0, lines: 29, retries: 0 };
    // B as the second boundary sees it while A's band still overflows.
    const capBShifted: BandCap = { kind: 'trailing', startContentIndex: 181, startPart: 0, lines: 12, retries: 0 };
    const report = (
      proposals: [number, BandCap][],
      placed: number[],
      applied: number[],
    ): BandPassReport & { tag: string } => ({
      bandCapProposals: new Map(proposals),
      spanPlacedInBand: new Set(placed),
      bandCapsApplied: new Set(applied),
      tag: `${applied.join(',')}|${placed.join(',')}`,
    });
    const initial = report([[154, capA], [205, capB]], [], []);
    const seen: [number, number][][] = [];
    const out = resolveTrailingCaps(initial, new Map(), (caps) => {
      seen.push([...caps].map(([i, c]) => [i, c.lines]));
      const a = caps.get(154)!;
      const b = caps.get(205);
      if (a.lines < 56) {
        // A overflows; the flow under it moved, so B's band opened with
        // another block — the boundary proposes afresh from there.
        return report([[205, capBShifted]], [], [154]);
      }
      if (!b || b.startContentIndex !== capB.startContentIndex) {
        return report([[205, capB]], [154], [154]);
      }
      return report([], [154, 205], [154, 205]);
    });
    expect(seen).toEqual([
      [[154, 55], [205, 29]],
      [[154, 56], [205, 12]],
      [[154, 56], [205, 29]],
    ]);
    expect(out.passCount).toBe(3);
    expect([...out.caps.keys()]).toEqual([154, 205]);
    expect(out.result.spanPlacedInBand.has(205)).toBe(true);
    expect(out.result).not.toBe(initial);
  });
});
