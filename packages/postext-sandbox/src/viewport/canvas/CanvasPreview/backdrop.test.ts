import { describe, expect, it } from 'vitest';
import { DARK_GROUND, groundLuminance, luminanceOf, type LuminanceGrid } from './backdrop.js';

/** A grid of `width` × `height` cells from a function of the cell. */
function gridOf(width: number, height: number, at: (x: number, y: number) => number): LuminanceGrid {
  const lum = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) lum[y * width + x] = at(x, y);
  return { width, height, lum };
}

describe('the ground under a mark (#1712)', () => {
  it('reads pixels over white paper', () => {
    const lum = luminanceOf(new Uint8ClampedArray([0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 0, 255, 0, 0, 255]));
    expect([...lum]).toEqual([0, 255, 255, 54]);
  });
  it('a black page with white text is dark, a white one with black text is not', () => {
    // A third of every row is ink.
    const black = gridOf(30, 30, (x) => (x % 3 === 0 ? 255 : 0));
    const white = gridOf(30, 30, (x) => (x % 3 === 0 ? 0 : 255));
    expect(groundLuminance(black, 0.1, 0.1, 0.9, 0.2)).toBeLessThan(DARK_GROUND);
    expect(groundLuminance(white, 0.1, 0.1, 0.9, 0.2)).toBeGreaterThan(DARK_GROUND);
  });
  it('is read mark by mark: a light box on a dark page', () => {
    const page = gridOf(40, 40, (x, y) => (x >= 20 && y < 20 ? 240 : 0));
    expect(groundLuminance(page, 0.55, 0.1, 0.95, 0.2)).toBeGreaterThan(DARK_GROUND);
    expect(groundLuminance(page, 0.05, 0.1, 0.45, 0.2)).toBeLessThan(DARK_GROUND);
    expect(groundLuminance(page, 0.55, 0.6, 0.95, 0.7)).toBeLessThan(DARK_GROUND);
  });
  it('a region off the page or thinner than a cell reads the nearest cells', () => {
    const page = gridOf(10, 10, () => 0);
    expect(groundLuminance(page, 0.501, 0.2, 0.502, 0.4)).toBe(0);
    expect(groundLuminance(page, 1.2, 1.2, 1.4, 1.4)).toBe(0);
    expect(groundLuminance(page, -0.4, -0.4, -0.2, -0.2)).toBe(0);
  });
});
