import { describe, it, expect } from 'vitest';
import { exportLogos, importLogos, logoFileId, logoResource, sniffLogoMime, svgSize, type LogoRecord } from './logoLibrary.js';

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0]);
const SVG = new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 50"><rect width="200" height="50"/></svg>');
const logo = (over: Partial<LogoRecord> = {}): LogoRecord => ({
  id: 'pub', name: 'Editorial', group: 'publisher', clearance: 4, mime: 'image/png', bytes: PNG, width: 300, height: 100, updatedAt: 1, ...over,
});

describe('logo library', () => {
  it('tells a picture by its first bytes, and an SVG’s size by its tag', () => {
    expect(sniffLogoMime(PNG)).toBe('image/png');
    expect(sniffLogoMime(Uint8Array.from([0xff, 0xd8, 0xff]))).toBe('image/jpeg');
    expect(sniffLogoMime(SVG)).toBe('image/svg+xml');
    expect(sniffLogoMime(new TextEncoder().encode('hola'))).toBeUndefined();
    expect(svgSize('<svg width="120" height="40">')).toEqual({ width: 120, height: 40 });
    expect(svgSize('<svg viewBox="0 0 200 50">')).toEqual({ width: 200, height: 50 });
  });

  it('makes a logo a picture of the cover’s own', () => {
    expect(logoFileId(logo())).toBe('logo-pub.png');
    expect(logoResource(logo())).toMatchObject({ id: 'logo:pub', kind: 'bitmap', altText: 'Editorial', bitmap: { fileId: 'logo-pub.png', format: 'png', width: 300, height: 100 } });
    expect(logoResource(logo({ mime: 'image/svg+xml', bytes: SVG }))).toMatchObject({ kind: 'svg', svg: { fileId: 'logo-pub.svg' } });
  });

  it('round-trips through its file, leaving out what is not a picture', () => {
    const file = JSON.parse(JSON.stringify(exportLogos([logo(), logo({ id: 'seal', name: 'Premio', group: 'seal', mime: 'image/svg+xml', bytes: SVG })])));
    file.logos.push({ id: 'bad', name: 'Roto', data: btoa('hola') });
    const read = importLogos(file, 7);
    expect(read.ok).toBe(true);
    expect(read.skipped).toBe(1);
    expect(read.logos.map((l) => [l.id, l.group, l.mime, l.clearance, l.updatedAt])).toEqual([
      ['pub', 'publisher', 'image/png', 4, 7],
      ['seal', 'seal', 'image/svg+xml', 4, 7],
    ]);
    expect([...read.logos[0]!.bytes]).toEqual([...PNG]);
    expect(importLogos({ format: 'other' }).ok).toBe(false);
  });

  it('traces a PNG logo’s outline from its transparency', () => {
    // 4 × 2 RGBA: the left half opaque, the right half clear.
    const crc = (b: Uint8Array) => {
      let c = ~0;
      for (const x of b) { c ^= x; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
      return ~c >>> 0;
    };
    const chunk = (type: string, data: Uint8Array) => {
      const out = new Uint8Array(12 + data.length);
      const v = new DataView(out.buffer);
      v.setUint32(0, data.length);
      out.set(new TextEncoder().encode(type), 4);
      out.set(data, 8);
      v.setUint32(8 + data.length, crc(out.subarray(4, 8 + data.length)));
      return out;
    };
    const ihdr = new Uint8Array(13);
    new DataView(ihdr.buffer).setUint32(0, 4);
    new DataView(ihdr.buffer).setUint32(4, 2);
    ihdr.set([8, 6, 0, 0, 0], 8);
    const row = [0, ...[255, 0, 0, 255, 255, 0, 0, 255, 0, 0, 0, 0, 0, 0, 0, 0]];
    // A zlib stream of one stored (uncompressed) block.
    const raw = Uint8Array.from([...row, ...row]);
    let a = 1;
    let b = 0;
    for (const x of raw) { a = (a + x) % 65521; b = (b + a) % 65521; }
    const idat = Uint8Array.from([0x78, 0x01, 0x01, raw.length & 0xff, raw.length >> 8, ~raw.length & 0xff, (~raw.length >> 8) & 0xff, ...raw, b >> 8, b & 0xff, a >> 8, a & 0xff]);
    const png = Uint8Array.from([...PNG.subarray(0, 8), ...chunk('IHDR', ihdr), ...chunk('IDAT', idat), ...chunk('IEND', new Uint8Array())]);
    const res = logoResource(logo({ bytes: png, width: 4, height: 2 }));
    expect(res.contour?.traced?.spans.slice(0, 2)).toEqual([0, 0.5]);
    expect(logoResource(logo({ mime: 'image/svg+xml', bytes: SVG })).contour).toBeUndefined();
  });
});
