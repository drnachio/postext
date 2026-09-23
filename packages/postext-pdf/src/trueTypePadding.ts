/**
 * TrueType glyph padding for pdf-lib's subsetter.
 *
 * fontkit's `TTFSubset` copies each glyph's bytes verbatim and writes the
 * subset's `loca` in the short format (offset / 2) whenever the subset is
 * small enough — without padding the glyphs to an even length. A source font
 * whose glyphs have odd lengths (legal with a long `loca`, and what fontTools
 * writes for instanced variable fonts such as Alegreya) therefore yields a
 * subset whose offsets are truncated: every glyph after the first odd one
 * is read from the wrong place and renders blank in every viewer.
 *
 * `padTrueTypeGlyphs` rewrites such a font so every glyph is 4-byte aligned
 * (the alignment the OpenType spec recommends) and its `loca` is long, which
 * fontkit then subsets correctly. Fonts that are already padded, CFF fonts
 * and anything that is not an sfnt are returned untouched.
 */

const SFNT_TRUETYPE = 0x00010000;
const SFNT_TRUE = 0x74727565; // 'true'

interface TableRecord {
  tag: string;
  checksum: number;
  offset: number;
  length: number;
}

function readTables(bytes: Uint8Array): TableRecord[] | null {
  if (bytes.length < 12) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const version = view.getUint32(0);
  if (version !== SFNT_TRUETYPE && version !== SFNT_TRUE) return null;
  const numTables = view.getUint16(4);
  if (bytes.length < 12 + numTables * 16) return null;
  const tables: TableRecord[] = [];
  for (let i = 0; i < numTables; i++) {
    const p = 12 + i * 16;
    const tag = String.fromCharCode(bytes[p]!, bytes[p + 1]!, bytes[p + 2]!, bytes[p + 3]!);
    const checksum = view.getUint32(p + 4);
    const offset = view.getUint32(p + 8);
    const length = view.getUint32(p + 12);
    if (offset + length > bytes.length) return null;
    tables.push({ tag, checksum, offset, length });
  }
  return tables;
}

function tableChecksum(data: Uint8Array): number {
  let sum = 0;
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  const whole = data.length & ~3;
  for (let i = 0; i < whole; i += 4) sum = (sum + view.getUint32(i)) >>> 0;
  if (whole < data.length) {
    let tail = 0;
    for (let i = whole; i < whole + 4; i++) tail = (tail << 8) | (i < data.length ? data[i]! : 0);
    sum = (sum + (tail >>> 0)) >>> 0;
  }
  return sum;
}

/** True when the font is a `glyf` TrueType whose glyph records are not all
 *  4-byte aligned — the shape fontkit's subsetter mishandles. */
export function needsGlyphPadding(bytes: Uint8Array): boolean {
  return glyphLengths(bytes)?.some((len) => len % 4 !== 0) ?? false;
}

function glyphLengths(bytes: Uint8Array): number[] | null {
  const tables = readTables(bytes);
  if (!tables) return null;
  const head = tables.find((t) => t.tag === 'head');
  const loca = tables.find((t) => t.tag === 'loca');
  const maxp = tables.find((t) => t.tag === 'maxp');
  if (!head || !loca || !maxp || !tables.some((t) => t.tag === 'glyf')) return null;
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const longLoca = view.getInt16(head.offset + 50) === 1;
  const numGlyphs = view.getUint16(maxp.offset + 4);
  const entrySize = longLoca ? 4 : 2;
  if (loca.length < (numGlyphs + 1) * entrySize) return null;
  const offsets: number[] = [];
  for (let i = 0; i <= numGlyphs; i++) {
    const p = loca.offset + i * entrySize;
    offsets.push(longLoca ? view.getUint32(p) : view.getUint16(p) * 2);
  }
  const lengths: number[] = [];
  for (let i = 0; i < numGlyphs; i++) lengths.push(offsets[i + 1]! - offsets[i]!);
  return lengths;
}

/**
 * The same font with every glyph padded to a 4-byte boundary and a long
 * `loca`; the input itself when nothing needs padding or the bytes are not
 * a `glyf` TrueType font. Table order and every other table are kept, the
 * directory is rebuilt with fresh offsets and checksums.
 */
export function padTrueTypeGlyphs(bytes: Uint8Array): Uint8Array {
  const tables = readTables(bytes);
  if (!tables) return bytes;
  const lengths = glyphLengths(bytes);
  if (!lengths || lengths.every((len) => len % 4 === 0)) return bytes;

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const head = tables.find((t) => t.tag === 'head')!;
  const loca = tables.find((t) => t.tag === 'loca')!;
  const glyf = tables.find((t) => t.tag === 'glyf')!;
  const longLoca = view.getInt16(head.offset + 50) === 1;
  const numGlyphs = lengths.length;

  // Re-pack glyf with aligned records and a long loca.
  const oldOffsets: number[] = [];
  const entrySize = longLoca ? 4 : 2;
  for (let i = 0; i <= numGlyphs; i++) {
    const p = loca.offset + i * entrySize;
    oldOffsets.push(longLoca ? view.getUint32(p) : view.getUint16(p) * 2);
  }
  const paddedLengths = lengths.map((len) => (len + 3) & ~3);
  const newGlyf = new Uint8Array(paddedLengths.reduce((a, b) => a + b, 0));
  const newLoca = new Uint8Array((numGlyphs + 1) * 4);
  const locaView = new DataView(newLoca.buffer);
  let cursor = 0;
  for (let i = 0; i < numGlyphs; i++) {
    locaView.setUint32(i * 4, cursor);
    newGlyf.set(bytes.subarray(glyf.offset + oldOffsets[i]!, glyf.offset + oldOffsets[i]! + lengths[i]!), cursor);
    cursor += paddedLengths[i]!;
  }
  locaView.setUint32(numGlyphs * 4, cursor);

  const newHead = bytes.slice(head.offset, head.offset + head.length);
  new DataView(newHead.buffer).setInt16(50, 1);
  new DataView(newHead.buffer).setUint32(8, 0); // checkSumAdjustment, recomputed below

  const payloads = new Map<string, Uint8Array>();
  for (const t of tables) {
    payloads.set(t.tag, t.tag === 'glyf' ? newGlyf : t.tag === 'loca' ? newLoca : t.tag === 'head' ? newHead : bytes.subarray(t.offset, t.offset + t.length));
  }

  // Rebuild the file: directory, then tables in their original order, each
  // 4-byte aligned.
  const headerSize = 12 + tables.length * 16;
  let total = headerSize;
  const placed: { tag: string; offset: number; data: Uint8Array }[] = [];
  for (const t of tables) {
    const data = payloads.get(t.tag)!;
    placed.push({ tag: t.tag, offset: total, data });
    total += (data.length + 3) & ~3;
  }
  const out = new Uint8Array(total);
  out.set(bytes.subarray(0, 12), 0);
  const outView = new DataView(out.buffer);
  placed.forEach((p, i) => {
    const rec = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[rec + k] = p.tag.charCodeAt(k);
    outView.setUint32(rec + 4, tableChecksum(p.data));
    outView.setUint32(rec + 8, p.offset);
    outView.setUint32(rec + 12, p.data.length);
    out.set(p.data, p.offset);
  });
  // head.checkSumAdjustment = 0xB1B0AFBA - checksum(whole font)
  const headPlaced = placed.find((p) => p.tag === 'head')!;
  outView.setUint32(headPlaced.offset + 8, (0xb1b0afba - tableChecksum(out)) >>> 0);
  return out;
}
