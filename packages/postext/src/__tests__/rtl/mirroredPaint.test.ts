import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml } from '../../index';
import type { PostextConfig, VDTDocument } from '../../index';

// Issue #370: renderers paint a right-to-left page's flow through its
// mirror and turn every text run and picture back about its own box.

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

type M = [number, number, number, number, number, number];
const mul = (m: M, n: M): M => [
  m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
];

interface Painted { text: string; left: number; right: number; a: number }

/** A 2D context that tracks its transform and records, for each text run
 *  painted, where its box lands on the sheet and whether it reads mirrored
 *  (`a` < 0). Every method it does not know is a no-op. */
function recordingCanvas(): { canvas: HTMLCanvasElement; painted: Painted[] } {
  const painted: Painted[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const t: Record<string, unknown> = {
    font: '', textAlign: 'left', direction: 'ltr', textBaseline: 'alphabetic', letterSpacing: '0px',
    save() { stack.push(m); },
    restore() { m = stack.pop() ?? m; },
    transform(a: number, b: number, c: number, d: number, e: number, f: number) { m = mul(m, [a, b, c, d, e, f]); },
    translate(x: number, y: number) { m = mul(m, [1, 0, 0, 1, x, y]); },
    scale(x: number, y: number) { m = mul(m, [x, 0, 0, y, 0, 0]); },
    measureText(s: string) { return { width: s.length * 7 }; },
    fillText(text: string, x: number) {
      const w = text.length * 7;
      const a = m[0] * x + m[4];
      const b = m[0] * (x + w) + m[4];
      painted.push({ text, left: Math.min(a, b), right: Math.max(a, b), a: m[0] });
    },
  };
  const ctx = new Proxy(t, {
    get(target, key) {
      if (typeof key === 'string' && key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key as string] = value; return true; },
    deleteProperty(target, key) { delete target[key as string]; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, painted };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const para = (i: number) => `Paragraph ${i} alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu.`;
const MD = ['# Heading', '', ...Array.from({ length: 8 }, (_, i) => para(i))].join('\n\n');

function config(direction: 'ltr' | 'rtl'): PostextConfig {
  return {
    direction,
    locale: 'en',
    page: {
      width: pt(400), height: pt(500), dpi: 72,
      margins: { top: pt(30), bottom: pt(30), left: pt(50), right: pt(26), mirror: true },
      ...(direction === 'ltr' ? { binding: 'left' as const } : {}),
    },
    layout: { layoutType: 'double', gutterWidth: pt(14) },
    bodyText: { textAlign: 'left' },
    header: { elements: [] },
    footer: { elements: [] },
  };
}

const paint = (doc: VDTDocument): Painted[] => {
  const { canvas, painted } = recordingCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return painted;
};

describe('canvas: a mirrored page', () => {
  const ltr = buildDocument({ markdown: MD }, config('ltr'));
  const rtl = buildDocument({ markdown: MD }, config('rtl'));

  it('paints every run of the flow unmirrored, where the mirrored layout puts its box', () => {
    const W = rtl.pages[0]!.width;
    const a = paint(ltr);
    const b = paint(rtl);
    expect(b.length).toBe(a.length);
    expect(b.length).toBeGreaterThan(5);
    for (let i = 0; i < a.length; i++) {
      expect(b[i]!.text).toBe(a[i]!.text);
      // Read as written: the glyphs are not turned over.
      expect(b[i]!.a).toBeGreaterThan(0);
      expect(b[i]!.left).toBeCloseTo(W - a[i]!.right, 6);
      expect(b[i]!.right).toBeCloseTo(W - a[i]!.left, 6);
    }
  });

  it('takes the patch off the context after the flow', () => {
    const { canvas } = recordingCanvas();
    renderPageToCanvas(rtl.pages[0]!, rtl, canvas);
    const ctx = canvas.getContext('2d') as unknown as Record<string, unknown>;
    // The recording context's own fillText is back.
    expect(String(ctx.fillText)).toContain('painted.push');
  });
});

describe('HTML: a mirrored page', () => {
  it('turns the flow over and every run back', () => {
    const html = renderToHtml(buildDocument({ markdown: MD }, config('rtl')), { mode: 'single' });
    expect(html).toContain('class="pt-flow pt-flow-mirrored"');
    expect(html).toContain('transform:scaleX(-1)');
    expect(html).toContain('.pt-flow-mirrored [style*="white-space:pre"]');
    const ltr = renderToHtml(buildDocument({ markdown: MD }, config('ltr')), { mode: 'single' });
    expect(ltr).not.toContain('pt-flow');
  });
});
