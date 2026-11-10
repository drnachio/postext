import { describe, expect, it } from 'vitest';
import { parseFontString } from '../fontString.js';

describe('parseFontString', () => {
  it('reads the shapes buildFontString writes', () => {
    expect(parseFontString('italic 700 16px "EB Garamond"')).toEqual({ family: 'EB Garamond', weight: 700, style: 'italic', sizePx: 16 });
    expect(parseFontString('400 12.5px Lora')).toEqual({ family: 'Lora', weight: 400, style: 'normal', sizePx: 12.5 });
    expect(parseFontString('bold 9px "Crimson Pro", "Noto Sans Math"')).toEqual({
      family: 'Crimson Pro', weight: 700, style: 'normal', sizePx: 9, fallbacks: ['Noto Sans Math'],
    });
  });

  it('takes the first size followed by a family, and rejects a string without one', () => {
    expect(parseFontString('normal 300 10px "Area 51px Sans"')?.sizePx).toBe(10);
    expect(parseFontString('16px')).toBeNull();
    expect(parseFontString('italic Lora')).toBeNull();
  });

  it('reads a long run of digits in linear time (CodeQL js/polynomial-redos)', () => {
    const long = '0'.repeat(200_000) + 'x';
    const t0 = performance.now();
    expect(parseFontString(long)).toBeNull();
    expect(performance.now() - t0).toBeLessThan(500);
  });
});
