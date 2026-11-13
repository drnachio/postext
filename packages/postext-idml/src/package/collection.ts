// A font collection (.ttc, .otc) taken apart into single fonts (#1558).
// InDesign's File › Package copies a font as the file the system holds,
// and macOS ships many fonts as collections (PT Sans, Avenir Next). A
// book carries single TrueType or OpenType files, so each face of the
// collection is written out as one: its own offset table, its tables
// copied after it, the checksums worked out again. The faces the book
// does not use are matched and dropped like any other file of the
// package.

/** A face taken out of a collection. */
export interface CollectionFace {
  /** Its place in the collection, from 0. */
  index: number;
  /** A standalone sfnt file, or undefined when its tables cannot be
   *  read (an offset past the end of the file, a cut table). */
  bytes?: Uint8Array;
}

const TTCF = 0x74746366;

/** Whether `bytes` start as a font collection. */
export const isFontCollection = (bytes: Uint8Array): boolean =>
  bytes.length >= 12 && new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0) === TTCF;

/** The faces of a collection, each as a file of its own, in the order
 *  the collection lists them. Undefined when `bytes` are no collection. */
export function splitFontCollection(bytes: Uint8Array): CollectionFace[] | undefined {
  if (!isFontCollection(bytes)) return undefined;
  const v = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const count = v.getUint32(8);
  // A header that claims more faces than it has room to list is damaged.
  if (count === 0 || 12 + count * 4 > bytes.length) return undefined;
  const out: CollectionFace[] = [];
  for (let i = 0; i < count; i++) {
    const face = faceAt(bytes, v, v.getUint32(12 + i * 4));
    out.push(face ? { index: i, bytes: face } : { index: i });
  }
  return out;
}

interface Table {
  tag: number;
  data: Uint8Array;
}

/** The face whose offset table starts at `at`, as a standalone sfnt. In
 *  a collection the table offsets count from the start of the whole
 *  file, and two faces may point at the same table; each face gets its
 *  own copy here. */
function faceAt(bytes: Uint8Array, v: DataView, at: number): Uint8Array | undefined {
  if (at + 12 > bytes.length) return undefined;
  const version = v.getUint32(at);
  const numTables = v.getUint16(at + 4);
  if (numTables === 0 || at + 12 + numTables * 16 > bytes.length) return undefined;
  const tables: Table[] = [];
  for (let i = 0; i < numTables; i++) {
    const r = at + 12 + i * 16;
    const tag = v.getUint32(r);
    const offset = v.getUint32(r + 8);
    const length = v.getUint32(r + 12);
    if (offset + length > bytes.length) return undefined;
    // A digital signature signs the file it came in. Copied into another
    // file it no longer matches, so it is left out.
    if (tag === 0x44534947 /* DSIG */) continue;
    tables.push({ tag, data: bytes.subarray(offset, offset + length) });
  }
  return writeSfnt(version, tables);
}

const pad4 = (n: number): number => (n + 3) & ~3;

/** The checksum the sfnt format asks for: the table read as big-endian
 *  32-bit words, the last one padded with zeros, added up modulo 2^32. */
export function sfntChecksum(data: Uint8Array): number {
  let sum = 0;
  const whole = data.length & ~3;
  const v = new DataView(data.buffer, data.byteOffset, data.byteLength);
  for (let i = 0; i < whole; i += 4) sum = (sum + v.getUint32(i)) >>> 0;
  if (whole < data.length) {
    let last = 0;
    for (let k = 0; k < 4; k++) last = (last << 8) | (data[whole + k] ?? 0);
    sum = (sum + (last >>> 0)) >>> 0;
  }
  return sum;
}

/** An sfnt file of `tables`. The table directory is sorted by tag, as
 *  browsers' font sanitiser (OTS) expects; each table starts on four
 *  bytes; `head.checkSumAdjustment` is set so that the whole file sums
 *  to the magic number the format names. */
function writeSfnt(version: number, tables: Table[]): Uint8Array {
  tables.sort((a, b) => a.tag - b.tag);
  const n = tables.length;
  const dirLength = 12 + n * 16;
  const size = tables.reduce((s, t) => s + pad4(t.data.length), dirLength);
  const out = new Uint8Array(size);
  const v = new DataView(out.buffer);
  const log2 = Math.floor(Math.log2(n));
  v.setUint32(0, version);
  v.setUint16(4, n);
  v.setUint16(6, 2 ** log2 * 16);
  v.setUint16(8, log2);
  v.setUint16(10, n * 16 - 2 ** log2 * 16);
  let offset = dirLength;
  let head = -1;
  tables.forEach((t, i) => {
    out.set(t.data, offset);
    const data = out.subarray(offset, offset + t.data.length);
    // The head table's checksum is taken with its adjustment at zero.
    if (t.tag === 0x68656164 /* head */ && data.length >= 12) {
      new DataView(out.buffer, offset).setUint32(8, 0);
      head = offset;
    }
    const r = 12 + i * 16;
    v.setUint32(r, t.tag);
    v.setUint32(r + 4, sfntChecksum(data));
    v.setUint32(r + 8, offset);
    v.setUint32(r + 12, t.data.length);
    offset += pad4(t.data.length);
  });
  if (head >= 0) v.setUint32(head + 8, (0xb1b0afba - sfntChecksum(out)) >>> 0);
  return out;
}
