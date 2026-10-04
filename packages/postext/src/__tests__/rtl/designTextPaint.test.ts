import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml } from '../../index';
import type { PostextConfig, VDTDocument } from '../../index';

// Issue #377: the canvas and the HTML paint design text and chip runs in
// their order and direction — a running head on the sheet, a chip in the
// mirrored flow of a right-to-left page.

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

interface Painted { text: string; left: number; a: number; direction: string; align: string; spacing: string }

/** A 2D context that tracks its transform and records each text run: where
 *  its box lands on the sheet, whether it reads mirrored, and the
 *  direction, alignment and tracking it was painted with. */
function recordingCanvas(): { canvas: HTMLCanvasElement; painted: Painted[] } {
  const painted: Painted[] = [];
  let m: M = [1, 0, 0, 1, 0, 0];
  const stack: M[] = [];
  const t: Record<string, unknown> = {
    font: '', textAlign: 'start', direction: 'ltr', textBaseline: 'alphabetic', letterSpacing: '0px',
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
      painted.push({ text, left: Math.min(a, b), a: m[0], direction: String(t.direction), align: String(t.textAlign), spacing: String(t.letterSpacing) });
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
const AR = 'الفصل الأول';
const MD = [`# ${AR} Alpha`, '', `مرحبا :chip[Beta ${AR}]{style=k} بالعالم.`, '', 'Gamma delta epsilon.'].join('\n');

function config(): PostextConfig {
  return {
    direction: 'rtl',
    locale: 'ar',
    page: { width: pt(400), height: pt(500), dpi: 72, margins: { top: pt(40), bottom: pt(30), left: pt(40), right: pt(40) } },
    layout: { layoutType: 'single' },
    chipStyles: [{ id: 'k', paddingX: pt(2) }],
    header: {
      elements: [{
        kind: 'text', id: 'rh', content: '{chapterTitle}', fontSize: pt(10), overflow: 'wrap', align: 'start', letterSpacing: pt(1),
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: 'fill' } },
      }],
    },
    footer: { elements: [] },
  };
}

const paint = (doc: VDTDocument): Painted[] => {
  const { canvas, painted } = recordingCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return painted;
};

describe('canvas: design text and chips right to left', () => {
  const doc = buildDocument({ markdown: MD }, config());
  const painted = paint(doc);

  it('paints a running head in visual order, its Arabic run right to left and untracked', () => {
    const header = doc.pages[0]!.header!;
    const block = header.blocks[0]!;
    expect(block.kind === 'text' && block.direction).toBe('rtl');
    // The running head is painted last, on the sheet, as two runs.
    const alpha = painted.filter((p) => p.text === 'Alpha').at(-1)!;
    const ar = painted.filter((p) => p.text === `${AR} `).at(-1)!;
    expect(alpha).toBeDefined();
    expect(ar).toBeDefined();
    // On the sheet: "Alpha" at the left of the Arabic, which reads from the right.
    expect(alpha.left).toBeLessThan(ar.left);
    expect(ar.direction).toBe('rtl');
    expect(ar.align).toBe('left');
    // Arabic is not tracked, and neither is a text that holds it.
    expect(ar.spacing).toBe('0px');
    expect(alpha.direction).toBe('ltr');
    expect(ar.a).toBeGreaterThan(0);
  });

  it('paints a chip in the mirrored flow in visual order, unmirrored', () => {
    const beta = painted.find((p) => p.text === 'Beta ')!;
    const ar = painted.filter((p) => p.text === AR && p.direction === 'rtl');
    expect(beta).toBeDefined();
    expect(ar.length).toBeGreaterThan(0);
    // The chip's base is its first strong letter (Latin): Beta, then the
    // Arabic phrase to its right on the sheet.
    const chipAr = ar.reduce((best, p) => (Math.abs(p.left - beta.left) < Math.abs(best.left - beta.left) ? p : best));
    expect(chipAr.left).toBeGreaterThan(beta.left);
    expect(beta.a).toBeGreaterThan(0);
    expect(chipAr.a).toBeGreaterThan(0);
  });

  it('gives the context its direction back', () => {
    const { canvas } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const ctx = canvas.getContext('2d') as unknown as Record<string, unknown>;
    expect(ctx.direction).toBe('ltr');
  });
});

describe('HTML: design text and chips right to left', () => {
  it('sets a right-to-left running head and chip run with dir="rtl"', () => {
    const html = renderToHtml(buildDocument({ markdown: MD }, config()), { mode: 'single' });
    expect(html).toMatch(/<span dir="rtl" style="position:absolute;left:[\d.]+px;top:[-\d.]+px;line-height:1;white-space:pre;">/);
    expect(html).toContain(`<span dir="rtl" style="position:absolute;`);
  });

  it('adds nothing to a left-to-right document', () => {
    const cfg = { ...config(), direction: 'ltr' as const, locale: 'en' };
    const html = renderToHtml(buildDocument({ markdown: '# Alpha Beta\n\n:chip[Beta Gamma]{style=k} words.' }, cfg), { mode: 'single' });
    expect(html).not.toContain('dir="rtl"');
  });
});
