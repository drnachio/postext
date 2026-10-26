import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../../pipeline/build.js';
import { createMeasurementCache } from '../../../measure/index.js';
import { renderTextBlock } from '../../../canvas-backend/headerFooter.js';
import type { PostextConfig } from '../../../types.js';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from '../../../vdt.js';

// #1098: a box title with negative tracking is set tighter, measured and
// painted with that tracking (it was clamped to zero).

class StubCtx {
  font = '';
  letterSpacing = '0px';
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
const mm = (value: number) => ({ value, unit: 'mm' as const });
const config = (letterSpacing?: { value: number; unit: 'em' | 'pt' }): PostextConfig => ({
  page: { width: mm(120), height: mm(150), dpi: 72, margins: { top: mm(10), bottom: mm(10), left: mm(10), right: mm(10) } },
  layout: { layoutType: 'single' },
  bodyText: { fontSize: pt(12), lineHeight: pt(12) },
  calloutStyles: [{
    id: 'd',
    width: 'auto',
    titleStyle: { fontSize: pt(20), ...(letterSpacing ? { letterSpacing } : {}) },
  }],
});
const MD = ':::callout{type="d" title="Tight title"}\nOne line.\n:::';

const build = (cfg: PostextConfig): VDTDocument => buildDocument({ markdown: MD }, cfg, createMeasurementCache());
const frame = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'callout')!;
const titleOf = (doc: VDTDocument): VDTDesignTextBlock =>
  frame(doc).designOverlay!.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;

describe('negative tracking on a box title (#1098)', () => {
  it('sets the title narrower than the untracked title', () => {
    const plain = build(config());
    const tight = build(config({ value: -0.02, unit: 'em' }));
    const plainTitle = titleOf(plain);
    const tightTitle = titleOf(tight);
    expect(plainTitle.letterSpacingPx).toBeUndefined();
    // -0.02 em of a 20 pt title at 72 dpi: -0.4 px per letter.
    expect(tightTitle.letterSpacingPx).toBeCloseTo(-0.4, 5);
    // "Tight title": 11 letters, 4.4 px tighter.
    expect(plainTitle.lines[0]!.width - tightTitle.lines[0]!.width).toBeCloseTo(4.4, 5);
    // An auto-width box shrink-wraps the tighter title.
    expect(frame(plain).bbox.width - frame(tight).bbox.width).toBeCloseTo(4.4, 5);
  });

  it('paints the title on canvas with the same tracking', () => {
    const title = titleOf(build(config({ value: -0.02, unit: 'em' })));
    const seen: number[] = [];
    const ctx = Object.assign(new StubCtx(), {
      fillStyle: '', textBaseline: 'alphabetic', direction: 'ltr',
      fillText(this: StubCtx) { seen.push(parseFloat(this.letterSpacing) || 0); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fillRect() {}, moveTo() {}, lineTo() {}, stroke() {},
    });
    renderTextBlock(ctx as unknown as CanvasRenderingContext2D, title);
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) expect(s).toBeCloseTo(-0.4, 5);
  });
});
