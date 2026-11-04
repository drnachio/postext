// FNV-1a 64-bit over UTF-8 bytes: a fast, stable hash for chapter text,
// media deduplication and deterministic GUIDs. Not cryptographic; no
// `crypto` dependency. Computed on four 16-bit limbs so plain numbers
// never lose precision.

import { strToU8 } from 'fflate';

/** FNV-1a 64 of raw bytes as 16 lowercase hex digits. */
export function hashBytes(bytes: Uint8Array, seed?: string): string {
  // Offset basis 0xcbf29ce484222325, little-endian limbs.
  let h0 = 0x2325, h1 = 0x8422, h2 = 0x9ce4, h3 = 0xcbf2;
  const feed = (data: Uint8Array): void => {
    for (let i = 0; i < data.length; i++) {
      h0 ^= data[i]!;
      // × 0x100000001b3 = × (2^40 + 0x1b3).
      const t0 = h0 * 0x1b3;
      const t1 = h1 * 0x1b3 + (t0 >>> 16);
      const t2 = h2 * 0x1b3 + h0 * 0x100 + (t1 >>> 16);
      const t3 = h3 * 0x1b3 + h1 * 0x100 + (t2 >>> 16);
      h0 = t0 & 0xffff;
      h1 = t1 & 0xffff;
      h2 = t2 & 0xffff;
      h3 = t3 & 0xffff;
    }
  };
  if (seed) feed(strToU8(seed));
  feed(bytes);
  const hex = (n: number): string => n.toString(16).padStart(4, '0');
  return hex(h3) + hex(h2) + hex(h1) + hex(h0);
}

/** FNV-1a 64 of a string's UTF-8 bytes as 16 lowercase hex digits. */
export function hashText(s: string): string {
  return hashBytes(strToU8(s));
}

/** A deterministic `{XXXXXXXX-XXXX-XXXX-XXXX-XXXXXXXXXXXX}` from any text. */
export function guidFrom(text: string): string {
  const hex = (hashText(text) + hashText(`${text}\u0000guid`)).toUpperCase();
  return `{${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}}`;
}
