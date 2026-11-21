/**
 * A PNG of RGBA pixels, written without compression (stored deflate
 * blocks): the small pictures a cover makes of itself (a gradient, a
 * shadow) need no library and come out the same everywhere.
 */

const CRC_TABLE = (() => {
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
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]!) & 0xff]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (let i = 0; i < bytes.length; i++) {
    a = (a + bytes[i]!) % 65521;
    b = (b + a) % 65521;
  }
  return ((b << 16) | a) >>> 0;
}

const u32 = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff];

function chunk(type: string, data: Uint8Array): Uint8Array {
  const body = new Uint8Array(4 + data.length);
  for (let i = 0; i < 4; i++) body[i] = type.charCodeAt(i);
  body.set(data, 4);
  const out = new Uint8Array(8 + data.length + 4);
  out.set(u32(data.length), 0);
  out.set(body, 4);
  out.set(u32(crc32(body)), 8 + data.length);
  return out;
}

/** `width` × `height` RGBA pixels (four bytes each, rows top to bottom)
 *  as a PNG. */
export function encodeRgbaPng(width: number, height: number, rgba: Uint8Array): Uint8Array {
  // Each row starts with its filter (0: none).
  const stride = width * 4 + 1;
  const raw = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) raw.set(rgba.subarray(y * width * 4, (y + 1) * width * 4), y * stride + 1);
  const blocks: number[][] = [];
  const MAX = 65535;
  for (let at = 0; at < raw.length || at === 0; at += MAX) {
    const len = Math.min(MAX, raw.length - at);
    const last = at + len >= raw.length ? 1 : 0;
    blocks.push([last, len & 0xff, len >>> 8, ~len & 0xff, (~len >>> 8) & 0xff]);
    if (raw.length === 0) break;
  }
  const zlen = 2 + blocks.length * 5 + raw.length + 4;
  const z = new Uint8Array(zlen);
  z[0] = 0x78;
  z[1] = 0x01;
  let p = 2;
  for (let i = 0, at = 0; i < blocks.length; i++, at += MAX) {
    z.set(blocks[i]!, p);
    p += 5;
    const len = Math.min(MAX, raw.length - at);
    z.set(raw.subarray(at, at + len), p);
    p += len;
  }
  z.set(u32(adler32(raw)), p);
  const ihdr = new Uint8Array([...u32(width), ...u32(height), 8, 6, 0, 0, 0]);
  const sig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const parts = [sig, chunk('IHDR', ihdr), chunk('IDAT', z), chunk('IEND', new Uint8Array(0))];
  const out = new Uint8Array(parts.reduce((n, x) => n + x.length, 0));
  let o = 0;
  for (const x of parts) { out.set(x, o); o += x.length; }
  return out;
}
