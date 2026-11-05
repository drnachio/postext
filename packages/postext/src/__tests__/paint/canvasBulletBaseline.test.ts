import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas } from '../../index.js';
import { fontSizePxOf } from '../../measure/breakRules.js';

// A list bullet is set on the canvas the way the PDF sets it (postext-pdf
// `markers.ts`): its alphabetic baseline 0.3 em of its own size below
// `bulletY`. With `textBaseline = 'middle'` a bullet from a face with tall
// ascent and descent (a symbol font) sat higher on screen than in the PDF.

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

/** A 2D context that records every fillText with the baseline and font in force. */
function recordingCanvas(): { canvas: HTMLCanvasElement; texts: { text: string; y: number; baseline: string; font: string }[] } {
  const texts: { text: string; y: number; baseline: string; font: string }[] = [];
  const ctx: Record<string | symbol, unknown> = new Proxy({ textBaseline: 'alphabetic', font: '' } as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key === 'fillText') return (text: string, _x: number, y: number) => { texts.push({ text, y, baseline: String(target.textBaseline), font: String(target.font) }); };
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, texts };
}

describe('list bullets on the canvas', () => {
  it('sit on their alphabetic baseline 0.3 em below bulletY, as in the PDF', () => {
    const pt = (value: number) => ({ value, unit: 'pt' as const });
    const doc = buildDocument({ markdown: '- First item\n- Second item' }, {
      page: { dpi: 72, width: pt(300), height: pt(200), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
      bodyText: { fontFamily: 'Lora', fontSize: pt(9) },
      unorderedLists: { bulletChar: '➔', bulletFontSize: pt(7) },
    });
    const items = doc.blocks.filter((b) => b.type === 'listItem');
    expect(items).toHaveLength(2);
    const { canvas, texts } = recordingCanvas();
    renderPageToCanvas(doc.pages[0]!, doc, canvas, { scale: 1 });
    const bullets = texts.filter((t) => t.text === '➔');
    expect(bullets).toHaveLength(2);
    for (const [i, b] of bullets.entries()) {
      expect(b.baseline).toBe('alphabetic');
      expect(b.y).toBeCloseTo(items[i]!.bulletY! + fontSizePxOf(items[i]!.bulletFontString!) * 0.3, 6);
    }
  });
});
