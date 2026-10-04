import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../index';

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

/** A 2D context that records `scale`, `translate` and `stroke` and
 *  swallows every other call. */
function recordingCanvas(): { canvas: HTMLCanvasElement; scales: [number, number][]; translates: [number, number][]; strokes: number } {
  const scales: [number, number][] = [];
  const translates: [number, number][] = [];
  const rec = { strokes: 0 };
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (key === 'scale') return (x: number, y: number) => { scales.push([x, y]); };
      if (key === 'translate') return (x: number, y: number) => { translates.push([x, y]); };
      if (key === 'stroke') return () => { rec.strokes++; };
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return {
    canvas,
    scales,
    translates,
    get strokes() {
      return rec.strokes;
    },
  };
}

describe('renderPageToCanvas', () => {
  it('stretches the page over the whole bitmap, so no edge column is left half painted', () => {
    // 210 × 280 mm at 96 dpi: 793.7 × 1058.3 px — not whole pixels.
    const mm = (value: number) => ({ value, unit: 'mm' as const });
    const doc = buildDocument({ markdown: 'Text.' }, { page: { sizePreset: 'custom', width: mm(210), height: mm(280), dpi: 96 } });
    const page = doc.pages[0]!;
    expect(Number.isInteger(page.width)).toBe(false);
    for (const scale of [1, 0.4837]) {
      const { canvas, scales } = recordingCanvas();
      renderPageToCanvas(page, doc, canvas, { scale });
      const [sx, sy] = scales[0] ?? [1, 1];
      expect(page.width * sx).toBeCloseTo(canvas.width, 6);
      expect(page.height * sy).toBeCloseTo(canvas.height, 6);
    }
  });

  it('paints the trim box alone with `trim`: no slug, no crop marks', () => {
    const mm = (value: number) => ({ value, unit: 'mm' as const });
    const doc = buildDocument(
      { markdown: 'Text.' },
      { page: { sizePreset: 'custom', width: mm(150), height: mm(200), dpi: 96, cutLines: { enabled: true } } },
    );
    const page = doc.pages[0]!;
    expect(doc.trimOffset).toBeGreaterThan(0);

    const sheet = recordingCanvas();
    renderPageToCanvas(page, doc, sheet.canvas);
    expect(sheet.canvas.width).toBe(Math.round(page.width));
    expect(sheet.strokes).toBeGreaterThan(0);

    const trimmed = recordingCanvas();
    renderPageToCanvas(page, doc, trimmed.canvas, { trim: true, scale: 0.5 });
    const t = doc.trimOffset;
    expect(trimmed.canvas.width).toBe(Math.round((page.width - 2 * t) * 0.5));
    expect(trimmed.canvas.height).toBe(Math.round((page.height - 2 * t) * 0.5));
    expect(trimmed.translates[0]).toEqual([-t, -t]);
    expect(trimmed.strokes).toBe(0);
  });

  it('`trim` changes nothing without cut lines', () => {
    const doc = buildDocument({ markdown: 'Text.' }, { page: { dpi: 96 } });
    const page = doc.pages[0]!;
    const { canvas, translates } = recordingCanvas();
    renderPageToCanvas(page, doc, canvas, { trim: true });
    expect(canvas.width).toBe(Math.round(page.width));
    expect(translates).toEqual([]);
  });
});
