import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync as readFile } from 'node:fs';
import { unzipSync } from 'fflate';
import { bitmapInfo, bitmapSize, createBundle, readBundle, resourceFromSpec } from '../../bundle/index.js';
import { pictureResolution } from '../../word/index.js';
import type { BundleManifestV2 } from '../../bundle/index.js';
import type { PostextConfig, Resource } from '../../types.js';

// #631: the resolution a bitmap's file states (PNG pHYs, JPEG JFIF and
// EXIF, WebP EXIF), read with its size; bundles carry a declared and a
// read resolution. The fixtures are 4 × 3 px pictures written by Pillow.

const readFileSync = readFile as (path: URL) => Uint8Array;
const fixture = (name: string) => readFileSync(new URL(`./fixtures/${name}`, import.meta.url));

describe('bitmapInfo', () => {
  it('reads a PNG pHYs of 11811 px/m as 300 ppi', () => {
    expect(bitmapInfo(fixture('phys-300.png'))).toEqual({ width: 4, height: 3, resolution: { x: 300, y: 300, source: 'pHYs' } });
  });

  it('a PNG without pHYs has no resolution', () => {
    expect(bitmapInfo(fixture('no-phys.png'))).toEqual({ width: 4, height: 3 });
  });

  it('reads a JPEG JFIF density in dpi and in dots per cm', () => {
    expect(bitmapInfo(fixture('jfif-300.jpg'))).toEqual({ width: 4, height: 3, resolution: { x: 300, y: 300, source: 'jfif' } });
    // 118 dots per cm.
    expect(bitmapInfo(fixture('jfif-dpcm.jpg'))).toEqual({ width: 4, height: 3, resolution: { x: 299.72, y: 299.72, source: 'jfif' } });
  });

  it('EXIF wins over JFIF when both are there', () => {
    expect(bitmapInfo(fixture('jfif72-exif300.jpg'))).toEqual({ width: 4, height: 3, resolution: { x: 300, y: 300, source: 'exif' } });
  });

  it('reads the EXIF chunk of a WebP', () => {
    expect(bitmapInfo(fixture('exif-240.webp'))).toEqual({ width: 4, height: 3, resolution: { x: 240, y: 240, source: 'exif' } });
  });

  // #1690: the print originals, written by ImageMagick.
  it('reads a TIFF in either byte order, its resolution in inches or centimetres', () => {
    expect(bitmapInfo(fixture('tiff-300-le.tif'))).toEqual({ width: 4, height: 3, resolution: { x: 300, y: 300, source: 'tiff' } });
    // 118.11 px/cm, big-endian.
    expect(bitmapInfo(fixture('tiff-cm-be.tif'))).toEqual({ width: 4, height: 3, resolution: { x: 300, y: 300, source: 'tiff' } });
  });

  it('reads a TIFF without a resolution, or with unit none, as pixels alone', () => {
    // II*\0, IFD at 8: ImageWidth 600 (SHORT), ImageLength 400 (LONG), ResolutionUnit 1.
    const tiff = new Uint8Array(8 + 2 + 3 * 12 + 4);
    const v = new DataView(tiff.buffer);
    tiff.set([0x49, 0x49, 42, 0]);
    v.setUint32(4, 8, true);
    v.setUint16(8, 3, true);
    const entry = (k: number, tag: number, type: number, value: number) => {
      const at = 10 + k * 12;
      v.setUint16(at, tag, true);
      v.setUint16(at + 2, type, true);
      v.setUint32(at + 4, 1, true);
      if (type === 3) v.setUint16(at + 8, value, true);
      else v.setUint32(at + 8, value, true);
    };
    entry(0, 0x0100, 3, 600);
    entry(1, 0x0101, 4, 400);
    entry(2, 0x0128, 3, 1);
    expect(bitmapInfo(tiff)).toEqual({ width: 600, height: 400 });
    // Cut before the directory: not read.
    expect(bitmapInfo(tiff.subarray(0, 9))).toBeUndefined();
  });

  it('reads a Photoshop document, its resolution always in pixels per inch', () => {
    expect(bitmapInfo(fixture('psd-300.psd'))).toEqual({ width: 4, height: 3, resolution: { x: 300, y: 300, source: 'psd' } });
    // Shown in px/cm, stored in ppi.
    expect(bitmapInfo(fixture('psd-cm.psd'))).toEqual({ width: 4, height: 3, resolution: { x: 300, y: 300, source: 'psd' } });
    // The header alone: the size, no resolution.
    expect(bitmapInfo(fixture('psd-300.psd').subarray(0, 26))).toEqual({ width: 4, height: 3 });
  });

  it('a GIF has none', () => {
    expect(bitmapInfo(fixture('plain.gif'))).toEqual({ width: 4, height: 3 });
  });

  it('bitmapSize keeps returning the pixels alone', () => {
    expect(bitmapSize(fixture('phys-300.png'))).toEqual({ width: 4, height: 3 });
    expect(bitmapInfo(new Uint8Array([1, 2, 3]))).toBeUndefined();
  });
});

describe('bundles carry the resolutions (#631)', () => {
  const photo = (bitmap: Partial<NonNullable<Resource['bitmap']>> = {}): Resource => ({
    id: 'p', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'p.png', format: 'png', width: 4, height: 3, ...bitmap },
  });

  const reopen = async (resources: Resource[], config: PostextConfig = {}, options: { readResolution?: boolean } = {}) => {
    const { bytes } = await createBundle({ name: 'x', locale: 'en', markdown: '# T', config, resources, files: { 'p.png': fixture('phys-300.png') } });
    const opened = unzipSync(bytes);
    const manifest = JSON.parse(new TextDecoder().decode(opened['preset.json'])) as BundleManifestV2;
    const read = await readBundle(manifest, async (path) => opened[path]!.slice().buffer, { locale: 'en', ...options });
    return { manifest, bitmap: read.resources[0]!.bitmap! };
  };

  it('writes and reads a declared resolution', async () => {
    const { manifest, bitmap } = await reopen([photo({ resolution: 240 })]);
    expect(manifest.resources![0]!.resolution).toBe(240);
    expect(bitmap.resolution).toBe(240);
    expect(bitmap.fileResolution).toBeUndefined();
  });

  it("reads the file's resolution only under 'file', or when asked", async () => {
    expect((await reopen([photo()])).bitmap.fileResolution).toBeUndefined();
    expect((await reopen([photo()], { layout: { bitmapResolution: 'file' } })).bitmap.fileResolution).toBe(300);
    expect((await reopen([photo()], {}, { readResolution: true })).bitmap.fileResolution).toBe(300);
  });

  it('keeps a stored file resolution', async () => {
    const { manifest, bitmap } = await reopen([photo({ fileResolution: 144 })], { layout: { bitmapResolution: 'file' } });
    expect(manifest.resources![0]!.fileResolution).toBe(144);
    expect(bitmap.fileResolution).toBe(144);
  });

  it('resourceFromSpec places the fields in the bitmap', () => {
    const r = resourceFromSpec({ id: 'p', typeId: 'figure', kind: 'bitmap', file: 'p.jpg', width: 10, height: 5, resolution: 300, fileResolution: 72 });
    expect(r.bitmap).toEqual({ fileId: 'p.jpg', format: 'jpeg', width: 10, height: 5, resolution: 300, fileResolution: 72 });
    expect((r as unknown as Record<string, unknown>).resolution).toBeUndefined();
  });
});

describe('Word pictures (#631)', () => {
  it('a picture printed 2 inches wide with 600 px is at 300 ppi', () => {
    expect(pictureResolution({ widthEmu: 2 * 914400 }, 600)).toBe(300);
    expect(pictureResolution({}, 600)).toBeUndefined();
  });
});
