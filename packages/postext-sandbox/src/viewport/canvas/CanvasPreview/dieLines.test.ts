import { describe, expect, it } from 'vitest';
import { dieCutPathData } from './dieLines.js';

describe('the die lines over a Canvas page (#1570)', () => {
  it('write each outline as SVG path data in page px', () => {
    expect(dieCutPathData([[
      { op: 'M', x: 10, y: 20 },
      { op: 'L', x: 30.123, y: 20 },
      { op: 'C', x1: 1, y1: 2, x2: 3, y2: 4, x: 5, y: 6 },
      { op: 'Q', x1: 7, y1: 8, x: 9, y: 10 },
      { op: 'Z' },
    ]])).toBe('M10 20 L30.12 20 C1 2 3 4 5 6 Q7 8 9 10 Z');
    expect(dieCutPathData([])).toBe('');
  });
});
