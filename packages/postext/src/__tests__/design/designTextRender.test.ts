import { describe, it, expect } from 'vitest';
import { renderHeaderFooterSlot } from '../../canvas-backend/headerFooter';
import { buildDocument } from '../../pipeline';
import { renderToHtmlIndexed } from '../../html-backend';
import type { PostextConfig } from '../../types';
import type { VDTDesignSlot, VDTDesignTextBlock } from '../../vdt';

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

/** A 2D context that records the text calls and the state they ran with. */
function recordingCtx() {
  const calls: { op: 'fill' | 'stroke'; text: string; x: number; y: number; font: string; fill: string; stroke: string; lineWidth: number }[] = [];
  const state = { font: '', fillStyle: '', strokeStyle: '', lineWidth: 1, letterSpacing: '0px', textBaseline: 'alphabetic' };
  const stack: typeof state[] = [];
  const ctx = {
    ...state,
    save() { stack.push({ ...this }); },
    restore() { Object.assign(this, stack.pop()); },
    beginPath() {},
    rect() {},
    clip() {},
    fillText(text: string, x: number, y: number) { calls.push({ op: 'fill', text, x, y, font: this.font, fill: this.fillStyle, stroke: this.strokeStyle, lineWidth: this.lineWidth }); },
    strokeText(text: string, x: number, y: number) { calls.push({ op: 'stroke', text, x, y, font: this.font, fill: this.fillStyle, stroke: this.strokeStyle, lineWidth: this.lineWidth }); },
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const textBlock = (extra: Partial<VDTDesignTextBlock>): VDTDesignSlot => ({
  bbox: { x: 0, y: 0, width: 200, height: 40 },
  blocks: [{
    kind: 'text',
    bbox: { x: 10, y: 0, width: 200, height: 20 },
    fontString: '10px Lora',
    color: '#111111',
    lines: [{ text: 'H2O', xOffset: 5, baselineY: 16, width: 21 }],
    clip: false,
    ...extra,
  } as VDTDesignTextBlock],
});

describe('design text on canvas (EF-25)', () => {
  it('paints inline-mark runs one after another in their own fonts and shifts', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, textBlock({
      lines: [{
        text: 'H2O', xOffset: 5, baselineY: 16, width: 18,
        runs: [
          { text: 'H', fontString: '10px Lora', width: 7 },
          { text: '2', fontString: '5.83px Lora', width: 4, baselineShift: 3.33 },
          { text: 'O', fontString: '10px Lora', width: 7 },
        ],
      }],
    }));
    expect(calls.map((c) => [c.op, c.text, c.x, c.y, c.font])).toEqual([
      ['fill', 'H', 15, 16, '10px Lora'],
      ['fill', '2', 22, 19.33, '5.83px Lora'],
      ['fill', 'O', 26, 16, '10px Lora'],
    ]);
  });

  it('strokes the outline over the fill, and alone for hollow letters', () => {
    const filled = recordingCtx();
    renderHeaderFooterSlot(filled.ctx, textBlock({ stroke: { widthPx: 1.5, color: '#cc0000' } }));
    expect(filled.calls.map((c) => c.op)).toEqual(['fill', 'stroke']);
    expect(filled.calls[1]).toMatchObject({ stroke: '#cc0000', lineWidth: 1.5, fill: '#111111' });
    const hollow = recordingCtx();
    renderHeaderFooterSlot(hollow.ctx, textBlock({ stroke: { widthPx: 1, color: '#cc0000', hollow: true } }));
    expect(hollow.calls.map((c) => c.op)).toEqual(['stroke']);
  });

  it('paints a plain line exactly as before', () => {
    const { ctx, calls } = recordingCtx();
    renderHeaderFooterSlot(ctx, textBlock({}));
    expect(calls.map((c) => [c.op, c.text, c.x, c.y, c.font])).toEqual([['fill', 'H2O', 15, 16, '10px Lora']]);
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });

describe('design text in HTML (EF-25)', () => {
  const config: PostextConfig = {
    page: { width: pt(360), height: pt(240), dpi: 72, margins: { top: pt(40), bottom: pt(18), left: pt(18), right: pt(18) } },
    headings: { levels: [{ level: 1, breakBefore: { enabled: false } }] },
    footer: { elements: [] },
    header: {
      elements: [
        {
          kind: 'text', id: 'marks', content: 'Ana^1^ **bold**', fontSize: pt(10), inlineMarks: true, overflow: 'ellipsis-end',
          placement: { anchor: { to: 'container', edge: 'top-left' } },
        },
        {
          kind: 'text', id: 'outlined', content: '1863', fontSize: pt(20), overflow: 'clip', stroke: { width: pt(1), hollow: true, color: { hex: '#aa0000', model: 'hex' } },
          placement: { anchor: { to: 'container', edge: 'top-right' } },
        },
      ],
    },
  };

  it('sets runs as inline spans (scripts shifted) and outlines with -webkit-text-stroke', () => {
    const doc = buildDocument({ markdown: 'Body text.' }, config);
    const html = renderToHtmlIndexed(doc).pages[0]!.decorationHtml;
    expect(html).toMatch(/>Ana<span style="font:[^"]*5\.8\d*px[^"]*;position:relative;top:-3\.33\dpx;">1<\/span> <span style="font:700 10px[^"]*;">bold<\/span>/);
    expect(html).toContain('-webkit-text-stroke:1px #aa0000;-webkit-text-fill-color:transparent;');
  });

  it('turns the browser’s punctuation trimming off on the lines and runs holding CJK text only', () => {
    // Each line (or run) was measured whole: 紅樓夢 without trimming, a
    // Latin line or run with it.
    const cjkConfig: PostextConfig = {
      ...config,
      header: {
        elements: [
          {
            kind: 'text', id: 'lines', content: '《紅樓夢》\n“end.”“Yes”', fontSize: pt(10), overflow: 'wrap',
            placement: { anchor: { to: 'container', edge: 'top-left' } },
          },
          {
            kind: 'text', id: 'runs', content: '**《紅樓夢》** “end.”“Yes”', fontSize: pt(10), inlineMarks: true, overflow: 'ellipsis-end',
            placement: { anchor: { to: 'container', edge: 'top-right' } },
          },
        ],
      },
    };
    const doc = buildDocument({ markdown: 'Body text.' }, cjkConfig);
    const html = renderToHtmlIndexed(doc).pages[0]!.decorationHtml;
    const decl = 'text-spacing-trim:space-all';
    // Lines: the one holding CJK text turns it off, the Latin one not.
    expect(html).toMatch(/white-space:pre;text-spacing-trim:space-all;[^"]*">《紅樓夢》<\/span>/);
    expect(html).toContain('white-space:pre;">“end.”“Yes”</span>');
    // Runs: the bold 《紅樓夢》 turns it off; the line box, and so the run
    // after it, keep the browser's trimming.
    expect(html).toMatch(/white-space:pre;"><span style="font:700 [^"]*;text-spacing-trim:space-all;[^"]*">《紅樓夢》<\/span> “end.”“Yes”<\/span>/);
    // No block holds the declaration for all its lines.
    for (const div of html.split('<div').slice(1)) expect(div.slice(0, div.indexOf('>'))).not.toContain(decl);
  });
});
