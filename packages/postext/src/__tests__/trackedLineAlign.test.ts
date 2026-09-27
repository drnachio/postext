import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../index';
import { renderToHtml } from '../html-backend';
import type { PostextConfig, TextAlign } from '../types';
import type { VDTBlock, VDTDesignTextBlock, VDTDocument } from '../vdt';

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

/** A 2D context that records every `fillText` and swallows other calls. */
function recordingCanvas(): { canvas: HTMLCanvasElement; texts: { text: string; x: number }[] } {
  const texts: { text: string; x: number }[] = [];
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (key === 'fillText') return (text: string, x: number) => { texts.push({ text, x }); };
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, texts };
}

const pt = (value: number) => ({ value, unit: 'pt' as const });

/** 72 dpi: 1 pt = 1 px. An H1 tracked 3 pt. */
const config = (textAlign: TextAlign, span: 'column' | 'page' = 'column'): PostextConfig => ({
  page: { width: pt(360), height: pt(240), dpi: 72, margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  headings: { textAlign, levels: [{ level: 1, span, letterSpacing: pt(3), breakBefore: { enabled: span === 'page', parity: 'any' } }] },
});

const heading = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'heading')!;

/** Where the heading's word starts on canvas, relative to its box. */
function canvasOffset(doc: VDTDocument): number {
  const { canvas, texts } = recordingCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  return texts.find((t) => t.text === 'Title')!.x - heading(doc).bbox.x;
}

function htmlOffset(doc: VDTDocument): number {
  const m = /left:([\d.]+)px;[^"]*">Title</.exec(renderToHtml(doc));
  return Number(m?.[1]);
}

describe('tracked flow lines are aligned by their letters (EF-153, body text)', () => {
  it('leaves the tracking after the last letter out of centring and right alignment', () => {
    const center = buildDocument({ markdown: '# Title\n\nText.' }, config('center'));
    const right = buildDocument({ markdown: '# Title\n\nText.' }, config('right'));
    const h = heading(center);
    expect(h.letterSpacing).toBeCloseTo(3, 6);
    // Five letters, each advanced by 7 + 3: 50, of which the last 3 are
    // after the final 'e'.
    const advance = h.lines[0]!.bbox.width;
    expect(advance).toBeCloseTo(50, 6);
    const ink = advance - 3;
    expect(canvasOffset(center)).toBeCloseTo((h.bbox.width - ink) / 2, 3);
    expect(canvasOffset(right)).toBeCloseTo(h.bbox.width - ink, 3);
    expect(htmlOffset(center)).toBeCloseTo((h.bbox.width - ink) / 2, 2);
    expect(htmlOffset(right)).toBeCloseTo(h.bbox.width - ink, 2);
  });

  it('does the same for a line that carries no segments', () => {
    for (const align of ['center', 'right'] as const) {
      const doc = buildDocument({ markdown: '# Title\n\nText.' }, config(align));
      const h = heading(doc);
      for (const line of h.lines) delete line.segments;
      const slack = h.bbox.width - (h.lines[0]!.bbox.width - 3);
      const want = align === 'center' ? slack / 2 : slack;
      expect(canvasOffset(doc)).toBeCloseTo(want, 3);
      expect(htmlOffset(doc)).toBeCloseTo(want, 2);
    }
  });

  it('keeps left-aligned tracked lines where they were', () => {
    const doc = buildDocument({ markdown: '# Title\n\nText.' }, config('left'));
    expect(canvasOffset(doc)).toBeCloseTo(0, 3);
    expect(htmlOffset(doc)).toBeCloseTo(0, 2);
  });

  it('centres an in-column heading where the default opener of a page-span one centres it', () => {
    const inColumn = buildDocument({ markdown: '# Title\n\nText.' }, config('center'));
    const opener = buildDocument({ markdown: '# Title\n\nText.' }, config('center', 'page'));
    const band = opener.pages[0]!.openerBand!;
    const text = band.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
    const openerX = band.bbox.x + text.lines[0]!.xOffset;
    const { canvas, texts } = recordingCanvas();
    renderPageToCanvas(inColumn.pages[0]!, inColumn, canvas);
    expect(texts.find((t) => t.text === 'Title')!.x).toBeCloseTo(openerX, 3);
  });
});
