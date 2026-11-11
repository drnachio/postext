import { describe, expect, it } from 'vitest';
import { bitmapColor } from './preflightInputs.js';

describe('bitmapColor', () => {
  it('reads a Photoshop document\'s colour mode', () => {
    const psd = new Uint8Array(26);
    psd.set([0x38, 0x42, 0x50, 0x53]);
    psd[25] = 4;
    expect(bitmapColor(psd)).toBe('cmyk');
    psd[25] = 1;
    expect(bitmapColor(psd)).toBe('gray');
  });

  it('reads a TIFF\'s PhotometricInterpretation', () => {
    // II*\0, directory at 8: one entry, tag 262 SHORT ×1.
    const tiff = new Uint8Array([0x49, 0x49, 42, 0, 8, 0, 0, 0, 1, 0, 6, 1, 3, 0, 1, 0, 0, 0, 5, 0, 0, 0, 0, 0, 0, 0]);
    expect(bitmapColor(tiff)).toBe('cmyk');
    tiff[18] = 2;
    expect(bitmapColor(tiff)).toBe('rgb');
  });
});
