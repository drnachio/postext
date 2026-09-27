import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, renderToHtml } from '../../index';
import { dimensionToPx } from '../../units';
import type { PostextConfig } from '../../types';
import type { VDTDocument } from '../../vdt';

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

type Call = { op: string; args: unknown[] };

/** A 2D context that records every method call, in order. */
function recordingCanvas(): { canvas: HTMLCanvasElement; calls: Call[] } {
  const calls: Call[] = [];
  const ctx: Record<string | symbol, unknown> = new Proxy({}, {
    get(target: Record<string | symbol, unknown>, key) {
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return (...args: unknown[]) => { calls.push({ op: String(key), args }); };
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  const canvas = { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement;
  return { canvas, calls };
}

const mm = (value: number) => ({ value, unit: 'mm' as const });

/** A 150 mm disc anchored to the page's top-right corner, pushed 30 mm out:
 *  most of it lies past the trim, the bleed and the sheet's edge. */
function config(cutLines: boolean): PostextConfig {
  return {
    page: {
      sizePreset: 'custom', width: mm(150), height: mm(200), dpi: 72,
      margins: { top: mm(20), bottom: mm(20), left: mm(15), right: mm(15) },
      ...(cutLines ? { cutLines: { enabled: true, bleed: mm(3) } } : {}),
    },
    layout: { layoutType: 'single' },
    header: {
      elements: [{
        kind: 'box', id: 'sun',
        placement: { anchor: { to: 'page', edge: 'top-right' }, offset: { x: mm(30), y: mm(25) }, size: { width: mm(150), height: mm(150) } },
        style: { backgroundColor: { hex: '#ffcc00', model: 'hex' }, borderRadius: mm(75) },
      }],
    },
    footer: { elements: [] },
  };
}

function bleedBox(doc: VDTDocument) {
  const page = doc.pages[0]!;
  const inset = doc.trimOffset - dimensionToPx(doc.config.page.cutLines.bleed, doc.config.page.dpi);
  return [inset, inset, page.width - 2 * inset, page.height - 2 * inset];
}

describe('slot art is clipped to the bleed box when cut lines are on (EF-133)', () => {
  it('canvas: paints the page art inside a bleed-box clip, and the marks outside it', () => {
    const doc = buildDocument({ markdown: 'Text.' }, config(true));
    expect(doc.trimOffset).toBeGreaterThan(0);
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const ops = calls.map((c) => c.op);
    const clipRect = calls.findIndex((c) => c.op === 'rect' && JSON.stringify(c.args) === JSON.stringify(bleedBox(doc)));
    expect(clipRect).toBeGreaterThan(-1);
    expect(ops[clipRect + 1]).toBe('clip');
    // The disc (a rounded path filled in yellow) is painted inside the clip…
    const fill = ops.indexOf('fill', clipRect);
    expect(fill).toBeGreaterThan(clipRect);
    // …and the clip is lifted before the crop marks are stroked.
    const restore = ops.indexOf('restore', fill);
    const firstMark = ops.indexOf('stroke', fill);
    expect(restore).toBeGreaterThan(fill);
    expect(firstMark).toBeGreaterThan(restore);
  });

  it('canvas: adds no clip without cut lines', () => {
    const doc = buildDocument({ markdown: 'Text.' }, config(false));
    const { canvas, calls } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas);
    const page = doc.pages[0]!;
    expect(calls.some((c) => c.op === 'rect' && JSON.stringify(c.args) === JSON.stringify([0, 0, page.width, page.height]))).toBe(false);
  });

  it('HTML: clips the page to the bleed box with cut lines, and not without', () => {
    const withMarks = buildDocument({ markdown: 'Text.' }, config(true));
    const [inset] = bleedBox(withMarks);
    expect(renderToHtml(withMarks)).toContain(`clip-path:inset(${inset}px)`);
    const plain = buildDocument({ markdown: 'Text.' }, config(false));
    expect(renderToHtml(plain)).not.toContain('clip-path:inset(');
  });
});
