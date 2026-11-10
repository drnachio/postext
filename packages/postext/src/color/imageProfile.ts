/**
 * The ICC profile a picture carries: a PNG's `iCCP` chunk (zlib), a JPEG's
 * `APP2 ICC_PROFILE` segments (a profile over 64 KB is split across
 * several, numbered). A picture without one is untagged.
 */

import { unzlibSync } from 'fflate';

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const ICC_MARKER = 'ICC_PROFILE\0';

/** The bytes of the ICC profile embedded in a PNG or JPEG, if any. */
export function embeddedIccProfile(bytes: Uint8Array): Uint8Array | undefined {
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return pngProfile(bytes);
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return jpegProfile(bytes);
  return undefined;
}

function pngProfile(bytes: Uint8Array): Uint8Array | undefined {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let at = 8;
  while (at + 8 <= bytes.length) {
    const length = view.getUint32(at);
    const type = String.fromCharCode(bytes[at + 4]!, bytes[at + 5]!, bytes[at + 6]!, bytes[at + 7]!);
    const data = at + 8;
    if (type === 'iCCP') {
      // Name (1–79 bytes), NUL, compression method (0), zlib stream.
      let nul = data;
      while (nul < data + length && bytes[nul] !== 0) nul++;
      try {
        return unzlibSync(bytes.subarray(nul + 2, data + length));
      } catch {
        return undefined;
      }
    }
    if (type === 'IDAT' || type === 'IEND') return undefined;
    at = data + length + 4;
  }
  return undefined;
}

function jpegProfile(bytes: Uint8Array): Uint8Array | undefined {
  const parts: { seq: number; data: Uint8Array }[] = [];
  let at = 2;
  while (at + 4 <= bytes.length && bytes[at] === 0xff) {
    const marker = bytes[at + 1]!;
    // Start of scan or end of image: no more headers.
    if (marker === 0xda || marker === 0xd9) break;
    // Markers with no length (fill bytes, RSTn, SOI).
    if (marker === 0xff) {
      at++;
      continue;
    }
    if ((marker >= 0xd0 && marker <= 0xd7) || marker === 0x01 || marker === 0xd8) {
      at += 2;
      continue;
    }
    const length = (bytes[at + 2]! << 8) | bytes[at + 3]!;
    const data = at + 4;
    if (marker === 0xe2 && length > 16) {
      let tag = '';
      for (let i = 0; i < 12; i++) tag += String.fromCharCode(bytes[data + i]!);
      if (tag === ICC_MARKER) parts.push({ seq: bytes[data + 12]!, data: bytes.subarray(data + 14, at + 2 + length) });
    }
    at += 2 + length;
  }
  if (parts.length === 0) return undefined;
  parts.sort((a, b) => a.seq - b.seq);
  const out = new Uint8Array(parts.reduce((n, p) => n + p.data.length, 0));
  let o = 0;
  for (const p of parts) {
    out.set(p.data, o);
    o += p.data.length;
  }
  return out;
}
