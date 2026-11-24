// Print originals (#1690): a TIFF or Photoshop picture is placed at the
// size its file states, as the JPEG of the same picture is, and the
// export can link a bitmap's original in place of its screen preview.

import { describe, expect, it } from 'vitest';
import { strFromU8, unzipSync } from 'fflate';
import type { Resource } from 'postext';
import { build, config } from '../testing/kit.test-helper.js';
import { idmlDocument } from './index.js';
import type { IdmlOptions } from './writer.js';

const W = 600;
const H = 400;
const PPI = 300;

/** A JPEG's header: JFIF at 300 dpi and a start of frame of W × H. */
function jpeg(): Uint8Array {
  return Uint8Array.from([
    0xff, 0xd8,
    0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 1, PPI >> 8, PPI & 0xff, PPI >> 8, PPI & 0xff, 0, 0,
    0xff, 0xc0, 0, 11, 8, H >> 8, H & 0xff, W >> 8, W & 0xff, 1, 1, 0x11, 0,
    0xff, 0xd9,
  ]);
}

/** A TIFF's header and first directory: W × H at 300 ppi, in either byte
 *  order. */
function tiff(le: boolean): Uint8Array {
  const out = new Uint8Array(8 + 2 + 5 * 12 + 4 + 16);
  const v = new DataView(out.buffer);
  out.set(le ? [0x49, 0x49, 42, 0] : [0x4d, 0x4d, 0, 42]);
  v.setUint32(4, 8, le);
  v.setUint16(8, 5, le);
  const rationals = 8 + 2 + 5 * 12 + 4;
  const entries: [number, number, number][] = [[0x0100, 3, W], [0x0101, 4, H], [0x011a, 5, rationals], [0x011b, 5, rationals + 8], [0x0128, 3, 2]];
  entries.forEach(([tag, type, value], k) => {
    const at = 10 + k * 12;
    v.setUint16(at, tag, le);
    v.setUint16(at + 2, type, le);
    v.setUint32(at + 4, 1, le);
    if (type === 3) v.setUint16(at + 8, value, le);
    else v.setUint32(at + 8, value, le);
  });
  for (const at of [rationals, rationals + 8]) {
    v.setUint32(at, PPI, le);
    v.setUint32(at + 4, 1, le);
  }
  return out;
}

/** A Photoshop document's header and image resources: W × H, its
 *  `ResolutionInfo` at 300 ppi shown in px/cm (the value stays ppi). */
function psd(): Uint8Array {
  const out = new Uint8Array(26 + 4 + 4 + 12 + 16);
  const v = new DataView(out.buffer);
  out.set([0x38, 0x42, 0x50, 0x53]);
  v.setUint16(4, 1);
  v.setUint16(12, 3);
  v.setUint32(14, H);
  v.setUint32(18, W);
  v.setUint16(22, 8);
  v.setUint16(24, 3);
  v.setUint32(26, 0); // colour mode data
  v.setUint32(30, 12 + 16); // image resources
  out.set([0x38, 0x42, 0x49, 0x4d], 34);
  v.setUint16(38, 1005);
  v.setUint32(42, 16);
  v.setUint32(46, PPI * 65536);
  v.setUint16(50, 2);
  v.setUint32(54, PPI * 65536);
  v.setUint16(58, 2);
  return out;
}

const picture = (over: Partial<Resource> = {}): Resource =>
  ({
    id: 'pic', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'f-pic', format: 'jpeg', width: W, height: H },
    crop: { x: 0.1, y: 0.2, width: 0.6, height: 0.5 },
    ...over,
  }) as Resource;

/** The picture as the spreads place it: the frame's transform, the
 *  picture's transform and bounds, and the file it links. */
function placed(resource: Resource, bytes: Record<string, Uint8Array>, opts: Partial<IdmlOptions> = {}) {
  const doc = build('# Pictures\n\n::resource{id="pic"}\n\nText.', config(), [resource]);
  const warnings: string[] = [];
  const result = idmlDocument({ docs: [doc], resourceBytes: (id) => bytes[id], images: 'link', onWarning: (w) => warnings.push(w.code), ...opts });
  const spreads = Object.entries(unzipSync(result.bytes)).filter(([p]) => p.startsWith('Spreads/')).map(([, b]) => strFromU8(b)).join('');
  const frame = /<Rectangle[^>]*ContentType="GraphicType"[^>]*ItemTransform="([^"]+)"/.exec(spreads)?.[1];
  const image = /<Image[^>]*ItemTransform="([^"]+)"/.exec(spreads)?.[1];
  const bounds = /<GraphicBounds[^>]*\/>/.exec(spreads)?.[0];
  const uri = /LinkResourceURI="file:([^"]+)"/.exec(spreads)?.[1];
  return { frame, image, bounds, uri, links: result.links.map((l) => l.path), warnings };
}

describe('print originals in the InDesign export (#1690)', () => {
  const reference = placed(picture(), { 'f-pic': jpeg() });

  it('the JPEG is placed at its 300 ppi size', () => {
    expect(reference.bounds).toBe(`<GraphicBounds Left="0" Top="0" Right="${(W * 72) / PPI}" Bottom="${(H * 72) / PPI}"/>`);
    expect(reference.image).toBeDefined();
    expect(reference.warnings).not.toContain('image.unsized');
  });

  for (const [name, bytes, ext] of [['a little-endian TIFF', tiff(true), 'tif'], ['a big-endian TIFF', tiff(false), 'tif'], ['a Photoshop document', psd(), 'psd']] as const) {
    it(`${name} keeps the frame, scale and crop the JPEG has`, () => {
      const got = placed(picture({ bitmap: { fileId: 'f-pic', format: 'png', width: W, height: H } }), { 'f-pic': bytes });
      expect(got.frame).toBe(reference.frame);
      expect(got.image).toBe(reference.image);
      expect(got.bounds).toBe(reference.bounds);
      expect(got.links).toEqual([`Links/f-pic.${ext}`]);
      expect(got.warnings).not.toContain('image.unsized');
    });
  }

  it('links the original of a bitmap that has one, with originals on', () => {
    const resource = picture({ bitmap: { fileId: 'f-pic', format: 'png', width: W, height: H, printFileId: 'scan', printFormat: 'tiff' } });
    const bytes = { 'f-pic': jpeg(), scan: tiff(false) };
    const original = placed(resource, bytes, { originals: true, resources: [resource] });
    expect(original.links).toEqual(['Links/scan.tif']);
    expect(original.uri).toBe('Links/scan.tif');
    expect(original.image).toBe(reference.image);
    // Off (the default), or without the resources: the preview.
    expect(placed(resource, bytes).links).toEqual(['Links/f-pic.jpg']);
    expect(placed(resource, bytes, { originals: true }).links).toEqual(['Links/f-pic.jpg']);
    // An original with no bytes: the preview.
    expect(placed(resource, { 'f-pic': jpeg() }, { originals: true, resources: [resource] }).links).toEqual(['Links/f-pic.jpg']);
  });

  it('warns when a picture size cannot be read, and fits it to its frame', () => {
    const bmp = Uint8Array.from([0x42, 0x4d, 0, 0, 0, 0]);
    const got = placed(picture({ crop: undefined }), { 'f-pic': bmp });
    expect(got.warnings).toContain('image.unsized');
    expect(got.links).toEqual(['Links/f-pic.bmp']);
    const [sx, , , sy] = got.image!.split(' ').map(Number);
    expect(sx).toBeCloseTo(1, 6);
    expect(sy).toBeCloseTo(1, 6);
  });
});
