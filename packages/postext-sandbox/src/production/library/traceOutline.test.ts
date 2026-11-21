import { describe, it, expect } from 'vitest';
import { cornerColour, largestPolygon, traceOutline, type Pixels } from './traceOutline.js';

/** A picture `w` × `h` on a ground, with squares of ink. */
function picture(w: number, h: number, ground: [number, number, number, number], squares: { x: number; y: number; size: number }[]): Pixels {
  const data = new Uint8ClampedArray(w * h * 4);
  for (let p = 0; p < w * h; p++) data.set(ground, 4 * p);
  for (const s of squares) {
    for (let y = s.y; y < s.y + s.size; y++) for (let x = s.x; x < s.x + s.size; x++) data.set([200, 30, 30, 255], 4 * (y * w + x));
  }
  return { width: w, height: h, data };
}

const bounds = (poly: { x: number; y: number }[]) => ({
  x0: Math.min(...poly.map((p) => p.x)),
  x1: Math.max(...poly.map((p) => p.x)),
  y0: Math.min(...poly.map((p) => p.y)),
  y1: Math.max(...poly.map((p) => p.y)),
});

describe('traceOutline', () => {
  it('leaves a white ground out and follows the ink round', () => {
    const px = picture(40, 20, [255, 255, 255, 255], [{ x: 10, y: 5, size: 10 }]);
    const { outline, left } = traceOutline(px, { mode: 'auto', tolerance: 10 });
    expect(left).toBe('#ffffff');
    expect(outline).toHaveLength(1);
    expect(bounds(outline[0]!)).toEqual({ x0: 0.25, x1: 0.5, y0: 0.25, y1: 0.75 });
    // A square thins to its four corners.
    expect(outline[0]).toHaveLength(4);
  });

  it('reads a transparent ground by its corners, and keeps each part', () => {
    const px = picture(40, 40, [0, 0, 0, 0], [{ x: 2, y: 2, size: 8 }, { x: 25, y: 25, size: 10 }]);
    expect(cornerColour(px)).toBe('transparent');
    const { outline } = traceOutline(px, { mode: 'auto', tolerance: 0 });
    expect(outline).toHaveLength(2);
    expect(bounds(largestPolygon(outline)!)).toEqual({ x0: 0.625, x1: 0.875, y0: 0.625, y1: 0.875 });
  });

  it('drops specks smaller than a five-hundredth of the picture', () => {
    const px = picture(100, 100, [255, 255, 255, 255], [{ x: 10, y: 10, size: 4 }, { x: 50, y: 50, size: 20 }]);
    expect(traceOutline(px, { mode: 'colour', key: '#ffffff', tolerance: 5 }).outline).toHaveLength(1);
  });

  it('finds nothing in a flat picture', () => {
    expect(traceOutline(picture(10, 10, [255, 255, 255, 255], []), { mode: 'auto', tolerance: 5 }).outline).toEqual([]);
  });
});
