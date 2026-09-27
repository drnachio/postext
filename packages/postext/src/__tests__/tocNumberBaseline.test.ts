import { describe, it, expect } from 'vitest';
import { buildDocument } from '../pipeline';
import { renderBlock } from '../canvas-backend/blockRender';
import { renderToHtml } from '../html-backend';
import type { PostextConfig } from '../types';
import type { VDTBlock } from '../vdt';

// EF-58: the number of a contents entry is text set beside the title, so it
// sits on the title's baseline — in any face and size. It was painted as a
// list bullet, centred on the x-height with `textBaseline 'middle'`, which
// put a display face's figures visibly above the title. List bullets keep
// their centring.

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
const config: PostextConfig = {
  page: { dpi: 72, width: pt(360), height: pt(300), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  headings: { levels: [{ level: 1, breakBefore: { enabled: true, parity: 'any' }, numberingTemplate: '{1}' }] },
  headingStyles: [{ id: 'front', numbered: false, toc: false }],
  toc: { levels: [{ level: 1, numberFontFamily: 'Rozha One', numberFontSize: pt(15), fontSize: pt(11) }] },
};
const markdown = '# Contents {style="front"}\n\n:::toc\n\n# First\n\nText.\n\n# Second\n\nText.\n\n- a bullet item\n- another one';

function recordingCtx() {
  const calls: { text: string; x: number; y: number; baseline: string; font: string }[] = [];
  const stack: Record<string, unknown>[] = [];
  const ctx = {
    font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, textBaseline: 'alphabetic', letterSpacing: '0px',
    save() { stack.push({ font: this.font, fillStyle: this.fillStyle, textBaseline: this.textBaseline }); },
    restore() { Object.assign(this, stack.pop()); },
    beginPath() {}, rect() {}, clip() {}, moveTo() {}, lineTo() {}, stroke() {}, fill() {}, fillRect() {},
    measureText: (s: string) => ({ width: s.length * 7 }),
    fillText(text: string, x: number, y: number) { calls.push({ text, x, y, baseline: this.textBaseline, font: this.font }); },
    strokeText() {},
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const tocEntries = (blocks: VDTBlock[]) => blocks.filter((b) => b.tocEntry !== undefined && b.bulletText);

describe('EF-58: contents numbers on the title baseline', () => {
  const doc = buildDocument({ markdown }, config);
  const entries = tocEntries(doc.blocks);

  it('lays the number out on the first line\'s baseline, in a field of its own', () => {
    expect(entries.map((b) => b.bulletText)).toEqual(['1', '2']);
    for (const b of entries) {
      expect(b.bulletBaselineY).toBeCloseTo(b.lines[0]!.baseline, 6);
    }
  });

  it('keeps bulletY the em-box midpoint it was up to postext 1.4', () => {
    // A renderer that predates `bulletBaselineY` (postext-pdf 1.4 with
    // postext 1.5, a third-party painter) centres the marker on `bulletY`
    // and paints what it painted in 1.4, not 0.3 em below the title.
    for (const b of entries) {
      expect(b.bulletY).toBeCloseTo(b.lines[0]!.baseline - 11 * 0.3, 6);
    }
  });

  it('leaves list bullets centred on the x-height', () => {
    const item = doc.blocks.find((b) => b.type === 'listItem' && b.tocEntry === undefined)!;
    expect(item.bulletBaselineY).toBeUndefined();
    expect(item.bulletY).toBeLessThan(item.lines[0]!.baseline);
  });

  it('canvas paints the number on its alphabetic baseline', () => {
    const { ctx, calls } = recordingCtx();
    const b = entries[0]!;
    renderBlock(ctx, b, 300, b.bbox.x);
    const number = calls.find((c) => c.text === '1')!;
    expect(number.baseline).toBe('alphabetic');
    expect(number.y).toBeCloseTo(b.lines[0]!.baseline, 6);
    const item = doc.blocks.find((x) => x.type === 'listItem' && x.tocEntry === undefined)!;
    const rec = recordingCtx();
    renderBlock(rec.ctx, item, 300, item.bbox.x);
    expect(rec.calls.find((c) => c.text === item.bulletText)!.baseline).toBe('middle');
  });

  it('HTML sets the number in the title\'s line box, aligned on its baseline', () => {
    const html = renderToHtml(doc);
    const b = entries[0]!;
    // The marker box takes the entry's own font (so its baseline is the
    // title's) and the number sits in an inner box of its own face with no
    // line height, which aligns it on that baseline.
    const marker = html.match(/<div class="pt-bullet"[^>]*>(.*?)<\/div>/)![0];
    expect(marker).toContain(`top:${b.lines[0]!.bbox.y}px`);
    expect(marker).toMatch(/<span style="font:[^;"]*Rozha One[^;"]*;line-height:0;">1<\/span>/);
  });
});
