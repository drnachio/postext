// #1626: a long book sets more distinct words than the width cache once
// held; a word measured at its start is not measured again at its end.

import { describe, expect, it } from 'vitest';

let measured = 0;
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    measured++;
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const { measureTextWidth } = await import('../../measure/canvas.js');

describe('the cache of word widths', () => {
  it('still holds a word after 150,000 others', () => {
    const font = '400 16px Lora';
    expect(measureTextWidth('first', font)).toBe(35);
    for (let i = 0; i < 150_000; i++) measureTextWidth(`w${i}`, font);
    const before = measured;
    expect(measureTextWidth('first', font)).toBe(35);
    expect(measureTextWidth('w7', font)).toBe(14);
    expect(measured).toBe(before);
  });
});
