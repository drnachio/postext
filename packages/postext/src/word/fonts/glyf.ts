// TrueType outlines and metrics (#1393): `loca`/`glyf` cut into one byte
// run per glyph, composite component indices renumbered, glyph programs
// stripped when the merged face drops its hinting tables, `hmtx` read per
// glyph and written back long.

import { ByteWriter, view } from './sfnt.js';

const ARG_1_AND_2_ARE_WORDS = 0x0001;
const WE_HAVE_A_SCALE = 0x0008;
const MORE_COMPONENTS = 0x0020;
const WE_HAVE_AN_X_AND_Y_SCALE = 0x0040;
const WE_HAVE_A_TWO_BY_TWO = 0x0080;
const WE_HAVE_INSTRUCTIONS = 0x0100;

/** Each glyph's bytes (empty for a glyph without outline). */
export function readGlyphs(loca: Uint8Array, glyf: Uint8Array, numGlyphs: number, longLoca: boolean): Uint8Array[] {
  const lv = view(loca);
  const at = (i: number): number => (longLoca ? lv.getUint32(i * 4) : lv.getUint16(i * 2) * 2);
  const glyphs: Uint8Array[] = [];
  for (let i = 0; i < numGlyphs; i++) {
    const start = at(i);
    const end = at(i + 1);
    glyphs.push(end > start && end <= glyf.byteLength ? glyf.subarray(start, end) : new Uint8Array(0));
  }
  return glyphs;
}

/** Bytes of a component record after its flags and glyph index. */
function componentTail(flags: number): number {
  let n = flags & ARG_1_AND_2_ARE_WORDS ? 4 : 2;
  if (flags & WE_HAVE_A_SCALE) n += 2;
  else if (flags & WE_HAVE_AN_X_AND_Y_SCALE) n += 4;
  else if (flags & WE_HAVE_A_TWO_BY_TWO) n += 8;
  return n;
}

/** The component glyph indices of a composite glyph (empty for a simple
 *  one). */
export function componentGlyphs(glyph: Uint8Array): number[] {
  if (glyph.byteLength < 10) return [];
  const v = view(glyph);
  if (v.getInt16(0) >= 0) return [];
  const out: number[] = [];
  let p = 10;
  for (;;) {
    if (p + 4 > glyph.byteLength) break;
    const flags = v.getUint16(p);
    out.push(v.getUint16(p + 2));
    p += 4 + componentTail(flags);
    if (!(flags & MORE_COMPONENTS)) break;
  }
  return out;
}

/**
 * A glyph renumbered for the merged face: composite component indices
 * passed through `remap`, and with `strip` its instructions dropped
 * (a simple glyph's program emptied, a composite's trailing program cut).
 */
export function rewriteGlyph(glyph: Uint8Array, remap: (g: number) => number, strip: boolean): Uint8Array {
  if (glyph.byteLength < 10) return glyph;
  const v = view(glyph);
  const contours = v.getInt16(0);
  if (contours >= 0) {
    if (!strip) return glyph;
    const lenAt = 10 + contours * 2;
    if (lenAt + 2 > glyph.byteLength) return glyph;
    const len = v.getUint16(lenAt);
    if (len === 0) return glyph;
    const out = new Uint8Array(glyph.byteLength - len);
    out.set(glyph.subarray(0, lenAt + 2));
    out.set(glyph.subarray(lenAt + 2 + len), lenAt + 2);
    view(out).setUint16(lenAt, 0);
    return out;
  }
  const out = glyph.slice();
  const ov = view(out);
  let p = 10;
  for (;;) {
    if (p + 4 > out.byteLength) return out;
    let flags = ov.getUint16(p);
    ov.setUint16(p + 2, remap(ov.getUint16(p + 2)));
    const more = (flags & MORE_COMPONENTS) !== 0;
    if (strip && !more && flags & WE_HAVE_INSTRUCTIONS) {
      flags &= ~WE_HAVE_INSTRUCTIONS;
      ov.setUint16(p, flags);
      return out.slice(0, p + 4 + componentTail(flags));
    }
    p += 4 + componentTail(flags);
    if (!more) return out;
  }
}

/** `loca` (long) and `glyf` for a list of glyphs, each 4-byte aligned. */
export function writeGlyphs(glyphs: Uint8Array[]): { loca: Uint8Array; glyf: Uint8Array } {
  const glyf = new ByteWriter();
  const loca = new ByteWriter();
  for (const g of glyphs) {
    loca.u32(glyf.length);
    glyf.bytes(g).pad(4);
  }
  loca.u32(glyf.length);
  return { loca: loca.finish(), glyf: glyf.finish() };
}

/** Advance width and left side bearing of each glyph. */
export function readHmtx(hmtx: Uint8Array, numberOfHMetrics: number, numGlyphs: number): [number, number][] {
  const v = view(hmtx);
  const out: [number, number][] = [];
  let advance = 0;
  for (let i = 0; i < numGlyphs; i++) {
    if (i < numberOfHMetrics) {
      if (i * 4 + 4 > hmtx.byteLength) break;
      advance = v.getUint16(i * 4);
      out.push([advance, v.getInt16(i * 4 + 2)]);
    } else {
      const at = numberOfHMetrics * 4 + (i - numberOfHMetrics) * 2;
      out.push([advance, at + 2 <= hmtx.byteLength ? v.getInt16(at) : 0]);
    }
  }
  while (out.length < numGlyphs) out.push([advance, 0]);
  return out;
}

/** `hmtx` with one long metric per glyph. */
export function writeHmtx(metrics: [number, number][]): Uint8Array {
  const w = new ByteWriter();
  for (const [advance, lsb] of metrics) w.u16(advance).i16(lsb);
  return w.finish();
}
