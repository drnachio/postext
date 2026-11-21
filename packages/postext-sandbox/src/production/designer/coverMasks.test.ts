import { describe, expect, it } from 'vitest';
import { applyMask, maskAlpha } from './coverMasks.js';

const px = (pixels: number[][]) => ({ width: pixels.length, height: 1, data: new Uint8ClampedArray(pixels.flat()) });

describe('bitmap masks', () => {
  it('read a greyscale mask by its lightness, and one with transparency by that', () => {
    expect(Array.from(maskAlpha(px([[255, 255, 255, 255], [0, 0, 0, 255], [128, 128, 128, 255]])))).toEqual([255, 0, 128]);
    expect(Array.from(maskAlpha(px([[0, 0, 0, 255], [0, 0, 0, 0], [0, 0, 0, 100]])))).toEqual([255, 0, 100]);
  });

  it('lay the mask on the picture’s own transparency, or its inverse', () => {
    const picture = px([[10, 20, 30, 255], [10, 20, 30, 128], [10, 20, 30, 255]]);
    const alpha = new Uint8ClampedArray([255, 255, 0]);
    expect(Array.from(applyMask(picture, alpha))).toEqual([10, 20, 30, 255, 10, 20, 30, 128, 10, 20, 30, 0]);
    expect(Array.from(applyMask(picture, alpha, true)).filter((_, i) => i % 4 === 3)).toEqual([0, 0, 255]);
  });
});
