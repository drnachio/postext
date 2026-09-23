import { describe, expect, it } from 'vitest';
import { needsGlyphPadding, padTrueTypeGlyphs } from '../trueTypePadding';

/** A minimal `glyf` TrueType: head, maxp, loca, glyf (plus a dummy table
 *  after glyf so offsets past it must move). Glyph records of the given
 *  lengths hold a recognisable byte pattern. */
function makeFont(glyphLengths: number[], longLoca: boolean): Uint8Array {
  const glyphs = glyphLengths.map((len, i) => new Uint8Array(len).fill(0x10 + i));
  const glyfLen = glyphs.reduce((a, g) => a + g.length, 0);
  const offsets: number[] = [];
  let cur = 0;
  for (const g of glyphs) {
    offsets.push(cur);
    cur += g.length;
  }
  offsets.push(cur);
  const loca = new Uint8Array((glyphs.length + 1) * (longLoca ? 4 : 2));
  const lv = new DataView(loca.buffer);
  offsets.forEach((o, i) => (longLoca ? lv.setUint32(i * 4, o) : lv.setUint16(i * 2, o / 2)));
  const head = new Uint8Array(54);
  new DataView(head.buffer).setInt16(50, longLoca ? 1 : 0);
  const maxp = new Uint8Array(6);
  new DataView(maxp.buffer).setUint16(4, glyphs.length);
  const glyf = new Uint8Array(glyfLen);
  glyphs.forEach((g, i) => glyf.set(g, offsets[i]!));
  const dummy = new Uint8Array([1, 2, 3, 4, 5]);
  const tables: [string, Uint8Array][] = [['head', head], ['maxp', maxp], ['loca', loca], ['glyf', glyf], ['zzzz', dummy]];
  const headerSize = 12 + tables.length * 16;
  let total = headerSize;
  const placed = tables.map(([tag, data]) => {
    const p = { tag, data, offset: total };
    total += (data.length + 3) & ~3;
    return p;
  });
  const out = new Uint8Array(total);
  const v = new DataView(out.buffer);
  v.setUint32(0, 0x00010000);
  v.setUint16(4, tables.length);
  placed.forEach((p, i) => {
    const rec = 12 + i * 16;
    for (let k = 0; k < 4; k++) out[rec + k] = p.tag.charCodeAt(k);
    v.setUint32(rec + 8, p.offset);
    v.setUint32(rec + 12, p.data.length);
    out.set(p.data, p.offset);
  });
  return out;
}

function readGlyphs(font: Uint8Array): { lengths: number[]; records: Uint8Array[]; longLoca: boolean; dummy: Uint8Array } {
  const v = new DataView(font.buffer, font.byteOffset, font.byteLength);
  const n = v.getUint16(4);
  const rec: Record<string, { offset: number; length: number }> = {};
  for (let i = 0; i < n; i++) {
    const p = 12 + i * 16;
    const tag = String.fromCharCode(font[p]!, font[p + 1]!, font[p + 2]!, font[p + 3]!);
    rec[tag] = { offset: v.getUint32(p + 8), length: v.getUint32(p + 12) };
  }
  const longLoca = v.getInt16(rec.head!.offset + 50) === 1;
  const numGlyphs = v.getUint16(rec.maxp!.offset + 4);
  const offsets: number[] = [];
  for (let i = 0; i <= numGlyphs; i++) {
    const p = rec.loca!.offset + i * (longLoca ? 4 : 2);
    offsets.push(longLoca ? v.getUint32(p) : v.getUint16(p) * 2);
  }
  const lengths = offsets.slice(1).map((o, i) => o - offsets[i]!);
  const records = lengths.map((len, i) => font.subarray(rec.glyf!.offset + offsets[i]!, rec.glyf!.offset + offsets[i]! + len));
  return { lengths, records, longLoca, dummy: font.subarray(rec.zzzz!.offset, rec.zzzz!.offset + rec.zzzz!.length) };
}

describe('padTrueTypeGlyphs', () => {
  it('leaves aligned fonts, CFF fonts and non-fonts alone', () => {
    const aligned = makeFont([12, 0, 8, 16], false);
    expect(needsGlyphPadding(aligned)).toBe(false);
    expect(padTrueTypeGlyphs(aligned)).toBe(aligned);
    const otto = new Uint8Array([0x4f, 0x54, 0x54, 0x4f, 0, 0]);
    expect(padTrueTypeGlyphs(otto)).toBe(otto);
    const junk = new Uint8Array([1, 2, 3]);
    expect(padTrueTypeGlyphs(junk)).toBe(junk);
  });

  it('pads odd-length glyphs to 4 bytes and switches to a long loca', () => {
    const font = makeFont([13, 7, 0, 22, 9], true);
    expect(needsGlyphPadding(font)).toBe(true);
    const padded = padTrueTypeGlyphs(font);
    const g = readGlyphs(padded);
    expect(g.longLoca).toBe(true);
    expect(g.lengths).toEqual([16, 8, 0, 24, 12]);
    // Each record keeps its bytes, followed by zero padding.
    expect(Array.from(g.records[0]!.subarray(0, 13))).toEqual(new Array(13).fill(0x10));
    expect(Array.from(g.records[0]!.subarray(13))).toEqual([0, 0, 0]);
    expect(Array.from(g.records[3]!.subarray(0, 22))).toEqual(new Array(22).fill(0x13));
    expect(Array.from(g.records[4]!.subarray(0, 9))).toEqual(new Array(9).fill(0x14));
    // The table after glyf moved along intact.
    expect(Array.from(g.dummy)).toEqual([1, 2, 3, 4, 5]);
    expect(needsGlyphPadding(padded)).toBe(false);
  });

  it('also fixes short-loca fonts with 2-byte-only alignment', () => {
    const font = makeFont([6, 10, 4], false);
    const padded = padTrueTypeGlyphs(font);
    expect(readGlyphs(padded).lengths).toEqual([8, 12, 4]);
  });
});
