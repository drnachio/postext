import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import { embeddedIccProfile } from '../../color/imageProfile.js';
import { RasterDecodeError, decodePsd, decodeTiff } from '../../raster/index.js';

// #1484: decoders given broken or hostile files fail with a
// RasterDecodeError, quickly, without allocating what a header claims and
// without touching the bytes they are given.

type Tag = [tag: number, type: number, values: number[]];

/** A TIFF (little-endian unless `le` is false): the header, `data` at offset 8, then the IFD and
 *  any tag values that do not fit in their entry. */
function tiff(tags: Tag[], data: Uint8Array = new Uint8Array(), le = true): Uint8Array {
  const size = (type: number) => (type === 3 ? 2 : type === 4 ? 4 : 1);
  const ifd = 8 + data.length + (data.length & 1);
  const extraAt = ifd + 2 + tags.length * 12 + 4;
  const out = new Uint8Array(extraAt + tags.reduce((n, [, type, v]) => n + (v.length * size(type) > 4 ? v.length * size(type) : 0), 0));
  const view = new DataView(out.buffer);
  out.set(le ? [0x49, 0x49, 42, 0] : [0x4d, 0x4d, 0, 42]);
  view.setUint32(4, ifd, le);
  out.set(data, 8);
  view.setUint16(ifd, tags.length, le);
  let free = extraAt;
  tags.sort((a, b) => a[0] - b[0]).forEach(([tag, type, values], i) => {
    const e = ifd + 2 + i * 12;
    view.setUint16(e, tag, le);
    view.setUint16(e + 2, type, le);
    view.setUint32(e + 4, values.length, le);
    const bytes = values.length * size(type);
    let at = e + 8;
    if (bytes > 4) {
      view.setUint32(e + 8, free, le);
      at = free;
      free += bytes;
    }
    values.forEach((v, k) => {
      if (type === 3) view.setUint16(at + k * 2, v, le);
      else if (type === 4) view.setUint32(at + k * 4, v, le);
      else out[at + k] = v;
    });
  });
  return out;
}

/** A grey 8-bit TIFF of `w` × `h` in one strip of `data`. */
const grey = (w: number, h: number, data: Uint8Array, more: Tag[] = [], compression = 1) =>
  tiff([[256, 4, [w]], [257, 4, [h]], [258, 3, [8]], [259, 3, [compression]], [262, 3, [1]], [273, 4, [8]], [277, 3, [1]], [279, 4, [data.length]], ...more], data);

/** Decode, expecting a RasterDecodeError, within `ms`. */
function rejects(decode: () => unknown, ms = 200): void {
  const start = performance.now();
  expect(decode).toThrow(RasterDecodeError);
  expect(performance.now() - start).toBeLessThan(ms);
}

const rgbTags = (w: number, h: number, data: Uint8Array, spp = 3): Tag[] => [
  [256, 4, [w]], [257, 4, [h]], [258, 3, Array(spp).fill(8)], [259, 3, [1]], [262, 3, [2]], [273, 4, [8]], [277, 3, [spp]], [279, 4, [data.length]],
];

describe('TIFF formats the fixtures do not cover', () => {
  it('reads big-endian files', () => {
    const data = new Uint8Array([1, 2, 3, 4, 5, 6]);
    const r = decodeTiff(tiff(rgbTags(2, 1, data), data, false));
    expect([r.color, [...r.data]]).toEqual(['rgb', [1, 2, 3, 4, 5, 6]]);
  });

  it('reads 1-bit grey, WhiteIsZero included', () => {
    const data = new Uint8Array([0b10100000]);
    const tags: Tag[] = [[256, 4, [4]], [257, 4, [1]], [258, 3, [1]], [259, 3, [1]], [262, 3, [1]], [273, 4, [8]], [277, 3, [1]], [279, 4, [1]]];
    expect([...decodeTiff(tiff(tags, data)).data]).toEqual([255, 0, 255, 0]);
    tags[4] = [262, 3, [0]];
    expect([...decodeTiff(tiff(tags, data)).data]).toEqual([0, 255, 0, 255]);
  });

  it('reads a palette through its colour map', () => {
    const map = [...Array(256).fill(0), ...Array(256).fill(0), ...Array(256).fill(0)];
    map[1] = 0xff00; // index 1: red
    map[512 + 2] = 0x8000; // index 2: half blue
    const data = new Uint8Array([0, 1, 2]);
    const r = decodeTiff(tiff([[256, 4, [3]], [257, 4, [1]], [258, 3, [8]], [259, 3, [1]], [262, 3, [3]], [273, 4, [8]], [277, 3, [1]], [279, 4, [3]], [320, 3, map]], data));
    expect([r.color, [...r.data]]).toEqual(['rgb', [0, 0, 0, 255, 0, 0, 0, 0, 128]]);
  });

  it('reads straight and premultiplied alpha', () => {
    const data = new Uint8Array([100, 50, 20, 128, 10, 20, 30, 255]);
    const straight = decodeTiff(tiff([...rgbTags(2, 1, data, 4), [338, 3, [2]]], data));
    expect([[...straight.data], [...straight.alpha!]]).toEqual([[100, 50, 20, 10, 20, 30], [128, 255]]);
    const associated = decodeTiff(tiff([...rgbTags(2, 1, data, 4), [338, 3, [1]]], data));
    expect([...associated.data.subarray(0, 3)]).toEqual([199, 100, 40]);
  });

  it('refuses JPEG compression and unknown photometrics by name', () => {
    expect(() => decodeTiff(grey(2, 1, new Uint8Array(2), [], 7))).toThrow(/JPEG/);
    expect(() => decodeTiff(grey(2, 1, new Uint8Array(2), [[262, 3, [6]]]))).toThrow(/photometric/);
  });
});

describe('TIFF with broken headers', () => {
  it('reads a well-formed synthetic file, so the cases below break only what they say', () => {
    const r = decodeTiff(grey(4, 2, new Uint8Array([1, 2, 3, 4, 5, 6, 7, 8])));
    expect([r.width, r.height, [...r.data]]).toEqual([4, 2, [1, 2, 3, 4, 5, 6, 7, 8]]);
  });

  it('refuses no size, a huge size and too many channels', () => {
    rejects(() => decodeTiff(grey(0, 2, new Uint8Array(8))));
    rejects(() => decodeTiff(grey(200_000, 2, new Uint8Array(8))));
    rejects(() => decodeTiff(grey(60_000, 60_000, new Uint8Array(8))));
    rejects(() => decodeTiff(grey(4, 2, new Uint8Array(8), [[277, 3, [40]]])));
  });

  it('allocates nothing for a size its strips cannot hold', () => {
    rejects(() => decodeTiff(grey(9_000, 9_000, new Uint8Array(64))), 50);
    rejects(() => decodeTiff(grey(9_000, 9_000, zlibSync(new Uint8Array(64)), [], 8)), 50);
  });

  it('refuses empty strips and tiles', () => {
    rejects(() => decodeTiff(grey(4, 2, new Uint8Array(8), [[278, 4, [0]]])));
    rejects(() => decodeTiff(grey(4, 2, new Uint8Array(8), [[322, 4, [0]], [323, 4, [16]], [324, 4, [8]], [325, 4, [8]]])));
  });

  it('refuses a strip or tag count past the file and a strip offset past its end', () => {
    const file = grey(4, 2, new Uint8Array(8));
    const view = new DataView(file.buffer);
    const ifd = view.getUint32(4, true);
    // StripByteCounts (279) is the 8th entry once sorted: claim four billion values.
    const counts = ifd + 2 + 7 * 12;
    expect(view.getUint16(counts, true)).toBe(279);
    const huge = file.slice();
    new DataView(huge.buffer).setUint32(counts + 4, 0xffffffff, true);
    rejects(() => decodeTiff(huge));
    const past = file.slice();
    new DataView(past.buffer).setUint32(counts + 8, 1_000_000, true);
    rejects(() => decodeTiff(past));
    rejects(() => decodeTiff(grey(4, 2, new Uint8Array(8), [[273, 4, [1_000_000]]])));
  });

  it('refuses fewer strips than the picture needs', () => {
    rejects(() => decodeTiff(grey(4, 4, new Uint8Array(16), [[278, 4, [1]]])));
  });

  it('refuses an IFD past the end and a truncated file', () => {
    const file = grey(4, 2, new Uint8Array(8));
    const moved = file.slice();
    new DataView(moved.buffer).setUint32(4, 1_000_000, true);
    rejects(() => decodeTiff(moved));
    for (const cut of [10, 20, file.length - 5]) rejects(() => decodeTiff(file.subarray(0, cut)));
  });
});

describe('TIFF with broken data', () => {
  it('refuses a truncated strip in every compression', () => {
    rejects(() => decodeTiff(grey(4, 4, new Uint8Array(8))));
    rejects(() => decodeTiff(grey(4, 4, zlibSync(new Uint8Array(8)), [], 8)));
    rejects(() => decodeTiff(grey(4, 4, new Uint8Array([7, 1, 2, 3, 4, 5, 6, 7, 8]), [], 32773)));
    // LZW: Clear, the 8 bytes 0, End — 8 of the 16 the picture needs.
    rejects(() => decodeTiff(grey(4, 4, lzwCodes([256, 0, 0, 0, 0, 0, 0, 0, 0, 257]), [], 5)));
  });

  it('refuses corrupt Deflate and LZW streams', () => {
    rejects(() => decodeTiff(grey(4, 2, new Uint8Array([0x78, 0x9c, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]), [], 8)));
    // A code past the table.
    rejects(() => decodeTiff(grey(4, 2, lzwCodes([256, 0, 400, 1, 2, 3, 4, 5, 6, 257]), [], 5)));
  });

  it('stops a Deflate bomb at the size of the picture', () => {
    const bomb = zlibSync(new Uint8Array(64 * 1024 * 1024));
    rejects(() => decodeTiff(grey(64, 64, bomb, [], 8)), 1_000);
  });

  it('leaves the input untouched, predictor and all, compressed or not', () => {
    for (const compression of [1, 8]) {
      const raw = new Uint8Array([10, 1, 1, 1, 20, 2, 2, 2]);
      const file = grey(4, 2, compression === 8 ? zlibSync(raw) : raw, [[317, 3, [2]]], compression);
      const before = file.slice();
      const r = decodeTiff(file);
      expect([...r.data]).toEqual([10, 11, 12, 13, 20, 22, 24, 26]);
      expect(file).toEqual(before);
    }
  });
});

/** LZW codes at 9 bits, MSB first (enough for the short streams above). */
function lzwCodes(codes: number[]): Uint8Array {
  const out = new Uint8Array(Math.ceil((codes.length * 9) / 8) + 1);
  let bit = 0;
  for (const code of codes) {
    for (let k = 8; k >= 0; k--) {
      if ((code >> k) & 1) out[bit >> 3]! |= 0x80 >> (bit & 7);
      bit++;
    }
  }
  return out;
}

/** A PSD: header, empty mode data, `resources`, empty layers, raw `image`. */
function psd(width: number, height: number, channels: number, image: Uint8Array, resources = new Uint8Array(), compression = 0): Uint8Array {
  const out = new Uint8Array(26 + 4 + 4 + resources.length + 4 + 2 + image.length);
  const view = new DataView(out.buffer);
  out.set([0x38, 0x42, 0x50, 0x53]);
  view.setUint16(4, 1);
  view.setUint16(12, channels);
  view.setUint32(14, height);
  view.setUint32(18, width);
  view.setUint16(22, 8);
  view.setUint16(24, 1); // greyscale
  let at = 30;
  view.setUint32(at, resources.length);
  out.set(resources, at + 4);
  at += 4 + resources.length + 4;
  view.setUint16(at, compression);
  out.set(image, at + 2);
  return out;
}

describe('Photoshop formats the fixtures do not cover', () => {
  it('reads RLE rows', () => {
    // Row counts 2, 2; each row a run of two equal bytes (-1 → repeat twice).
    const r = decodePsd(psd(2, 2, 1, new Uint8Array([0, 2, 0, 2, 0xff, 7, 0xff, 9]), undefined, 1));
    expect([...r.data]).toEqual([7, 7, 9, 9]);
  });

  it('reads CMYK as ink (Photoshop stores 255 for no ink) and 16 bits to their high byte', () => {
    const cmyk = psd(1, 1, 4, new Uint8Array([255, 0, 200, 55]));
    new DataView(cmyk.buffer).setUint16(24, 4);
    expect([...decodePsd(cmyk).data]).toEqual([0, 255, 55, 200]);
    const deep = psd(2, 1, 1, new Uint8Array([0x12, 0x34, 0xab, 0xcd]));
    new DataView(deep.buffer).setUint16(22, 16);
    expect([...decodePsd(deep).data]).toEqual([0x12, 0xab]);
  });
});

describe('Photoshop documents, broken', () => {
  it('reads a well-formed synthetic one', () => {
    expect([...decodePsd(psd(2, 2, 1, new Uint8Array([1, 2, 3, 4]))).data]).toEqual([1, 2, 3, 4]);
  });

  it('refuses a huge size, a short composite and a cut file', () => {
    rejects(() => decodePsd(psd(200_000, 2, 1, new Uint8Array(4))));
    rejects(() => decodePsd(psd(60_000, 60_000, 1, new Uint8Array(4))), 50);
    rejects(() => decodePsd(psd(4, 4, 1, new Uint8Array(4))));
    const file = psd(2, 2, 1, new Uint8Array([1, 2, 3, 4]));
    for (const cut of [28, 33, file.length - 2]) rejects(() => decodePsd(file.subarray(0, cut)));
  });

  it('refuses a resource or a layer section longer than the file', () => {
    const resource = new Uint8Array([0x38, 0x42, 0x49, 0x4d, 0x04, 0x0f, 0, 0, 0x7f, 0xff, 0xff, 0xff]);
    rejects(() => decodePsd(psd(2, 2, 1, new Uint8Array(4), resource)));
    const file = psd(2, 2, 1, new Uint8Array(4));
    new DataView(file.buffer).setUint32(34, 0x7fffffff);
    rejects(() => decodePsd(file));
  });

  it('refuses RLE rows cut short', () => {
    // Row counts (2 × 2 bytes) say 9 bytes a row; there are 2.
    rejects(() => decodePsd(psd(2, 2, 1, new Uint8Array([0, 9, 0, 9, 1, 5, 1, 6]), undefined, 1)));
  });
});

describe('embedded profiles, broken', () => {
  const png = (chunk: Uint8Array) => {
    const out = new Uint8Array(8 + 12 + chunk.length);
    out.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    new DataView(out.buffer).setUint32(8, chunk.length);
    out.set([0x69, 0x43, 0x43, 0x50], 12); // iCCP
    out.set(chunk, 16);
    return out;
  };

  it('drops an iCCP chunk that inflates past the profile limit, quickly', () => {
    const bomb = zlibSync(new Uint8Array(32 * 1024 * 1024));
    const start = performance.now();
    expect(embeddedIccProfile(png(new Uint8Array([0x70, 0, 0, ...bomb])))).toBeUndefined();
    expect(performance.now() - start).toBeLessThan(1_000);
  });

  it('drops a chunk longer than the file and a corrupt stream', () => {
    const long = png(new Uint8Array([0x70, 0, 0, 0x78, 0x9c]));
    new DataView(long.buffer).setUint32(8, 1_000_000);
    expect(embeddedIccProfile(long)).toBeUndefined();
    expect(embeddedIccProfile(png(new Uint8Array([0x70, 0, 0, 0x78, 0x9c, 0xff, 0xff])))).toBeUndefined();
  });

  it('stops at a JPEG segment longer than the file', () => {
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe2, 0xff, 0xff, ...new TextEncoder().encode('ICC_PROFILE\0'), 1, 1]);
    expect(embeddedIccProfile(jpeg)).toBeUndefined();
  });
});
