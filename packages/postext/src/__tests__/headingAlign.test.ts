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

const config = (textAlign: TextAlign, span: 'column' | 'page' = 'column'): PostextConfig => ({
  page: { width: pt(360), height: pt(240), dpi: 96, margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
  layout: { layoutType: 'single' },
  headings: { textAlign, levels: [{ level: 1, span, breakBefore: { enabled: span === 'page', parity: 'any' } }] },
});

const heading = (doc: VDTDocument): VDTBlock => doc.blocks.find((b) => b.type === 'heading')!;

/** Where the heading's first word starts, relative to its box. */
function canvasOffset(doc: VDTDocument): number {
  const { canvas, texts } = recordingCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, canvas);
  const h = heading(doc);
  return texts.find((t) => t.text === 'Title')!.x - h.bbox.x;
}

function htmlOffset(doc: VDTDocument): number {
  const html = renderToHtml(doc);
  const m = /left:([\d.]+)px;[^"]*">Title</.exec(html);
  return Number(m?.[1]);
}

describe('headings.textAlign (EF-47)', () => {
  it('stamps the alignment on heading blocks', () => {
    for (const align of ['left', 'center', 'right', 'justify'] as const) {
      expect(heading(buildDocument({ markdown: '# Title\n\nText.' }, config(align))).textAlign).toBe(align);
    }
  });

  it('centres and right-aligns heading lines the same way on canvas and in HTML', () => {
    const left = buildDocument({ markdown: '# Title\n\nText.' }, config('left'));
    const center = buildDocument({ markdown: '# Title\n\nText.' }, config('center'));
    const right = buildDocument({ markdown: '# Title\n\nText.' }, config('right'));
    const width = heading(center).bbox.width;
    const text = heading(center).lines[0]!.bbox.width;
    expect(canvasOffset(left)).toBeCloseTo(0, 3);
    expect(canvasOffset(center)).toBeCloseTo((width - text) / 2, 3);
    expect(canvasOffset(right)).toBeCloseTo(width - text, 3);
    expect(htmlOffset(center)).toBeCloseTo((width - text) / 2, 2);
    expect(htmlOffset(right)).toBeCloseTo(width - text, 2);
  });

  it('centres a line that carries no segments on canvas as HTML does', () => {
    const doc = buildDocument({ markdown: '# Title\n\nText.' }, config('center'));
    const h = heading(doc);
    for (const line of h.lines) delete line.segments;
    expect(canvasOffset(doc)).toBeCloseTo((h.bbox.width - h.lines[0]!.bbox.width) / 2, 3);
    expect(htmlOffset(doc)).toBeCloseTo((h.bbox.width - h.lines[0]!.bbox.width) / 2, 2);
  });

  it('aligns the default opener of a page-span heading like the heading', () => {
    const lineX = (doc: VDTDocument): number => {
      const band = doc.pages[0]!.openerBand!;
      const text = band.blocks.find((b): b is VDTDesignTextBlock => b.kind === 'text')!;
      return text.lines[0]!.xOffset;
    };
    expect(lineX(buildDocument({ markdown: '# Title\n\nText.' }, config('left', 'page')))).toBe(0);
    expect(lineX(buildDocument({ markdown: '# Title\n\nText.' }, config('center', 'page')))).toBeGreaterThan(0);
    const centre = lineX(buildDocument({ markdown: '# Title\n\nText.' }, config('center', 'page')));
    const right = lineX(buildDocument({ markdown: '# Title\n\nText.' }, config('right', 'page')));
    expect(right).toBeCloseTo(centre * 2, 3);
  });
});
