import { describe, it, expect } from 'vitest';
import { buildDocument, buildDocumentPass } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { collectColumnGaps } from '../../pipeline/columnBalancing';
import {
  resolveBandCaps,
  MAX_BAND_PASSES,
  MAX_BAND_CAP_RETRIES,
  type BandCap,
  type BandPassReport,
} from '../../pipeline/bandCaps';
import type { VDTBlock, VDTColumn, VDTDocument, VDTPage } from '../../vdt';
import type { PostextConfig } from '../../types';

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

// Default 300 dpi: body 8pt → 33.33px, grid (1.5em) → 50px.
const BODY_PX = (8 * 300) / 72;
const GRID = BODY_PX * 1.5;

const SENTENCE =
  'La linterna del faro debe permanecer encendida toda la noche para guiar a los barcos que cruzan la bahía. ';
const filler = (n: number): string => SENTENCE.repeat(n).trim();

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** Two-column page, ~23.6 grid lines tall. */
const TWO_COL: PostextConfig = {
  headings: { balancing: { enabled: false } },
  page: { width: mm(160), height: mm(120), margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'double' },
};
const BALANCED: PostextConfig = { ...TWO_COL, headings: { balancing: { enabled: true } } };

/** 7 grid lines tall at the page width (box + list, plus margins). */
const SPAN_CALLOUT = [
  ':::callout{span="page" title="Recuerda"}',
  filler(2),
  '',
  '- Revisa la mecha.',
  '- Recórtala al anochecer.',
  ':::',
].join('\n');

/** Paragraph (10 sentences → 10 lines), heading, 2-line paragraph, then the
 *  box: in a plain pass the text fills column 0 to 13 lines (heading
 *  keep-with-next included) and leaves column 1 empty — uneven. Content
 *  indices: 0 paragraph, 1 heading, 2 paragraph, 3 callout start. */
const MID_PAGE = [filler(10), '', '## Sección', '', filler(2), '', SPAN_CALLOUT, '', filler(6)].join('\n');
const SPAN_INDEX = 3;

function build(md: string, config: PostextConfig = TWO_COL): VDTDocument {
  return buildDocument({ markdown: md }, config, createMeasurementCache());
}

const frames = (doc: VDTDocument): VDTBlock[] => doc.blocks.filter((b) => b.type === 'callout');
const columnOf = (doc: VDTDocument, b: VDTBlock): VDTColumn => doc.pages[b.pageIndex]!.columns[b.columnIndex]!;
const textColumns = (page: VDTPage, band: number): VDTColumn[] =>
  page.columns.filter((c) => c.kind !== 'span' && (c.band ?? 0) === band);
const spanColumns = (page: VDTPage): VDTColumn[] => page.columns.filter((c) => c.kind === 'span');
const usedLines = (c: VDTColumn): number => (c.bbox.height - c.availableHeight) / GRID;
const onGrid = (v: number): boolean => Math.abs(v / GRID - Math.round(v / GRID)) < 1e-6;

/** Page / column / block / line geometry, for whole-layout comparisons. */
function geometry(doc: VDTDocument): unknown {
  return doc.pages.map((p) => ({
    contentArea: p.contentArea,
    columns: p.columns.map((c) => ({
      bbox: c.bbox, availableHeight: c.availableHeight, band: c.band, kind: c.kind,
      blocks: c.blocks.map((b) => ({
        id: b.id, bbox: b.bbox, lines: b.lines.map((l) => ({ bbox: l.bbox, baseline: l.baseline, text: l.text })),
      })),
    })),
  }));
}

describe('page-span blocks mid-page (span blocks, stage 2 — band caps)', () => {
  it('proposes a band cap when a span block arrives mid-page with room below', () => {
    const pass = buildDocumentPass({ markdown: MID_PAGE }, TWO_COL, createMeasurementCache());
    // The plain pass itself still falls back to stage 1 (box on page 1)…
    const [frame] = frames(pass.doc);
    expect(frame!.pageIndex).toBe(1);
    expect(spanColumns(pass.doc.pages[0]!)).toHaveLength(0);
    // …but reports a cap for the box, keyed by its content index: the band
    // opened with block 0 (first part), and its 13 used lines + 2 below the
    // heading spread over two columns are 8 lines each (ceil(15 / 2)).
    expect(pass.spanPlacedInBand.size).toBe(0);
    expect(pass.bandCapsApplied.size).toBe(0);
    expect([...pass.bandCapProposals.keys()]).toEqual([SPAN_INDEX]);
    const cap = pass.bandCapProposals.get(SPAN_INDEX)!;
    expect(cap).toEqual({ kind: 'span', startContentIndex: 0, startPart: 0, lines: 8, retries: 0 });
    const page0 = pass.doc.pages[0]!;
    const total = page0.columns.reduce((s, c) => s + usedLines(c), 0);
    expect(cap.lines).toBe(Math.ceil(total / 2));
    // Applying the cap: the capped pass places the box in-band and reports it.
    const capped = buildDocumentPass({ markdown: MID_PAGE }, TWO_COL, createMeasurementCache(), undefined, {
      bandCaps: new Map([[SPAN_INDEX, cap]]),
    });
    expect([...capped.bandCapsApplied]).toEqual([SPAN_INDEX]);
    expect([...capped.spanPlacedInBand]).toEqual([SPAN_INDEX]);
    expect(frames(capped.doc)[0]!.pageIndex).toBe(0);
  });

  it('second pass places the span block mid-page with band columns level within one grid line', () => {
    const doc = build(MID_PAGE);
    // One extra pass: the proposal from pass 1, consumed by pass 2.
    expect(doc.iterationCount).toBe(2);
    const [frame] = frames(doc);
    expect(frame!.pageIndex).toBe(0);
    const page = doc.pages[0]!;
    const spanCol = columnOf(doc, frame!);
    expect(spanCol.kind).toBe('span');
    // Band 0: both columns cut at the cap (8 lines), both full — level.
    const band0 = textColumns(page, 0);
    expect(band0).toHaveLength(2);
    for (const c of band0) {
      expect(c.bbox.height).toBeCloseTo(8 * GRID, 5);
      expect(c.bbox.y + c.bbox.height).toBeCloseTo(spanCol.bbox.y, 5);
      expect(c.blocks.length).toBeGreaterThan(0);
      expect(usedLines(c)).toBeCloseTo(8, 5);
      expect(c.availableHeight).toBeLessThan(GRID); // level within one line
    }
    // The paragraph that opened the band overflowed from column 0 into
    // column 1 naturally (split, not redistributed); the heading follows it.
    expect(band0[0]!.blocks.map((b) => b.contentIndex)).toEqual([0]);
    expect(band0[1]!.blocks.map((b) => b.contentIndex)).toEqual([0, 1, 2]);
    // The cut and the span column sit on the baseline grid, and the box
    // spans the content width.
    expect(onGrid(spanCol.bbox.y - page.contentArea.y)).toBe(true);
    expect(onGrid(spanCol.bbox.height)).toBe(true);
    expect(spanCol.bbox.x).toBeCloseTo(page.contentArea.x, 5);
    expect(spanCol.bbox.width).toBeCloseTo(page.contentArea.width, 5);
    expect(frame!.bbox.width).toBeCloseTo(page.contentArea.width, 5);
    expect(frame!.bbox.y).toBeGreaterThan(spanCol.bbox.y); // marginTop above the box (band had content)
    // Column indices stay monotonic, in reading order.
    expect(page.columns.map((c) => c.index)).toEqual(page.columns.map((_, i) => i));
    expect(page.columns.map((c) => c.kind ?? 'text')).toEqual(['text', 'text', 'span', 'text', 'text']);
  });

  it('text continues in the band below the span block on the same page', () => {
    const doc = build(MID_PAGE);
    const [frame] = frames(doc);
    const page = doc.pages[0]!;
    const spanCol = columnOf(doc, frame!);
    const band1 = textColumns(page, 1);
    expect(band1).toHaveLength(2);
    const band0 = textColumns(page, 0);
    band1.forEach((c, i) => {
      expect(c.bbox.x).toBeCloseTo(band0[i]!.bbox.x, 5);
      expect(c.bbox.width).toBeCloseTo(band0[i]!.bbox.width, 5);
      expect(c.bbox.y).toBeCloseTo(spanCol.bbox.y + spanCol.bbox.height, 5);
      expect(c.bbox.y + c.bbox.height).toBeCloseTo(page.contentArea.y + page.contentArea.height, 5);
      expect(onGrid(c.bbox.y - page.contentArea.y)).toBe(true);
    });
    // The trailing paragraph flows into the first column of band 1, on the
    // grid, on page 0.
    const after = doc.blocks.filter((b) => b.type === 'paragraph' && b.containerId === undefined).pop()!;
    expect(after.pageIndex).toBe(0);
    expect(columnOf(doc, after)).toBe(band1[0]);
    expect(after.bbox.y).toBeCloseTo(band1[0]!.bbox.y, 5);
    expect(onGrid(after.lines[0]!.bbox.y - page.contentArea.y)).toBe(true);
    expect(doc.pages).toHaveLength(1);
    // doc.blocks keeps placement order: band 0 text, box + children, band 1.
    const order = doc.blocks.map((b) => (b.containerId !== undefined ? 'box' : `${b.contentIndex}`));
    const boxStart = order.indexOf('box');
    const boxEnd = order.lastIndexOf('box');
    expect(order.slice(0, boxStart)).toEqual(['0', '0', '1', '2']);
    expect(order.slice(boxEnd + 1)).toEqual([`${after.contentIndex}`]);
  });

  it('increments the cap when the capped band overflows, bounded by retries', () => {
    // 8-line paragraph, heading, 2-line paragraph: the plain pass proposes
    // ceil((8 + 5) / 2) = 7 lines, but capping column 0 at 7 splits the
    // paragraph orphan/widow-aware (6 + 2) and column 1 then holds 2 lines
    // + heading + 2 lines — more than 7. The driver retries at 8, where
    // the paragraph fills column 0 whole and the box lands in-band.
    const md = [filler(8), '', '## Sección', '', filler(2), '', SPAN_CALLOUT, '', filler(6)].join('\n');
    const plain = buildDocumentPass({ markdown: md }, TWO_COL, createMeasurementCache());
    expect(plain.bandCapProposals.get(SPAN_INDEX)!.lines).toBe(7);
    const at7 = buildDocumentPass({ markdown: md }, TWO_COL, createMeasurementCache(), undefined, {
      bandCaps: plain.bandCapProposals,
    });
    expect(at7.bandCapsApplied.has(SPAN_INDEX)).toBe(true);
    expect(at7.spanPlacedInBand.has(SPAN_INDEX)).toBe(false);
    // (The overflow spills onto page 1, where the box arrives uneven again
    // and — its cap being for another band — takes the stage-1 fallback.)
    expect(frames(at7.doc)[0]!.pageIndex).toBeGreaterThan(0);

    const doc = build(md);
    expect(doc.iterationCount).toBe(3); // plain, cap 7 (overflowed), cap 8
    const [frame] = frames(doc);
    expect(frame!.pageIndex).toBe(0);
    const band0 = textColumns(doc.pages[0]!, 0);
    for (const c of band0) expect(c.bbox.height).toBeCloseTo(8 * GRID, 5);
    expect(band0[0]!.blocks.map((b) => b.contentIndex)).toEqual([0]);
    expect(usedLines(band0[0]!)).toBeCloseTo(8, 5);
    expect(band0[1]!.blocks.map((b) => b.contentIndex)).toEqual([1, 2]);

    // Driver bound (deterministic fake passes). A cap that only delivers
    // two lines taller than proposed is retried twice…
    const proposal: BandCap = { kind: 'span', startContentIndex: 0, startPart: 0, lines: 5, retries: 0 };
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
    const initial = report([[9, proposal]], [], []);
    const seen: BandCap[] = [];
    const grows = resolveBandCaps(initial, (caps) => {
      const cap = caps.get(9)!;
      seen.push(cap);
      return report([], cap.lines >= 7 ? [9] : [], [9]);
    });
    expect(seen.map((c) => [c.lines, c.retries])).toEqual([[5, 0], [6, 1], [7, 2]]);
    expect(grows.passCount).toBe(4);
    expect(grows.bandCaps.get(9)).toEqual({ ...proposal, lines: 7, retries: 2 });
    expect(grows.result.spanPlacedInBand.has(9)).toBe(true);
    // …one that never delivers is grown MAX_BAND_CAP_RETRIES times, then
    // dropped, and the initial (uncapped) layout comes back.
    const attempts: number[] = [];
    const never = resolveBandCaps(initial, (caps) => {
      attempts.push(caps.get(9)!.lines);
      return report([], [], [9]);
    });
    expect(attempts).toEqual([5, 6, 7, 8]);
    expect(attempts.length).toBe(1 + MAX_BAND_CAP_RETRIES);
    expect(never.passCount).toBe(1 + MAX_BAND_PASSES);
    expect(never.result).toBe(initial);
    expect(never.bandCaps.size).toBe(0);
    // A cap whose opening block never opens a band is dropped at once.
    const unapplied = resolveBandCaps(initial, () => report([], [], []));
    expect(unapplied.passCount).toBe(2);
    expect(unapplied.result).toBe(initial);
  });

  it('falls back to next-page placement when the cap leaves no room for block plus minimum text', () => {
    // ~30 lines of text before the box: a level cut at line 15 leaves
    // 8.6 lines — not enough for the 7-line box plus 2 lines of body.
    const md = [filler(16), '', '## Sección', '', filler(2), '', filler(8), '', SPAN_CALLOUT, '', filler(6)].join('\n');
    const pass = buildDocumentPass({ markdown: md }, TWO_COL, createMeasurementCache());
    expect(pass.bandCapProposals.size).toBe(0);
    const doc = build(md);
    expect(doc.iterationCount).toBe(1);
    const [frame] = frames(doc);
    expect(frame!.pageIndex).toBe(1);
    expect(spanColumns(doc.pages[0]!)).toHaveLength(0);
    expect(doc.pages[0]!.columns).toHaveLength(2);
    expect(frame!.bbox.y).toBeCloseTo(doc.pages[1]!.contentArea.y, 5);
    // Same for a box that would fit only without the widow minimum below it.
    const tight = [filler(20), '', filler(8), '', SPAN_CALLOUT, '', filler(6)].join('\n');
    const tightDoc = build(tight);
    expect(frames(tightDoc)[0]!.pageIndex).toBe(1);
    expect(tightDoc.iterationCount).toBe(1);
  });

  it('band caps survive balancing passes (columns stay level after balancing)', () => {
    // 3-line paragraph, heading, 2-line paragraph: keep-with-next moves the
    // heading to column 1 of the capped band, leaving column 0 two lines
    // short of the cut — a gap measured against the capped bottom.
    const md = [filler(3), '', '## Sección', '', filler(2), '', SPAN_CALLOUT, '', filler(6)].join('\n');
    const plain = build(md);
    const [plainFrame] = frames(plain);
    expect(plainFrame!.pageIndex).toBe(0);
    const plainBand0 = textColumns(plain.pages[0]!, 0);
    for (const c of plainBand0) expect(c.bbox.height).toBeCloseTo(5 * GRID, 5);
    expect(plainBand0[0]!.blocks.map((b) => b.contentIndex)).toEqual([0]);
    expect(plainBand0[1]!.blocks.map((b) => b.contentIndex)).toEqual([1, 2]);
    expect(usedLines(plainBand0[0]!)).toBeCloseTo(3, 5);
    const gap = collectColumnGaps(plain, new Set()).find((g) => g.pageIndex === 0 && g.columnIndex === 0)!;
    expect(gap.gapLines).toBe(2);
    expect(gap.candidates.some((c) => c.kind === 'looseParagraph')).toBe(true);

    const balanced = build(md, BALANCED);
    expect(balanced.iterationCount).toBeGreaterThan(plain.iterationCount);
    // The box is still in-band on page 0, the cut did not move, and the
    // columns above it still end level at the cut…
    const [frame] = frames(balanced);
    expect(frame!.pageIndex).toBe(0);
    const spanCol = columnOf(balanced, frame!);
    expect(spanCol.bbox.y).toBeCloseTo(columnOf(plain, plainFrame!).bbox.y, 5);
    const band0 = textColumns(balanced.pages[0]!, 0);
    for (const c of band0) expect(c.bbox.y + c.bbox.height).toBeCloseTo(spanCol.bbox.y, 5);
    // …while the short column absorbed part of its gap (the loose lever
    // re-broke the paragraph one line longer, within the cap).
    expect(usedLines(band0[0]!)).toBeGreaterThan(usedLines(plainBand0[0]!));
    expect(usedLines(band0[0]!)).toBeLessThanOrEqual(5 + 1e-6);
    const balancedGap = collectColumnGaps(balanced, new Set()).find((g) => g.pageIndex === 0 && g.columnIndex === 0);
    expect(balancedGap?.gapLines ?? 0).toBeLessThan(gap.gapLines);
    // Band 1 below the box is untouched by the balancing of the band above.
    const band1 = textColumns(balanced.pages[0]!, 1);
    expect(band1.map((c) => c.bbox.y)).toEqual(textColumns(plain.pages[0]!, 1).map((c) => c.bbox.y));
    expect(balanced.pages).toHaveLength(1);
  });

  it('documents without span blocks are unaffected (same geometry, one pass)', () => {
    const parts: string[] = ['# Documento', '', filler(6), ''];
    for (let i = 1; i <= 4; i++) {
      parts.push(`## Sección ${i}`, '', filler(5), '', '- uno', '- dos', '', filler(4), '');
      parts.push(':::callout{title="Nota"}', filler(1), ':::', '');
    }
    const md = parts.join('\n');
    const cache = createMeasurementCache();
    const single = buildDocumentPass({ markdown: md }, TWO_COL, cache);
    expect(single.bandCapProposals.size).toBe(0);
    expect(single.spanPlacedInBand.size).toBe(0);
    const doc = buildDocument({ markdown: md }, TWO_COL, cache);
    expect(doc.iterationCount).toBe(1);
    expect(doc.pages.length).toBeGreaterThan(1);
    expect(geometry(doc)).toEqual(geometry(single.doc));
    // Nor are closed bands' columns changed by keeping their slack: a
    // span block at a level cut leaves no whole line behind.
    const opener = build([SPAN_CALLOUT, '', filler(6)].join('\n'));
    expect(opener.iterationCount).toBe(1);
    for (const c of textColumns(opener.pages[0]!, 0)) expect(c.availableHeight).toBe(0);
  });
});
