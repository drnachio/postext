import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument, renderPageToCanvas, registerResourceImage, clearResourceImages, pageComics } from '../../index';
import type { Resource } from '../../types';

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

/** A 2D context that logs the calls the panel painter makes. */
function recordingCanvas(): { canvas: HTMLCanvasElement; calls: string[] } {
  const calls: string[] = [];
  const logged = new Set(['clip', 'stroke', 'drawImage', 'fillRect', 'scale', 'translate', 'arcTo']);
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (typeof key === 'string' && logged.has(key)) {
        return (...args: number[]) => {
          calls.push(`${key}(${args.filter((a) => typeof a === 'number').map((a) => Math.round(a)).join(',')})`);
        };
      }
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) {
      if (key === 'strokeStyle' || key === 'fillStyle') calls.push(`${String(key)}=${String(value)}`);
      target[key] = value;
      return true;
    },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

const resources: Resource[] = [
  { id: 'pic', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0, bitmap: { fileId: 'pic-file', format: 'png', width: 1000, height: 1000 } },
];

afterEach(() => clearResourceImages());

describe('canvas painting of comic panels', () => {
  it('fills, clips, draws the art and strokes the border of every panel, flipped when mirrored', () => {
    registerResourceImage('pic-file', { width: 1000, height: 1000 } as unknown as HTMLImageElement);
    const md = ':::page{split="50 / *"}\n::panel{art=pic bg="#ff0000"}\n::panel{art=pic mirror border=none}\n:::';
    const doc = buildDocument({ markdown: md, resources }, {});
    const page = doc.pages.find((p) => p.comic)!;
    expect(page.comic!.panels[1]!.art!.mirrored).toBe(true);
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(page, doc, canvas);
    const at = (s: string, from = 0) => calls.findIndex((c, i) => i >= from && c.startsWith(s));
    const red = at('fillStyle=#ff0000');
    expect(red).toBeGreaterThan(-1);
    const firstDraw = at('drawImage', red);
    expect(firstDraw).toBeGreaterThan(red);
    expect(at('stroke', firstDraw)).toBeGreaterThan(firstDraw);
    // The second panel: a horizontal flip before its picture, no border.
    const flip = calls.indexOf('scale(-1,1)');
    expect(flip).toBeGreaterThan(firstDraw);
    expect(at('drawImage', flip)).toBeGreaterThan(flip);
    expect(calls.filter((c) => c === 'stroke()')).toHaveLength(1);
  });

  it('paints a strip set in the flow on the sheet, where its block sits', () => {
    registerResourceImage('pic-file', { width: 1000, height: 1000 } as unknown as HTMLImageElement);
    const md = 'Some text.\n\n:::strip{split="* | *"}\n::panel{art=pic bg="#00ff00"}\n::panel{art=pic}\n:::\n\nMore text.';
    const doc = buildDocument({ markdown: md, resources }, {});
    const page = doc.pages[0]!;
    const block = page.columns[0]!.blocks.find((b) => b.comic)!;
    const onSheet = pageComics(page)[0]!;
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(page, doc, canvas);
    const green = calls.indexOf('fillStyle=#00ff00');
    expect(green).toBeGreaterThan(-1);
    // Both pictures drawn at their box on the sheet (the block's place
    // added to the strip's own coordinates).
    const draws = calls.filter((c) => c.startsWith('drawImage'));
    expect(draws).toHaveLength(2);
    const box = onSheet.panels[0]!.art!.box;
    expect(box.y).toBeCloseTo(block.comic!.panels[0]!.art!.box.y + block.bbox.y, 3);
    expect(draws[0]).toContain(`${Math.round(box.x)},${Math.round(box.y)}`);
    expect(calls.filter((c) => c === 'stroke()')).toHaveLength(2);
  });

  it('paints each page of a spread with its half, a panel across the spine on both', () => {
    registerResourceImage('pic-file', { width: 1000, height: 1000 } as unknown as HTMLImageElement);
    const md = ':::page{spread split="*"}\n::panel{art=pic}\n:::';
    const doc = buildDocument({ markdown: md, resources }, {});
    const [left, right] = doc.pages.filter((p) => p.comic);
    for (const page of [left!, right!]) {
      const { canvas, calls } = recordingCanvas();
      renderPageToCanvas(page, doc, canvas);
      expect(calls.filter((c) => c.startsWith('clip'))).not.toHaveLength(0);
      expect(calls.filter((c) => c.startsWith('drawImage'))).toHaveLength(1);
      expect(calls.filter((c) => c === 'stroke()')).toHaveLength(1);
    }
    // The right page draws the same picture a page's width to the left.
    const l = left!.comic!.panels[0]!.art!.box;
    const r = right!.comic!.panels[0]!.art!.box;
    expect(l.x - r.x).toBeCloseTo(left!.width - 2 * doc.trimOffset, 3);
  });

  it('draws rough borders and rounded corners', () => {
    const md = ':::page{split="*"}\n::panel{style=sketch}\n:::';
    const config = { comics: { panelStyles: [{ id: 'sketch', borderStyle: 'rough' as const, borderRadius: { value: 3, unit: 'mm' as const } }] } };
    const doc = buildDocument({ markdown: md, resources }, config);
    const page = doc.pages.find((p) => p.comic)!;
    expect(page.comic!.panels[0]!.radius).toBeGreaterThan(0);
    expect(page.comic!.panels[0]!.border.style).toBe('rough');
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(page, doc, canvas);
    expect(calls.some((c) => c.startsWith('arcTo'))).toBe(true);
    expect(calls.filter((c) => c === 'stroke()')).toHaveLength(1);
  });
});
