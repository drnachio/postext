/**
 * A PNG writer for the small pictures the engine makes of itself: a
 * Word page's ground of one colour, a cover's gradient or shadow. Rows of
 * 8-bit truecolour (RGB) or truecolour with alpha (RGBA) pixels, top to
 * bottom, deflated by `fflate`.
 */

import { zlibSync } from 'fflate';

const CRC = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = CRC[(c ^ b) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i);
  out.set(data, 8);
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

const SIGNATURE = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** `width` × `height` pixels of `channels` bytes each (3: RGB, 4: RGBA),
 *  rows top to bottom, as a PNG. */
export function encodePng(width: number, height: number, pixels: Uint8Array, channels: 3 | 4 = 4): Uint8Array {
  const row = width * channels;
  if (pixels.length < row * height) throw new RangeError('encodePng: fewer pixels than width × height');
  const head = new Uint8Array(13);
  const view = new DataView(head.buffer);
  view.setUint32(0, width);
  view.setUint32(4, height);
  head[8] = 8; // bit depth
  head[9] = channels === 4 ? 6 : 2; // truecolour with alpha, or without
  // Each row starts with its filter (0: none).
  const raw = new Uint8Array((row + 1) * height);
  for (let y = 0; y < height; y++) raw.set(pixels.subarray(y * row, (y + 1) * row), y * (row + 1) + 1);
  const parts = [SIGNATURE, chunk('IHDR', head), chunk('IDAT', zlibSync(raw)), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const p of parts) {
    out.set(p, at);
    at += p.length;
  }
  return out;
}
