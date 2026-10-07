import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument, renderPageToCanvas, registerResourceImage, clearResourceImages } from '../../index';
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
