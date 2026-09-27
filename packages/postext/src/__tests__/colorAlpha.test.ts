import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml } from '../index';
import type { PostextConfig, VDTLineSegment } from '../index';

// EF-30: colour values may carry an alpha channel (`#rgba`, `#rrggbbaa`,
// `rgb()` / `rgba()`). Canvas and HTML paint them as CSS colours; the
// engine passes them through unchanged, and inline swatches accept them.

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

const hex = (h: string) => ({ hex: h, model: 'hex' as const });

function swatches(markdown: string, config: PostextConfig = {}): VDTLineSegment[] {
  const doc = buildDocument({ markdown }, config);
  return doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? []))))
    .filter((s) => s.kind === 'swatch');
}

describe('inline swatches with an alpha channel (EF-30)', () => {
  it('fill from #rrggbbaa, #rgba and rgba() literals', () => {
    const segs = swatches('Key :swatch{color="#ff000080"} and :swatch{color="#0f08"} and :swatch{color="rgba(0, 0, 255, 0.5)"} done.');
    expect(segs.map((s) => s.swatch?.color)).toEqual(['#ff000080', '#00ff0088', 'rgba(0, 0, 255, 0.5)']);
  });

  it('fill from a palette entry whose colour carries alpha', () => {
    const segs = swatches('Key :swatch{color="veil"} done.', {
      colorPalette: [{ id: 'veil', name: 'Veil', value: hex('#00000040') }],
    });
    expect(segs[0]!.swatch?.color).toBe('#00000040');
  });

  it('keep the opaque forms as before and leave junk unfilled', () => {
    const segs = swatches('Key :swatch{color="#abc"} :swatch{color="#AABBCC"} :swatch{color="#12345"} done.');
    expect(segs.map((s) => s.swatch?.color)).toEqual(['#aabbcc', '#aabbcc', undefined]);
  });
});

/** A 2D context that records every fillStyle set before a fillText. */
function recordingCanvas(): { canvas: HTMLCanvasElement; textFills: string[]; rectFills: string[] } {
  const textFills: string[] = [];
  const rectFills: string[] = [];
  const state: Record<string | symbol, unknown> = {};
  const ctx = new Proxy(state, {
    get(target, key) {
      if (key === 'fillText') return () => { textFills.push(String(target.fillStyle)); };
      if (key === 'fillRect') return () => { rectFills.push(String(target.fillStyle)); };
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, textFills, rectFills };
}

describe('translucent colours on canvas and in HTML (EF-30)', () => {
  const config: PostextConfig = {
    bodyText: { color: hex('#ff000080') },
    header: {
      elements: [{
        kind: 'box',
        id: 'band',
        placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: { value: 40, unit: 'pt' }, height: { value: 8, unit: 'pt' } } },
        style: { backgroundColor: hex('rgba(0, 0, 255, 0.25)') },
      }],
    },
  };

  it('reach the canvas as CSS colours', () => {
    const doc = buildDocument({ markdown: 'Translucent text.' }, config);
    const { canvas, textFills, rectFills } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    expect(textFills).toContain('#ff000080');
    expect(rectFills).toContain('rgba(0, 0, 255, 0.25)');
  });

  it('reach the HTML as CSS colours', () => {
    const doc = buildDocument({ markdown: 'Translucent text.' }, config);
    const html = renderToHtml(doc);
    expect(html).toContain('color:#ff000080');
    expect(html).toContain('background:rgba(0, 0, 255, 0.25)');
  });
});
