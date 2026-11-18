// #1632: the commands of a path are read once and kept by its text; the
// same outline set at two places still gives each its own path.

import { describe, expect, it } from 'vitest';
import { scale, transformPath, translate } from '../../math/pathTransform.js';

const OUTLINE = 'M10 20L30 40Q50 60 70 80T90 100Z';

describe('transformPath on a path read before', () => {
  it('gives each place its own path', () => {
    const first = transformPath(OUTLINE, translate(1, 2));
    const second = transformPath(OUTLINE, translate(100, 200));
    expect(first).not.toBe(second);
    expect(first.startsWith('M11 22')).toBe(true);
    expect(second.startsWith('M110 220')).toBe(true);
    // Asked again, the first place gives what it gave.
    expect(transformPath(OUTLINE, translate(1, 2))).toBe(first);
    expect(transformPath(OUTLINE, scale(2, 2)).startsWith('M20 40')).toBe(true);
  });

  it('still refuses a path that opens with a number, each time', () => {
    expect(() => transformPath('10 20', translate(1, 1))).toThrow();
    expect(() => transformPath('10 20', translate(1, 1))).toThrow();
  });
});
