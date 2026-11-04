// The sfnt container (#1393): a TrueType / OpenType file read into its
// tables and written back with a fresh table directory, table checksums
// and `head.checkSumAdjustment`. WOFF 1 is unwrapped here (zlib); WOFF2
// needs a decompressor handed in, since this package stays free of the
// Brotli/WASM dependency postext-pdf carries.

import { unzlibSync } from 'fflate';

export const SFNT_TRUETYPE = 0x00010000;
export const SFNT_TRUE = 0x74727565; // 'true' (old Apple TrueType)
export const SFNT_OTTO = 0x4f54544f; // 'OTTO' (CFF outlines)
const WOFF1 = 0x774f4646; // 'wOFF'
const WOFF2 = 0x774f4632; // 'wOF2'

/** A font file as its tables: tag → bytes (each a copy-free view). */
export interface Sfnt {
  flavor: number;
  tables: Map<string, Uint8Array>;
}

export function view(bytes: Uint8Array): DataView {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

function tagAt(bytes: Uint8Array, at: number): string {
  return String.fromCharCode(bytes[at]!, bytes[at + 1]!, bytes[at + 2]!, bytes[at + 3]!);
}

function magic(bytes: Uint8Array): number {
  return bytes.byteLength < 4 ? 0 : view(bytes).getUint32(0);
}

/** True when `bytes` starts like a WOFF2 file. */
export function isWoff2(bytes: Uint8Array): boolean {
  return magic(bytes) === WOFF2;
}

/** A WOFF 1 file unwrapped into sfnt bytes (each table inflated). */
function unwrapWoff1(bytes: Uint8Array): Uint8Array {
  const v = view(bytes);
  const flavor = v.getUint32(4);
  const count = v.getUint16(12);
  const tables = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const r = 44 + i * 20;
    const tag = tagAt(bytes, r);
    const offset = v.getUint32(r + 4);
    const compLength = v.getUint32(r + 8);
    const origLength = v.getUint32(r + 12);
    const data = bytes.subarray(offset, offset + compLength);
    tables.set(tag, compLength < origLength ? unzlibSync(data) : data);
  }
  return writeSfnt({ flavor, tables });
}

/**
 * The sfnt bytes of a font file: WOFF 1 unwrapped, WOFF2 through
 * `decompressWoff2`, sfnt as is. Undefined for WOFF2 without a
 * decompressor and for anything that is not a font.
 */
export async function toSfntBytes(
  bytes: Uint8Array,
  decompressWoff2?: (bytes: Uint8Array) => Promise<Uint8Array>,
): Promise<Uint8Array | undefined> {
  const m = magic(bytes);
  if (m === WOFF2) return decompressWoff2 ? decompressWoff2(bytes) : undefined;
  if (m === WOFF1) return unwrapWoff1(bytes);
  if (m === SFNT_TRUETYPE || m === SFNT_TRUE || m === SFNT_OTTO) return bytes;
  return undefined;
}

/** The tables of an sfnt file; undefined for a collection, a truncated
 *  file or something else. */
export function readSfnt(bytes: Uint8Array): Sfnt | undefined {
  if (bytes.byteLength < 12) return undefined;
  const v = view(bytes);
  const flavor = v.getUint32(0);
  if (flavor !== SFNT_TRUETYPE && flavor !== SFNT_TRUE && flavor !== SFNT_OTTO) return undefined;
  const count = v.getUint16(4);
  if (12 + count * 16 > bytes.byteLength) return undefined;
  const tables = new Map<string, Uint8Array>();
  for (let i = 0; i < count; i++) {
    const r = 12 + i * 16;
    const offset = v.getUint32(r + 8);
    const length = v.getUint32(r + 12);
    if (offset + length > bytes.byteLength) return undefined;
    tables.set(tagAt(bytes, r), bytes.subarray(offset, offset + length));
  }
  return { flavor, tables };
}

/** The OpenType table checksum: the sum of big-endian uint32 words, the
 *  last one zero-padded. */
export function tableChecksum(bytes: Uint8Array): number {
  let sum = 0;
  const whole = bytes.byteLength & ~3;
  const v = view(bytes);
  for (let i = 0; i < whole; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  if (whole < bytes.byteLength) {
    let last = 0;
    for (let i = 0; i < 4; i++) last = (last << 8) | (bytes[whole + i] ?? 0);
    sum = (sum + (last >>> 0)) >>> 0;
  }
  return sum;
}

/**
 * An sfnt file from its tables: records sorted by tag, tables 4-byte
 * aligned, every checksum computed and `head.checkSumAdjustment` set so
 * the whole file sums to 0xB1B0AFBA.
 */
export function writeSfnt(font: Sfnt): Uint8Array {
  const tags = [...font.tables.keys()].sort();
  const count = tags.length;
  let entrySelector = 0;
  while (1 << (entrySelector + 1) <= count) entrySelector++;
  const searchRange = (1 << entrySelector) * 16;
  let size = 12 + count * 16;
  for (const tag of tags) size += (font.tables.get(tag)!.byteLength + 3) & ~3;
  const out = new Uint8Array(size);
  const v = view(out);
  v.setUint32(0, font.flavor);
  v.setUint16(4, count);
  v.setUint16(6, searchRange);
  v.setUint16(8, entrySelector);
  v.setUint16(10, count * 16 - searchRange);
  let offset = 12 + count * 16;
  let headAt = -1;
  tags.forEach((tag, i) => {
    let data = font.tables.get(tag)!;
    if (tag === 'head' && data.byteLength >= 12) {
      data = data.slice();
      view(data).setUint32(8, 0);
      headAt = offset;
    }
    const r = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[r + k] = tag.charCodeAt(k);
    v.setUint32(r + 4, tableChecksum(data));
    v.setUint32(r + 8, offset);
    v.setUint32(r + 12, data.byteLength);
    out.set(data, offset);
    offset += (data.byteLength + 3) & ~3;
  });
  if (headAt >= 0) v.setUint32(headAt + 8, (0xb1b0afba - tableChecksum(out)) >>> 0);
  return out;
}

/** A growable big-endian byte buffer for building tables. */
export class ByteWriter {
  private buf = new Uint8Array(256);
  private v = view(this.buf);
  length = 0;

  private reserve(n: number): void {
    if (this.length + n <= this.buf.byteLength) return;
    let cap = this.buf.byteLength * 2;
    while (cap < this.length + n) cap *= 2;
    const next = new Uint8Array(cap);
    next.set(this.buf.subarray(0, this.length));
    this.buf = next;
    this.v = view(next);
  }

  u8(n: number): this {
    this.reserve(1);
    this.v.setUint8(this.length, n);
    this.length += 1;
    return this;
  }

  u16(n: number): this {
    this.reserve(2);
    this.v.setUint16(this.length, n & 0xffff);
    this.length += 2;
    return this;
  }

  i16(n: number): this {
    this.reserve(2);
    this.v.setInt16(this.length, n);
    this.length += 2;
    return this;
  }

  u32(n: number): this {
    this.reserve(4);
    this.v.setUint32(this.length, n >>> 0);
    this.length += 4;
    return this;
  }

  bytes(b: Uint8Array): this {
    this.reserve(b.byteLength);
    this.buf.set(b, this.length);
    this.length += b.byteLength;
    return this;
  }

  /** Zero bytes up to a multiple of `n`. */
  pad(n: number): this {
    while (this.length % n) this.u8(0);
    return this;
  }

  setU16(at: number, n: number): void {
    this.v.setUint16(at, n & 0xffff);
  }

  setU32(at: number, n: number): void {
    this.v.setUint32(at, n >>> 0);
  }

  finish(): Uint8Array {
    return this.buf.slice(0, this.length);
  }
}
