import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml } from '../../index.js';
import type { PostextConfig, VDTDocument } from '../../index.js';

// #1054: a label tab's glyph icon painted on the canvas and in HTML, in
// its colour and face, where the layout put it; HTML hides it from
// assistive technology, so the tab reads only its words.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

interface Drawn { text: string; x: number; y: number; fill: string; font: string }

/** A page canvas that records every `fillText` with its fill and font. */
function pageCanvas(): { canvas: HTMLCanvasElement; drawn: Drawn[] } {
  const drawn: Drawn[] = [];
  const ctx = new Proxy({ font: '', fillStyle: '#000000' } as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key === 'fillText') return (text: string, x: number, y: number) => drawn.push({ text, x, y, fill: String(target.fillStyle), font: String(target.font) });
      if (key === 'measureText') return (s: string) => ({ width: [...s].length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, drawn };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });
const config = (color?: string): PostextConfig => ({
  page: { width: pt(500), height: pt(700), dpi: 72, margins: { top: pt(40), bottom: pt(20), left: pt(30), right: pt(20) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontSize: pt(10), lineHeight: pt(14) },
  calloutStyles: [{
    id: 'tab', title: '',
    label: {
      fontFamily: 'Lora', fontSize: pt(10), position: 'top-left', height: pt(14), paddingX: pt(6), offset: pt(7), color: hex('#123456'),
      icon: { glyph: '◉', placement: 'inside', gap: pt(3), fontFamily: 'Symbols', ...(color ? { color: hex(color) } : {}) },
    },
  }] as never,
});
const build = (color?: string): VDTDocument => buildDocument({ markdown: ':::callout{type="tab" label="Money"}\nBody of the box.\n:::' }, config(color));

describe('a glyph tab icon on the canvas (#1054)', () => {
  it('paints the glyph in the label colour by default, in its own face, before the words', () => {
    const doc = build();
    const { canvas, drawn } = pageCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const glyph = drawn.find((d) => d.text === '◉')!;
    const words = drawn.find((d) => d.text === 'Money')!;
    expect(glyph).toBeDefined();
    expect(glyph.fill.toLowerCase()).toBe('#123456');
    expect(glyph.font).toContain('Symbols');
    expect(words.x - glyph.x).toBeCloseTo(7 + 3, 3);
    expect(glyph.y).toBeCloseTo(words.y, 3);
  });

  it('paints it in its own colour when it has one', () => {
    const doc = build('#cc0000');
    const { canvas, drawn } = pageCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    expect(drawn.find((d) => d.text === '◉')!.fill.toLowerCase()).toBe('#cc0000');
    expect(drawn.find((d) => d.text === 'Money')!.fill.toLowerCase()).toBe('#123456');
  });
});

describe('a glyph tab icon in HTML (#1054)', () => {
  it('sets the glyph in its colour and face, hidden from assistive technology; the words are read', () => {
    const html = renderToHtml(build('#cc0000'));
    const at = html.indexOf('◉');
    expect(at).toBeGreaterThan(-1);
    const div = html.slice(html.lastIndexOf('<div', at), at);
    expect(div).toContain('aria-hidden="true"');
    expect(div).toContain('color:#cc0000');
    expect(div).toContain('Symbols');
    const words = html.indexOf('>Money<');
    expect(words).toBeGreaterThan(-1);
    expect(html.slice(html.lastIndexOf('<div', words), words)).not.toContain('aria-hidden');
  });
});
