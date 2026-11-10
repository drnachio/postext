import { describe, it, expect } from 'vitest';
import { buildDocument, renderPageToCanvas, type PostextConfig, type RenderPageOptions } from '../../index.js';

// #1445: the canvas previews a number field as the PDF's form shows it: the
// value in the field's format, in the document's number style, set to the
// box's end inside the style's own padding (not the padding a least width
// adds, which the box spreads evenly).

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

interface Painted { text: string; x: number; fill: string }

/** A 2D context that records every fillText and every rect (a chip box's
 *  outline with square corners is one). */
function recordingCanvas(): { canvas: HTMLCanvasElement; texts: Painted[]; rects: number[][] } {
  const texts: Painted[] = [];
  const rects: number[][] = [];
  const ctx: Record<string | symbol, unknown> = new Proxy({ textBaseline: 'alphabetic', font: '', fillStyle: '' } as Record<string | symbol, unknown>, {
    get(target, key) {
      if (key === 'fillText') return (text: string, x: number) => { texts.push({ text, x, fill: String(target.fillStyle) }); };
      if (key === 'rect') return (...r: number[]) => { rects.push(r); };
      if (key === 'measureText') return (s: string) => ({ width: s.length * 7 });
      if (key in target) return target[key];
      return () => undefined;
    },
    set(target, key, value) { target[key] = value; return true; },
  });
  return { canvas: { width: 0, height: 0, getContext: () => ctx } as unknown as HTMLCanvasElement, texts, rects };
}

/** The outline of the chip box: a least width of 90 pt, stroked half its
 *  1 pt border inside the edge. */
const boxOutline = (rects: number[][]): number[] => rects.find((r) => Math.abs(r[2]! - 89) < 1e-6)!;

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

function config(locale: string): PostextConfig {
  return {
    page: { dpi: 72, width: pt(300), height: pt(200), margins: { top: pt(18), bottom: pt(18), left: pt(18), right: pt(18) } },
    locale,
    chipStyles: [{ id: 'field', backgroundEnabled: false, borderColor: hex('#999999'), borderWidth: pt(1), borderRadius: pt(0), paddingX: pt(3), minWidth: pt(90), color: hex('#123456') }],
  };
}

function paint(markdown: string, locale: string, options?: RenderPageOptions) {
  const doc = buildDocument({ markdown }, config(locale));
  const { canvas, texts, rects } = recordingCanvas();
  renderPageToCanvas(doc.pages[0]!, doc, canvas, { scale: 1, ...options });
  return { texts, rects };
}

describe('number fields on the canvas (#1445)', () => {
  it('shows the value formatted in the document language, at the box end', () => {
    const { texts, rects } = paint('Price :chip[1234.5]{style="field" field="price" format="currency"}', 'de');
    const value = texts.find((t) => t.text === '€ 1.234,50');
    expect(value).toBeDefined();
    expect(texts.some((t) => t.text.includes('1234.5'))).toBe(false);
    expect(value!.fill.toLowerCase()).toBe('#123456');
    // The outline is stroked half a border inside the box: its right edge is
    // the box's end less half the border; the value ends a border and the
    // style's padding (3 pt) inside the box.
    const [rx, , rw] = boxOutline(rects);
    const boxEnd = rx! + rw! + 0.5;
    expect(value!.x + value!.text.length * 7).toBeCloseTo(boxEnd - 1 - 3, 6);
  });

  it('writes the separators of the language, or the ones the options set', () => {
    const md = 'Total :chip[1234.5]{style="field" field="total" format="decimal"}';
    expect(paint(md, 'en').texts.some((t) => t.text === '1,234.50')).toBe(true);
    const custom = paint('Total :chip[1234.5]{style="field" field="total" format="currency"}', 'en', { forms: { currency: 'CHF', currencyBefore: false, separatorStyle: 1 } });
    expect(custom.texts.some((t) => t.text === '1234.50 CHF')).toBe(true);
  });

  it('sets an unformatted number to the end too, and leaves text fields as chips', () => {
    const number = paint('Qty :chip[3]{style="field" field="qty" kind="number"}', 'en');
    const qty = number.texts.find((t) => t.text === '3')!;
    const [rx, , rw] = boxOutline(number.rects);
    expect(qty.x + 7).toBeCloseTo(rx! + rw! + 0.5 - 1 - 3, 6);
    const text = paint('Name :chip[Ann]{style="field" field="name"}', 'en');
    const name = text.texts.find((t) => t.text === 'Ann')!;
    const [tx, , tw] = boxOutline(text.rects);
    // Centred in the least width, as any chip.
    expect(name.x - (tx! - 0.5)).toBeCloseTo((tx! + tw! + 0.5) - (name.x + 21), 6);
  });
});
