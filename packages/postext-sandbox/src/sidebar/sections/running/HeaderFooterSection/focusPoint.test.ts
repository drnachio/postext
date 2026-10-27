import { describe, expect, it } from 'vitest';
import { focusFromPercent, focusFromPointer, focusPercent } from './focusPoint.js';

describe('cover focus point (#945)', () => {
  const rect = { left: 100, top: 50, width: 200, height: 100 };

  it('reads a press over the picture as fractions of it, to the hundredth', () => {
    expect(focusFromPointer(rect, 150, 60)).toEqual({ x: 0.25, y: 0.1 });
    expect(focusFromPointer(rect, 100, 150)).toEqual({ x: 0, y: 1 });
    expect(focusFromPointer(rect, 233, 99)).toEqual({ x: 0.67, y: 0.49 });
  });

  it('holds the point inside the picture', () => {
    expect(focusFromPointer(rect, 0, 500)).toEqual({ x: 0, y: 1 });
    expect(focusFromPointer(rect, 900, -20)).toEqual({ x: 1, y: 0 });
  });

  it('has no point on a picture drawn with no size', () => {
    expect(focusFromPointer({ left: 0, top: 0, width: 0, height: 10 }, 1, 1)).toBeNull();
  });

  it('goes between fractions and whole percentages', () => {
    expect(focusPercent(0.5)).toBe(50);
    expect(focusPercent(0.666)).toBe(67);
    expect(focusPercent(-1)).toBe(0);
    expect(focusPercent(3)).toBe(100);
    expect(focusFromPercent(30)).toBe(0.3);
    expect(focusFromPercent(130)).toBe(1);
    expect(focusFromPercent(-4)).toBe(0);
  });
});
