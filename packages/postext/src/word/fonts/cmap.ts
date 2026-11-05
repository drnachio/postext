// The `cmap` table (#1393): read the best Unicode subtable of a face into a
// code point → glyph map, and write a merged face's map back as a Windows
// BMP format 4 subtable beside a full-repertoire format 12 one.

import { ByteWriter, view } from './sfnt.js';

function readFormat4(t: Uint8Array, at: number, out: Map<number, number>): void {
  const v = view(t);
  const segX2 = v.getUint16(at + 6);
  const ends = at + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const ranges = deltas + segX2;
  for (let s = 0; s < segX2; s += 2) {
    const end = v.getUint16(ends + s);
    const start = v.getUint16(starts + s);
    const delta = v.getUint16(deltas + s);
    const rangeOffset = v.getUint16(ranges + s);
    for (let c = start; c <= end && c !== 0xffff; c++) {
      let g: number;
      if (rangeOffset === 0) g = (c + delta) & 0xffff;
      else {
        const p = ranges + s + rangeOffset + (c - start) * 2;
        if (p + 2 > t.byteLength) break;
        g = v.getUint16(p);
        if (g !== 0) g = (g + delta) & 0xffff;
      }
      if (g !== 0) out.set(c, g);
    }
  }
}

function readFormat12(t: Uint8Array, at: number, out: Map<number, number>): void {
  const v = view(t);
  const groups = v.getUint32(at + 12);
  for (let i = 0; i < groups; i++) {
    const r = at + 16 + i * 12;
    if (r + 12 > t.byteLength) break;
    const start = v.getUint32(r);
    const end = Math.min(v.getUint32(r + 4), 0x10ffff);
    const glyph = v.getUint32(r + 8);
    for (let c = start; c <= end; c++) if (glyph + c - start !== 0) out.set(c, glyph + c - start);
  }
}

function readFormat6(t: Uint8Array, at: number, out: Map<number, number>): void {
  const v = view(t);
  const first = v.getUint16(at + 6);
  const count = v.getUint16(at + 8);
  for (let i = 0; i < count; i++) {
    const g = v.getUint16(at + 10 + i * 2);
    if (g !== 0) out.set(first + i, g);
  }
}

/** Whether the face's map is a Windows symbol one (3,0): Word wants
 *  charset 02 for it. */
export function isSymbolCmap(t: Uint8Array | undefined): boolean {
  if (!t || t.byteLength < 4) return false;
  const v = view(t);
  const n = v.getUint16(2);
  let symbol = false;
  for (let i = 0; i < n; i++) {
    const platform = v.getUint16(4 + i * 8);
    const encoding = v.getUint16(6 + i * 8);
    if (platform === 3 && encoding === 0) symbol = true;
    if ((platform === 3 && (encoding === 1 || encoding === 10)) || platform === 0) return false;
  }
  return symbol;
}

/**
 * The face's Unicode map: the full-repertoire subtable when there is one
 * (3,10 / 0,4 / 0,6), else the BMP one (3,1 / 0,3 / 0,x), else a symbol
 * map (3,0). Formats 4, 6 and 12 are read; others are skipped.
 */
export function readCmap(t: Uint8Array | undefined): Map<number, number> {
  const out = new Map<number, number>();
  if (!t || t.byteLength < 4) return out;
  const v = view(t);
  const n = v.getUint16(2);
  const rank = (platform: number, encoding: number): number => {
    if (platform === 3 && encoding === 10) return 5;
    if (platform === 0 && (encoding === 4 || encoding === 6)) return 4;
    if (platform === 3 && encoding === 1) return 3;
    if (platform === 0) return 2;
    if (platform === 3 && encoding === 0) return 1;
    return 0;
  };
  const subtables: { rank: number; offset: number }[] = [];
  for (let i = 0; i < n; i++) {
    const r = 4 + i * 8;
    if (r + 8 > t.byteLength) break;
    const k = rank(v.getUint16(r), v.getUint16(r + 2));
    if (k > 0) subtables.push({ rank: k, offset: v.getUint32(r + 4) });
  }
  subtables.sort((a, b) => b.rank - a.rank);
  for (const { offset } of subtables) {
    if (offset + 2 > t.byteLength) continue;
    const format = v.getUint16(offset);
    if (format === 12) readFormat12(t, offset, out);
    else if (format === 4) readFormat4(t, offset, out);
    else if (format === 6) readFormat6(t, offset, out);
    else continue;
    if (out.size > 0) break;
  }
  return out;
}

interface Segment {
  start: number;
  end: number;
  glyphs: number[];
}

/** BMP code points cut into runs of consecutive codes. */
function bmpSegments(entries: [number, number][]): Segment[] {
  const segments: Segment[] = [];
  for (const [code, glyph] of entries) {
    if (code >= 0xffff) break;
    const last = segments[segments.length - 1];
    if (last && last.end + 1 === code) {
      last.end = code;
      last.glyphs.push(glyph);
    } else segments.push({ start: code, end: code, glyphs: [glyph] });
  }
  return segments;
}

/** Format 4: one segment per run of consecutive codes, an `idDelta` when
 *  the run's glyphs are consecutive too, a glyph array otherwise. Runs past
 *  what a 64 KB subtable holds are left to format 12. */
function format4(entries: [number, number][]): Uint8Array {
  let segments = bmpSegments(entries);
  const size = (segs: Segment[]): number => {
    let s = 16 + (segs.length + 1) * 8;
    for (const seg of segs) if (!consecutive(seg)) s += seg.glyphs.length * 2;
    return s;
  };
  while (segments.length > 0 && size(segments) > 0xffff) segments = segments.slice(0, Math.floor(segments.length * 0.9));
  segments.push({ start: 0xffff, end: 0xffff, glyphs: [0] });
  const segCount = segments.length;
  let entrySelector = 0;
  while (1 << (entrySelector + 1) <= segCount) entrySelector++;
  const searchRange = 2 << entrySelector;
  const w = new ByteWriter();
  w.u16(4).u16(0).u16(0).u16(segCount * 2).u16(searchRange).u16(entrySelector).u16(segCount * 2 - searchRange);
  for (const s of segments) w.u16(s.end);
  w.u16(0);
  for (const s of segments) w.u16(s.start);
  const arrays: number[] = [];
  const rangeOffsets: number[] = [];
  segments.forEach((s, i) => {
    if (s.start === 0xffff) {
      w.u16(1);
      rangeOffsets.push(0);
    } else if (consecutive(s)) {
      w.u16((s.glyphs[0]! - s.start) & 0xffff);
      rangeOffsets.push(0);
    } else {
      w.u16(0);
      // From this segment's idRangeOffset word to its first glyph slot.
      rangeOffsets.push((segCount - i + arrays.length) * 2);
      arrays.push(...s.glyphs);
    }
  });
  for (const r of rangeOffsets) w.u16(r);
  for (const g of arrays) w.u16(g);
  w.setU16(2, w.length);
  return w.finish();
}

function consecutive(seg: Segment): boolean {
  for (let i = 1; i < seg.glyphs.length; i++) if (seg.glyphs[i] !== seg.glyphs[0]! + i) return false;
  return true;
}

/** Format 12: groups of consecutive codes mapped to consecutive glyphs. */
function format12(entries: [number, number][]): Uint8Array {
  const groups: [number, number, number][] = [];
  for (const [code, glyph] of entries) {
    const last = groups[groups.length - 1];
    if (last && last[1] + 1 === code && last[2] + (code - last[0]) === glyph) last[1] = code;
    else groups.push([code, code, glyph]);
  }
  const w = new ByteWriter();
  w.u16(12).u16(0).u32(16 + groups.length * 12).u32(0).u32(groups.length);
  for (const [s, e, g] of groups) w.u32(s).u32(e).u32(g);
  return w.finish();
}

/** A `cmap` table with a (3,1) format 4 and a (3,10) format 12 subtable,
 *  or a (3,0) symbol one alone for a symbol face. */
export function writeCmap(map: Map<number, number>, symbol = false): Uint8Array {
  const entries = [...map].filter(([, g]) => g > 0).sort((a, b) => a[0] - b[0]);
  if (symbol) {
    const f4 = format4(entries);
    return new ByteWriter().u16(0).u16(1).u16(3).u16(0).u32(12).bytes(f4).finish();
  }
  const f4 = format4(entries);
  const f12 = format12(entries);
  const w = new ByteWriter();
  w.u16(0).u16(2);
  w.u16(3).u16(1).u32(20);
  w.u16(3).u16(10).u32(20 + f4.byteLength);
  w.bytes(f4).bytes(f12);
  return w.finish();
}
