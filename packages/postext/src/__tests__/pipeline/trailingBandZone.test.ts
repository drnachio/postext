import { describe, it, expect } from 'vitest';
import { buildDocument, buildDocumentPass } from '../../pipeline/build';
import { bandCapLinesAroundZone, applyBandCap } from '../../pipeline/bandCaps';
import { createMeasurementCache } from '../../measure';
import type { PostextConfig, VDTColumn, VDTDocument, VDTPage } from '../../index';
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
  calloutStyles: [{ id: 'badge', title: 'Self-assessment', placement: 'fixed', width: 'auto', marginTop: pt(12) }],
};

const build = (md: string): VDTDocument => buildDocument({ markdown: md }, PAGE, createMeasurementCache());
const textCols = (page: VDTPage): VDTColumn[] => page.columns.filter((c) => c.kind !== 'span' && c.blocks.length > 0);
const usedBottom = (c: VDTColumn): number => c.bbox.y + c.bbox.height - c.availableHeight;

const col = (x: number, y: number, height: number, used: number): VDTColumn =>
  ({ index: 0, bbox: { x, y, width: 100, height }, availableHeight: height - used, blocks: [], kind: 'text' } as unknown as VDTColumn);

describe('trailing band around a chapter-closing fixed box', () => {
  it('cuts the box columns at the zone and hands the rest to the others', () => {
    // Band top 100, two columns 300 tall; content 480 total: level cut at
    // 340 would run into a zone starting at 300.
    const cols = [col(0, 100, 300, 300), col(120, 100, 300, 180)];
    const zone = { top: 300, columns: [0] };
    // 480 - 200 above the zone = 280 for the other column → 28 lines of 10.
    expect(bandCapLinesAroundZone(cols, 10, zone, (c) => c.bbox.y + c.bbox.height)).toBe(28);
    const uncapped = new Map<VDTColumn, number>();
    applyBandCap(cols.map((c) => ({ ...c, bbox: { ...c.bbox }, availableHeight: c.bbox.height })), 280, uncapped, zone);
    for (const [c, bottom] of uncapped) {
      expect(bottom).toBe(400);
      expect(c.bbox.y + c.bbox.height).toBe(c.bbox.x === 0 ? 300 : 380);
    }
  });

  it('is null when the level cut already clears the zone or nothing fits', () => {
    const level = [col(0, 100, 300, 100), col(120, 100, 300, 100)];
    expect(bandCapLinesAroundZone(level, 10, { top: 300, columns: [0] }, (c) => c.bbox.y + c.bbox.height)).toBeNull();
    const full = [col(0, 100, 300, 300), col(120, 100, 300, 290)];
    expect(bandCapLinesAroundZone(full, 10, { top: 200, columns: [0] }, (c) => c.bbox.y + c.bbox.height)).toBeNull();
  });

  it('keeps a chapter-closing box on the page its text ends on when the level cut would run into it', () => {
    // Find a fill where the plain level cut lands inside the box zone: the
    // box then used to move to a page of its own.
    let exercised = 0;
    for (let n = 24; n <= 44; n++) {
      const md = `${filler(n)}\n\n:::callout{type="badge"}\n:::`;
      const pass = buildDocumentPass({ markdown: md }, PAGE, createMeasurementCache());
      const cap = pass.bandCapProposals.get(parseMarkdown(md).findIndex((b) => b.type === 'containerStart'));
      if (!cap?.zone) continue;
      exercised++;
      const doc = build(md);
      const frame = doc.blocks.find((b) => b.type === 'callout')!;
      const last = doc.pages[doc.pages.length - 1]!;
      // The box shares its page with text, under the columns it meets.
      expect(frame.pageIndex).toBe(last.index);
      expect(textCols(last).length).toBeGreaterThan(0);
      for (const c of textCols(last)) {
        const meets = frame.bbox.x < c.bbox.x + c.bbox.width && frame.bbox.x + frame.bbox.width > c.bbox.x;
        if (meets) expect(usedBottom(c)).toBeLessThanOrEqual(frame.bbox.y + 1e-6);
      }
    }
    expect(exercised).toBeGreaterThan(0);
  });
});
