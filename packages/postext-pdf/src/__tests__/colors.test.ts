import { describe, expect, it } from 'vitest';
import { hexToRgb } from '../colors';

describe('hexToRgb', () => {
  it('parses short and long hex', () => {
    expect(hexToRgb('#fff')).toEqual({ r: 1, g: 1, b: 1 });
    expect(hexToRgb('#ff0000')).toEqual({ r: 1, g: 0, b: 0 });
  });

  it('falls back to black for colour keywords of any length', () => {
    // MathJax paths may carry `none` or `red` as their fill; pdf-lib rejects NaN.
    expect(hexToRgb('none')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('red')).toEqual({ r: 0, g: 0, b: 0 });
    expect(hexToRgb('#none')).toEqual({ r: 0, g: 0, b: 0 });
  });
});
