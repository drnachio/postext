import { describe, it, expect } from 'vitest';
import { buildDocument } from '../../pipeline';
import { renderBlock } from '../../canvas-backend/blockRender';
import type { PostextConfig } from '../../types';
import type { VDTBlock } from '../../vdt';

// A chip on a line of the CJK composer was painted with the letter spacing
// the justified run before it had set (`seg.tracking`), though it was
// measured without it: its words ran into the characters after it
// (`unicodedata` over the モ of モジュール in a Japanese manual).

class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string): { width: number } {
    const size = parseFloat(/(\d*\.?\d+)px/.exec(this.font)?.[1] ?? '10');
    return { width: [...s].reduce((w, ch) => w + (/[　-鿿]/.test(ch) ? size : size * 0.5), 0) };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  locale: 'ja',
  page: { width: pt(400), height: pt(400), dpi: 72 },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Serif', fontSize: pt(10), textAlign: 'justify' },
  chipStyles: [{ id: 'code', fontFamily: 'Mono' }],
};

describe('a chip on a composed line', () => {
  it('is painted at the block tracking, not at the spacing of the run before it', () => {
    const doc = buildDocument({ markdown: '標準ライブラリの:chip[unicodedata]{style="code"}モジュールにある関数で正規化できる。' }, config);
    const block = doc.blocks.find((b) => b.type === 'paragraph') as VDTBlock;
    const line = block.lines.find((l) => l.segments?.some((s) => s.chip))!;
    expect(line.cjkComposed).toBe(true);
    // A justified line spreads its characters: the run before the chip tracked.
    const before = line.segments!.findIndex((s) => s.chip) - 1;
    line.segments![before] = { ...line.segments![before]!, tracking: 2 };
    const painted: [string, string][] = [];
    const ctx = {
      font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, letterSpacing: '0px', textBaseline: 'alphabetic',
      fillText(text: string) { painted.push([text, this.letterSpacing]); },
      save() {}, restore() {}, beginPath() {}, rect() {}, clip() {}, fill() {}, stroke() {},
      moveTo() {}, lineTo() {}, arcTo() {}, closePath() {}, fillRect() {}, measureText: () => ({ width: 0 }),
    };
    renderBlock(ctx as unknown as CanvasRenderingContext2D, block, block.bbox.width, block.bbox.x);
    const chip = painted.find(([text]) => text === 'unicodedata');
    expect(chip?.[1]).toBe('0px');
    // The run before it kept its own spacing.
    expect(painted.some(([, spacing]) => spacing === '2px')).toBe(true);
  });
});
