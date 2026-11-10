import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile } from 'node:fs';
import { decodePrintRaster, decodePsd, decodeTiff, printRasterFormat, rasterProfile, rasterToRgba } from '../../raster/index.js';

// Fixtures: a 20 × 10 picture whose pixel (x, y) is (12x, 25y, 7x + 11y)
// mod 256 — saved by macOS `sips` as TIFF and PSD and recompressed by
// libtiff's `tiffcp` (LZW, Deflate with the predictor, PackBits, tiles);
// a CMYK TIFF (C 12x, M 25y, Y 40, K 200 in the first column) chunky and
// planar; a 16-bit grey one (x × 3000).

const readFileSync = readFile as (path: URL) => Uint8Array;
const fixture = (name: string) => new Uint8Array(readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const rgbAt = (x: number, y: number) => [(x * 12) % 256, (y * 25) % 256, (x * 7 + y * 11) % 256];

describe('TIFF', () => {
  for (const name of ['rgb.tif', 'rgb-lzw.tif', 'rgb-zip-pred.tif', 'rgb-packbits.tif', 'rgb-tiled.tif']) {
    it(`reads ${name}`, () => {
      const r = decodeTiff(fixture(name));
      expect([r.width, r.height, r.color]).toEqual([20, 10, 'rgb']);
      for (const [x, y] of [[0, 0], [7, 3], [19, 9], [16, 9]] as const) {
        expect([...r.data.subarray((y * 20 + x) * 3, (y * 20 + x) * 3 + 3)]).toEqual(rgbAt(x, y));
      }
    });
  }

  it('reads CMYK, chunky and planar, as ink', () => {
    for (const name of ['cmyk.tif', 'cmyk-planar-lzw.tif']) {
      const r = decodeTiff(fixture(name));
      expect(r.color).toBe('cmyk');
      expect([...r.data.subarray(0, 4)]).toEqual([0, 0, 40, 200]);
      const at = (4 * 20 + 5) * 4;
      expect([...r.data.subarray(at, at + 4)]).toEqual([60, 100, 40, 0]);
    }
  });

  it('reads 16-bit grey to its high byte', () => {
    for (const name of ['gray16.tif', 'gray16-lzw.tif']) {
      const r = decodeTiff(fixture(name));
      expect(r.color).toBe('gray');
      expect(r.data[5]).toBe((5 * 3000) >> 8);
    }
  });

  it('keeps the ICC profile it carries', () => {
    const r = decodeTiff(fixture('rgb.tif'));
    expect(r.icc?.length).toBeGreaterThan(128);
    expect(rasterProfile(r)?.colorSpace).toBe('RGB');
  });
});

describe('Photoshop', () => {
  it('reads the composite image, its profile and its resolution', () => {
    const r = decodePsd(fixture('rgb.psd'));
    expect([r.width, r.height, r.color]).toEqual([20, 10, 'rgb']);
    expect([...r.data.subarray((3 * 20 + 7) * 3, (3 * 20 + 7) * 3 + 3)]).toEqual(rgbAt(7, 3));
    expect(r.resolution).toBe(72);
  });
});

describe('the print formats', () => {
  it('are told apart from their first bytes', () => {
    expect(printRasterFormat(fixture('rgb.tif'))).toBe('tiff');
    expect(printRasterFormat(fixture('rgb.psd'))).toBe('psd');
    expect(printRasterFormat(fixture('src.png'))).toBeUndefined();
    expect(() => decodePrintRaster(fixture('src.png'))).toThrow();
  });

  it('preview CMYK as the press would show it: no ink is white, solid black is dark', () => {
    const r = decodeTiff(fixture('cmyk.tif'));
    const rgba = rasterToRgba(r);
    expect(rgba.length).toBe(20 * 10 * 4);
    // First column: 200 K over 40 Y.
    expect(rgba[0]!).toBeLessThan(80);
    expect(rgba[3]).toBe(255);
  });
});
