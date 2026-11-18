// #1630: the canvas gives a word's width and its ink box in one answer;
// the ink of an Arabic word whose width is known is not asked for again.

import { describe, expect, it } from 'vitest';

let measured = 0;
class StubCtx {
  font = '';
  measureText(s: string): { width: number; actualBoundingBoxAscent: number; actualBoundingBoxDescent: number } {
    measured++;
    return { width: s.length * 7, actualBoundingBoxAscent: 10 + s.length, actualBoundingBoxDescent: s.length / 2 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const { measureTextWidth, measureInkBox, evictTextWidths } = await import('../../measure/canvas.js');

const FONT = '400 16px Amiri';

describe('the ink of a word measured for its width', () => {
  it('is what the canvas answers, without a second call, for a word in Arabic script', () => {
    expect(measureTextWidth('كِتَابٌ', FONT)).toBe(49);
    const before = measured;
    expect(measureInkBox('كِتَابٌ', FONT)).toEqual({ ascent: 17, descent: 3.5 });
    expect(measured).toBe(before);
  });

  it('is asked of the canvas for a word never measured, and for one in another font', () => {
    const before = measured;
    expect(measureInkBox('قَلَمٌ', FONT)).toEqual({ ascent: 16, descent: 3 });
    expect(measureInkBox('كِتَابٌ', '700 16px Amiri')).toEqual({ ascent: 17, descent: 3.5 });
    expect(measured).toBe(before + 2);
  });

  it('is not kept for a word in another script', () => {
    measureTextWidth('book', FONT);
    const before = measured;
    expect(measureInkBox('book', FONT)).toEqual({ ascent: 14, descent: 2 });
    expect(measured).toBe(before + 1);
  });

  it('is dropped with the widths when the fonts change', () => {
    measureTextWidth('بَيْتٌ', FONT);
    evictTextWidths(['Amiri']);
    const before = measured;
    measureInkBox('بَيْتٌ', FONT);
    expect(measured).toBe(before + 1);
    measureTextWidth('بَيْتٌ', FONT);
    evictTextWidths(null);
    measureInkBox('بَيْتٌ', FONT);
    expect(measured).toBe(before + 3);
  });
});
