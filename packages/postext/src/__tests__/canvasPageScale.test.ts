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

/** A 2D context that records `scale` and swallows every other call. */
function recordingCanvas(): { canvas: HTMLCanvasElement; scales: [number, number][] } {
  const scales: [number, number][] = [];
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (key === 'scale') return (x: number, y: number) => { scales.push([x, y]); };
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, scales };
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
});
