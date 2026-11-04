// One TrueType face from its unicode-range slices (#1393). Fontsource cuts
// a face into slices (latin, latin-ext, cyrillic, greek, vietnamese …),
// each a subset of the same font with its own glyph numbering. Word embeds
// one file per style slot, so the slices are joined: the base slice (the
// one holding Basic Latin) keeps its glyph numbers, and with them its
// GSUB/GPOS/GDEF/kern tables stay valid; every other slice's glyphs follow,
// renumbered, without layout features. The first slice to map a code point
// wins.

import { readCmap, isSymbolCmap, writeCmap } from './cmap.js';
import { readGlyphs, readHmtx, rewriteGlyph, writeGlyphs, writeHmtx } from './glyf.js';
import { ByteWriter, type Sfnt, SFNT_TRUETYPE, view } from './sfnt.js';

/** Tables taken from the base slice unchanged: their glyph numbers are the
 *  base slice's, which the merged face keeps. */
const BASE_TABLES = ['GDEF', 'GSUB', 'GPOS', 'kern', 'gasp'];
/** Hinting tables: kept only when every slice carries the same bytes. */
const HINT_TABLES = ['fpgm', 'prep', 'cvt '];

interface Slice {
  font: Sfnt;
  cmap: Map<number, number>;
  glyphs: Uint8Array[];
  metrics: [number, number][];
}

function sameBytes(a: Uint8Array | undefined, b: Uint8Array | undefined): boolean {
  if (!a || !b) return a === b;
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

function readSlice(font: Sfnt): Slice | string {
  const head = font.tables.get('head');
  const maxp = font.tables.get('maxp');
  const hhea = font.tables.get('hhea');
  const loca = font.tables.get('loca');
  const glyf = font.tables.get('glyf');
  const hmtx = font.tables.get('hmtx');
  if (!head || !maxp || !hhea || !loca || !glyf || !hmtx) return 'missing a TrueType table';
  if (head.byteLength < 54 || maxp.byteLength < 6 || hhea.byteLength < 36) return 'truncated table';
  const numGlyphs = view(maxp).getUint16(4);
  const longLoca = view(head).getInt16(50) === 1;
  if (loca.byteLength < (numGlyphs + 1) * (longLoca ? 4 : 2)) return 'truncated loca';
  return {
    font,
    cmap: readCmap(font.tables.get('cmap')),
    glyphs: readGlyphs(loca, glyf, numGlyphs, longLoca),
    metrics: readHmtx(hmtx, view(hhea).getUint16(34), numGlyphs),
  };
}

function mergeHead(slices: Slice[]): Uint8Array {
  const out = slices[0]!.font.tables.get('head')!.slice();
  const v = view(out);
  let [xMin, yMin, xMax, yMax] = [v.getInt16(36), v.getInt16(38), v.getInt16(40), v.getInt16(42)];
  for (const s of slices.slice(1)) {
    const h = view(s.font.tables.get('head')!);
    xMin = Math.min(xMin, h.getInt16(36));
    yMin = Math.min(yMin, h.getInt16(38));
    xMax = Math.max(xMax, h.getInt16(40));
    yMax = Math.max(yMax, h.getInt16(42));
  }
  v.setInt16(36, xMin);
  v.setInt16(38, yMin);
  v.setInt16(40, xMax);
  v.setInt16(42, yMax);
  v.setInt16(50, 1);
  return out;
}

/** maxp 1.0: the glyph count summed, every other limit the slices' max. */
function mergeMaxp(slices: Slice[], numGlyphs: number, stripped: boolean): Uint8Array {
  const out = slices[0]!.font.tables.get('maxp')!.slice();
  const v = view(out);
  v.setUint16(4, numGlyphs);
  for (let at = 6; at + 2 <= out.byteLength; at += 2) {
    let max = v.getUint16(at);
    for (const s of slices.slice(1)) {
      const m = s.font.tables.get('maxp')!;
      if (at + 2 <= m.byteLength) max = Math.max(max, view(m).getUint16(at));
    }
    v.setUint16(at, max);
  }
  if (stripped && out.byteLength >= 28) v.setUint16(26, 0);
  return out;
}

function mergeHhea(slices: Slice[], metrics: [number, number][]): Uint8Array {
  const out = slices[0]!.font.tables.get('hhea')!.slice();
  const v = view(out);
  let advanceMax = 0;
  for (const [a] of metrics) advanceMax = Math.max(advanceMax, a);
  v.setUint16(10, advanceMax);
  for (const s of slices.slice(1)) {
    const h = view(s.font.tables.get('hhea')!);
    v.setInt16(12, Math.min(v.getInt16(12), h.getInt16(12)));
    v.setInt16(14, Math.min(v.getInt16(14), h.getInt16(14)));
    v.setInt16(16, Math.max(v.getInt16(16), h.getInt16(16)));
  }
  v.setUint16(34, metrics.length);
  return out;
}

/** OS/2: Unicode and code page ranges or-ed, first/last char widened. */
function mergeOs2(slices: Slice[], cmap: Map<number, number>): Uint8Array | undefined {
  const base = slices[0]!.font.tables.get('OS/2');
  if (!base || base.byteLength < 68) return base;
  const out = base.slice();
  const v = view(out);
  const or = (at: number): void => {
    let bits = v.getUint32(at);
    for (const s of slices.slice(1)) {
      const o = s.font.tables.get('OS/2');
      if (o && at + 4 <= o.byteLength) bits |= view(o).getUint32(at);
    }
    v.setUint32(at, bits >>> 0);
  };
  for (const at of [42, 46, 50, 54]) or(at);
  if (v.getUint16(0) >= 1 && out.byteLength >= 86) {
    or(78);
    or(82);
  }
  let first = Infinity;
  let last = -1;
  for (const code of cmap.keys()) {
    first = Math.min(first, code);
    last = Math.max(last, code);
  }
  if (last >= 0) {
    v.setUint16(64, Math.min(0xffff, first));
    v.setUint16(66, Math.min(0xffff, last));
  }
  return out;
}

/** `post` version 3 (no glyph names) with the base slice's metrics. */
function postV3(base: Uint8Array | undefined): Uint8Array {
  const w = new ByteWriter();
  w.u32(0x00030000);
  if (base && base.byteLength >= 32) w.bytes(base.subarray(4, 32));
  else w.u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);
  return w.finish();
}

/** The slice to keep glyph numbers for: the one mapping 'A', else the one
 *  with most glyphs. */
function baseIndex(slices: Slice[]): number {
  const latin = slices.findIndex((s) => s.cmap.has(0x41));
  if (latin >= 0) return latin;
  let best = 0;
  slices.forEach((s, i) => {
    if (s.glyphs.length > slices[best]!.glyphs.length) best = i;
  });
  return best;
}

/**
 * The slices of one face joined into one static TrueType font, or an
 * error message. A single slice comes back unchanged.
 */
export function mergeSlices(fonts: Sfnt[]): Sfnt | string {
  if (fonts.length === 1) return fonts[0]!;
  const read = fonts.map(readSlice);
  const failed = read.find((s): s is string => typeof s === 'string');
  if (failed) return failed;
  const all = read as Slice[];
  const bi = baseIndex(all);
  const slices = [all[bi]!, ...all.filter((_, i) => i !== bi)];
  const upem = view(slices[0]!.font.tables.get('head')!).getUint16(18);
  if (slices.some((s) => view(s.font.tables.get('head')!).getUint16(18) !== upem)) return 'slices differ in unitsPerEm';

  const hints = HINT_TABLES.map((t) => slices[0]!.font.tables.get(t));
  const keepHints = HINT_TABLES.every((t, i) => slices.every((s) => sameBytes(s.font.tables.get(t), hints[i])));

  const glyphs: Uint8Array[] = [];
  const metrics: [number, number][] = [];
  const cmap = new Map<number, number>();
  for (const s of slices) {
    const first = glyphs.length;
    // A later slice's .notdef is the base's; its other glyphs follow.
    const remap = (g: number): number => (first === 0 ? g : g === 0 ? 0 : first + g - 1);
    s.glyphs.forEach((g, i) => {
      if (first > 0 && i === 0) return;
      glyphs.push(rewriteGlyph(g, remap, !keepHints));
      metrics.push(s.metrics[i]!);
    });
    for (const [code, g] of s.cmap) if (!cmap.has(code) && g < s.glyphs.length) cmap.set(code, remap(g));
  }
  if (glyphs.length > 0xffff) return 'merged face has more than 65535 glyphs';

  const base = slices[0]!.font.tables;
  const tables = new Map<string, Uint8Array>();
  const { loca, glyf } = writeGlyphs(glyphs);
  tables.set('head', mergeHead(slices));
  tables.set('hhea', mergeHhea(slices, metrics));
  tables.set('maxp', mergeMaxp(slices, glyphs.length, !keepHints));
  tables.set('hmtx', writeHmtx(metrics));
  tables.set('loca', loca);
  tables.set('glyf', glyf);
  tables.set('cmap', writeCmap(cmap, isSymbolCmap(base.get('cmap'))));
  tables.set('post', postV3(base.get('post')));
  const os2 = mergeOs2(slices, cmap);
  if (os2) tables.set('OS/2', os2);
  const name = base.get('name');
  if (name) tables.set('name', name);
  for (const t of BASE_TABLES) {
    const data = base.get(t);
    if (data) tables.set(t, data);
  }
  if (keepHints) HINT_TABLES.forEach((t, i) => hints[i] && tables.set(t, hints[i]!));
  return { flavor: SFNT_TRUETYPE, tables };
}
