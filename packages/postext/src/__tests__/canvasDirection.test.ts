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

/** A 2D context whose `direction` starts as `start` (a canvas in a
 *  right-to-left container inherits `rtl`), recording the direction every
 *  `fillText` runs with. */
function canvasWithDirection(start: string): { canvas: HTMLCanvasElement; ctx: Record<string, unknown>; seen: string[] } {
  const seen: string[] = [];
  const target: Record<string, unknown> = { direction: start };
  const ctx = new Proxy(target, {
    get(t, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key === 'fillText') return () => { seen.push(String(t.direction)); };
      if (typeof key === 'string' && key in t) return t[key];
      return () => undefined;
    },
    set(t, key, value) { t[key as string] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, ctx: target, seen };
}

describe('renderPageToCanvas and the text direction', () => {
  it('paints left to right in a right-to-left container, then puts the direction back', () => {
    const doc = buildDocument({ markdown: '# Title\n\nSome words of text.\n\n此開卷第一回也。' });
    const { canvas, ctx, seen } = canvasWithDirection('rtl');
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    expect(seen.length).toBeGreaterThan(0);
    expect(new Set(seen)).toEqual(new Set(['ltr']));
    expect(ctx.direction).toBe('rtl');
  });
});
