import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline/build';
import { createMeasurementCache } from '../../measure';
import { renderToHtml } from '../../html-backend';
import type { PostextConfig, VDTBlock, VDTDocument } from '../../index';

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
const filler = (n: number) => Array.from({ length: n }, (_, i) => para(i)).join('\n\n');

const BADGE: PostextConfig['calloutStyles'] = [
  { id: 'badge', title: 'Self-assessment', placement: 'fixed', width: 'auto' },
];
const PAGE: PostextConfig = {
  page: { width: pt(400), height: pt(400), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  headings: { balancing: { enabled: false }, levels: [{ level: 1, breakBefore: { enabled: false } }] },
  calloutStyles: BADGE,
};
const BOX = ':::callout{type="badge"}\n:::';

const build = (md: string, config: PostextConfig = PAGE): VDTDocument =>
  buildDocument({ markdown: md }, config, createMeasurementCache());
const frameOf = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'callout')!;
const bottomOf = (b: { bbox: { y: number; height: number } }) => b.bbox.y + b.bbox.height;

describe('fixed-position callouts', () => {
  it('pins the box to the bottom-left of the content area, out of the column flow', () => {
    const doc = build(`${filler(4)}\n\n${BOX}`);
    const frame = frameOf(doc);
    const page = doc.pages[frame.pageIndex]!;
    expect(frame.pageIndex).toBe(0);
    expect(frame.callout!.placement).toBe('fixed');
    expect(frame.bbox.x).toBeCloseTo(page.contentArea.x, 5);
    expect(bottomOf(frame)).toBeCloseTo(page.contentArea.y + page.contentArea.height, 5);
    // Lives in page.floats and doc.blocks, in no column.
    expect(page.floats).toContain(frame);
    expect(page.columns.some((c) => c.blocks.includes(frame))).toBe(false);
    expect(doc.blocks).toContain(frame);
  });

  it('shortens only the columns the box meets', () => {
    const doc = build(`${filler(4)}\n\n${BOX}`);
    const frame = frameOf(doc);
    const page = doc.pages[0]!;
    const [c0, c1] = page.columns;
    expect(bottomOf(c0!)).toBeLessThanOrEqual(frame.bbox.y + 1e-6);
    expect(bottomOf(c1!)).toBeCloseTo(page.contentArea.y + page.contentArea.height, 5);
    expect(frame.bbox.width).toBeLessThan(c0!.bbox.width);
  });

  it('honours the anchor edge and offset', () => {
    const config: PostextConfig = {
      ...PAGE,
      calloutStyles: [{
        id: 'badge', title: 'Self-assessment', placement: 'fixed', width: 'auto',
        fixed: { anchor: { to: 'container', edge: 'top-right' }, offset: { x: pt(-10), y: pt(5) } },
      }],
    };
    const doc = build(`${filler(2)}\n\n${BOX}`, config);
    const frame = frameOf(doc);
    const page = doc.pages[0]!;
    const px = (v: number) => (v * doc.config.page.dpi) / 72;
    expect(frame.bbox.x + frame.bbox.width).toBeCloseTo(page.contentArea.x + page.contentArea.width - px(10), 3);
    expect(frame.bbox.y).toBeCloseTo(page.contentArea.y + px(5), 3);
  });

  it('moves to the next page when the zone already holds text', () => {
    // Enough text to fill the first column down to the bottom.
    const doc = build(`${filler(16)}\n\n${BOX}`);
    const frame = frameOf(doc);
    expect(doc.pages[0]!.columns[0]!.availableHeight).toBeLessThan(frame.bbox.height);
    expect(frame.pageIndex).toBe(1);
    expect(doc.pages[1]!.floats).toContain(frame);
  });

  it('follows mirrored margins on even pages', () => {
    const config: PostextConfig = {
      ...PAGE,
      page: {
        ...PAGE.page,
        margins: { top: pt(20), bottom: pt(20), left: pt(40), right: pt(10), mirror: true },
      },
    };
    const doc = build(`${filler(16)}\n\n${BOX}`, config);
    const frame = frameOf(doc);
    expect(frame.pageIndex).toBe(1);
    const page = doc.pages[1]!;
    expect(frame.bbox.x).toBeCloseTo(page.contentArea.x, 5);
    expect(page.contentArea.x).not.toBeCloseTo(doc.pages[0]!.contentArea.x, 5);
  });

  it('renders through the HTML backend with the frame id', () => {
    const doc = build(`${filler(2)}\n\n${BOX}`);
    const html = renderToHtml(doc);
    expect(html).toContain(frameOf(doc).id);
  });
});
