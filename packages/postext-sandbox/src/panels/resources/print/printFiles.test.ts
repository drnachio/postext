import { describe, expect, it } from 'vitest';
import { downscaleRgba } from './downscale.js';
import { fitScale, MAX_CANVAS_PIXELS, sniffPrintFile } from './printFiles.js';

const bytes = (s: string) => new TextEncoder().encode(s);

describe('print files', () => {
  it('tells a PDF from PostScript by its first bytes', () => {
    expect(sniffPrintFile(bytes('%PDF-1.7\n'))).toBe('pdf');
    expect(sniffPrintFile(bytes('\n\n%PDF-1.4'))).toBe('pdf');
    expect(sniffPrintFile(bytes('%!PS-Adobe-3.0 EPSF-3.0'))).toBe('postscript');
    expect(sniffPrintFile(new Uint8Array([0xc5, 0xd0, 0xd3, 0xc6, 0, 0]))).toBe('postscript');
    expect(sniffPrintFile(bytes('GIF89a'))).toBeUndefined();
  });

  it('keeps a picture within what a canvas draws', () => {
    expect(fitScale(1000, 1000)).toBe(1);
    const k = fitScale(8000, 6000);
    expect(8000 * k * 6000 * k).toBeLessThanOrEqual(MAX_CANVAS_PIXELS + 1);
  });

  it('averages the pixels it shrinks', () => {
    const src = new Uint8ClampedArray([0, 0, 0, 255, 200, 100, 50, 255, 0, 0, 0, 255, 200, 100, 50, 255]);
    const out = downscaleRgba(src, 2, 2, 0.5);
    expect([out.width, out.height]).toEqual([1, 1]);
    expect(Array.from(out.rgba)).toEqual([100, 50, 25, 255]);
  });
});
