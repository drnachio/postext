// A font file with features frozen in (#1237): a copy whose `cmap` maps
// each character to the glyph the features' single substitutions give it,
// for a canvas that sets no features (Skia in Node, the CLI). Measured and
// painted with the copy, a style's figures come out as the browser sets
// them with `featureSettings` and the PDF with the features: the figures
// are glyphs of their own, reached through single substitutions (GSUB
// lookup type 1, or 7 wrapping it) in every font that has them. Contextual
// lookups are left out, and so is GPOS: the copy kerns the glyphs it maps
// as the font kerns them.

const tag = (view: DataView, at: number): string =>
  String.fromCharCode(view.getUint8(at), view.getUint8(at + 1), view.getUint8(at + 2), view.getUint8(at + 3));

interface TableRecord {
  tag: string;
  offset: number;
  length: number;
}

function tableRecords(view: DataView): TableRecord[] | null {
  if (view.byteLength < 12) return null;
  const version = view.getUint32(0);
  if (version !== 0x00010000 && tag(view, 0) !== 'OTTO' && tag(view, 0) !== 'true') return null;
  const count = view.getUint16(4);
  if (12 + count * 16 > view.byteLength) return null;
  const out: TableRecord[] = [];
  for (let i = 0; i < count; i++) {
    const at = 12 + i * 16;
    const offset = view.getUint32(at + 8);
    const length = view.getUint32(at + 12);
    if (offset + length > view.byteLength) return null;
    out.push({ tag: tag(view, at), offset, length });
  }
  return out;
}

/** The characters a `cmap` maps to glyphs (formats 4 and 12, the Unicode
 *  subtables), code point → glyph id. */
function readCmap(view: DataView, at: number): Map<number, number> {
  const map = new Map<number, number>();
  const count = view.getUint16(at + 2);
  const subtables: { platform: number; encoding: number; offset: number }[] = [];
  for (let i = 0; i < count; i++) {
    const r = at + 4 + i * 8;
    subtables.push({ platform: view.getUint16(r), encoding: view.getUint16(r + 2), offset: at + view.getUint32(r + 4) });
  }
  const unicode = subtables.filter((s) => s.platform === 0 || (s.platform === 3 && (s.encoding === 1 || s.encoding === 10)));
  // Format 12 first (it holds the whole range), then format 4.
  const ordered = [...unicode].sort((a, b) => (view.getUint16(b.offset) === 12 ? 1 : 0) - (view.getUint16(a.offset) === 12 ? 1 : 0));
  for (const s of ordered) {
    const format = view.getUint16(s.offset);
    if (format === 12) {
      const groups = view.getUint32(s.offset + 12);
      for (let g = 0; g < groups; g++) {
        const r = s.offset + 16 + g * 12;
        const start = view.getUint32(r);
        const end = view.getUint32(r + 4);
        const glyph = view.getUint32(r + 8);
        for (let c = start; c <= end && c <= 0x10ffff; c++) if (!map.has(c)) map.set(c, glyph + (c - start));
      }
    } else if (format === 4) {
      const segX2 = view.getUint16(s.offset + 6);
      const ends = s.offset + 14;
      const starts = ends + segX2 + 2;
      const deltas = starts + segX2;
      const ranges = deltas + segX2;
      for (let k = 0; k < segX2; k += 2) {
        const end = view.getUint16(ends + k);
        const start = view.getUint16(starts + k);
        const delta = view.getInt16(deltas + k);
        const rangeOffset = view.getUint16(ranges + k);
        for (let c = start; c <= end && c !== 0xffff; c++) {
          if (map.has(c)) continue;
          let glyph: number;
          if (rangeOffset === 0) {
            glyph = (c + delta) & 0xffff;
          } else {
            const g = ranges + k + rangeOffset + (c - start) * 2;
            if (g + 2 > view.byteLength) continue;
            glyph = view.getUint16(g);
            if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
          }
          if (glyph !== 0) map.set(c, glyph);
        }
      }
    }
  }
  return map;
}

/** The glyphs a coverage table lists, glyph id → coverage index. */
function readCoverage(view: DataView, at: number): Map<number, number> {
  const out = new Map<number, number>();
  const format = view.getUint16(at);
  if (format === 1) {
    const count = view.getUint16(at + 2);
    for (let i = 0; i < count; i++) out.set(view.getUint16(at + 4 + i * 2), i);
  } else if (format === 2) {
    const count = view.getUint16(at + 2);
    for (let i = 0; i < count; i++) {
      const r = at + 4 + i * 6;
      const start = view.getUint16(r);
      const end = view.getUint16(r + 2);
      const index = view.getUint16(r + 4);
      for (let g = start; g <= end; g++) out.set(g, index + (g - start));
    }
  }
  return out;
}

/** A single substitution subtable as a glyph map. */
function readSingleSubstitution(view: DataView, at: number): Map<number, number> {
  const out = new Map<number, number>();
  const format = view.getUint16(at);
  const coverage = readCoverage(view, at + view.getUint16(at + 2));
  if (format === 1) {
    const delta = view.getInt16(at + 4);
    for (const glyph of coverage.keys()) out.set(glyph, (glyph + delta) & 0xffff);
  } else if (format === 2) {
    const count = view.getUint16(at + 4);
    for (const [glyph, index] of coverage) if (index < count) out.set(glyph, view.getUint16(at + 6 + index * 2));
  }
  return out;
}

/** The single substitutions of `features` in a `GSUB` table, one map per
 *  lookup, in lookup order (the order they apply in). */
function featureSubstitutions(view: DataView, at: number, features: ReadonlySet<string>): Map<number, number>[] {
  const featureList = at + view.getUint16(at + 6);
  const lookupList = at + view.getUint16(at + 8);
  const lookups = new Set<number>();
  const featureCount = view.getUint16(featureList);
  for (let i = 0; i < featureCount; i++) {
    const r = featureList + 2 + i * 6;
    if (!features.has(tag(view, r))) continue;
    const feature = featureList + view.getUint16(r + 4);
    const n = view.getUint16(feature + 2);
    for (let k = 0; k < n; k++) lookups.add(view.getUint16(feature + 4 + k * 2));
  }
  const lookupCount = view.getUint16(lookupList);
  const out: Map<number, number>[] = [];
  for (const index of [...lookups].sort((a, b) => a - b)) {
    if (index >= lookupCount) continue;
    const lookup = lookupList + view.getUint16(lookupList + 2 + index * 2);
    const type = view.getUint16(lookup);
    const subCount = view.getUint16(lookup + 4);
    const map = new Map<number, number>();
    for (let s = 0; s < subCount; s++) {
      let sub = lookup + view.getUint16(lookup + 6 + s * 2);
      let subType = type;
      // An extension subtable points at a subtable of its own type.
      if (type === 7 && view.getUint16(sub) === 1) {
        subType = view.getUint16(sub + 2);
        sub += view.getUint32(sub + 4);
      }
      if (subType !== 1) continue;
      // The first subtable that covers a glyph substitutes it.
      for (const [from, to] of readSingleSubstitution(view, sub)) if (!map.has(from)) map.set(from, to);
    }
    if (map.size > 0) out.push(map);
  }
  return out;
}

class Writer {
  private chunks: number[] = [];
  u16(v: number): void { this.chunks.push((v >> 8) & 0xff, v & 0xff); }
  u32(v: number): void { this.u16((v >>> 16) & 0xffff); this.u16(v & 0xffff); }
  get length(): number { return this.chunks.length; }
  bytes(): Uint8Array { return Uint8Array.from(this.chunks); }
}

/** A format 12 subtable of `map` (sorted code points). */
function format12(entries: readonly [number, number][]): Uint8Array {
  const groups: [number, number, number][] = [];
  for (const [c, g] of entries) {
    const last = groups[groups.length - 1];
    if (last && c === last[1] + 1 && g === last[2] + (c - last[0])) last[1] = c;
    else groups.push([c, c, g]);
  }
  const w = new Writer();
  w.u16(12); w.u16(0); w.u32(16 + groups.length * 12); w.u32(0); w.u32(groups.length);
  for (const [start, end, glyph] of groups) { w.u32(start); w.u32(end); w.u32(glyph); }
  return w.bytes();
}

/** A format 4 subtable of the BMP characters of `map`, or null when it
 *  does not fit one (64 KB). */
function format4(entries: readonly [number, number][]): Uint8Array | null {
  const bmp = entries.filter(([c]) => c < 0xffff);
  // Segments of consecutive characters; each lists its glyphs.
  const segments: { start: number; end: number; glyphs: number[] }[] = [];
  for (const [c, g] of bmp) {
    const last = segments[segments.length - 1];
    if (last && c === last.end + 1) {
      last.end = c;
      last.glyphs.push(g);
    } else {
      segments.push({ start: c, end: c, glyphs: [g] });
    }
  }
  const count = segments.length + 1;
  const glyphWords = segments.reduce((n, s) => n + s.glyphs.length, 0);
  const length = 16 + count * 8 + glyphWords * 2;
  if (length > 0xffff) return null;
  const w = new Writer();
  let search = 1;
  let selector = 0;
  while (search * 2 <= count) { search *= 2; selector++; }
  w.u16(4); w.u16(length); w.u16(0);
  w.u16(count * 2); w.u16(search * 2); w.u16(selector); w.u16(count * 2 - search * 2);
  for (const s of segments) w.u16(s.end);
  w.u16(0xffff);
  w.u16(0);
  for (const s of segments) w.u16(s.start);
  w.u16(0xffff);
  for (let i = 0; i < segments.length; i++) w.u16(0);
  w.u16(1);
  // idRangeOffset: from the offset's own place to the segment's glyphs.
  let glyphAt = 0;
  for (let i = 0; i < segments.length; i++) {
    w.u16((count - i) * 2 + glyphAt * 2);
    glyphAt += segments[i]!.glyphs.length;
  }
  w.u16(0);
  for (const s of segments) for (const g of s.glyphs) w.u16(g);
  return w.bytes();
}

function buildCmap(map: ReadonlyMap<number, number>): Uint8Array {
  const entries = [...map].sort((a, b) => a[0] - b[0]);
  const f12 = format12(entries);
  const f4 = format4(entries);
  const records: [number, number, Uint8Array][] = f4
    ? [[0, 3, f4], [0, 4, f12], [3, 1, f4], [3, 10, f12]]
    : [[0, 4, f12], [3, 10, f12]];
  const w = new Writer();
  w.u16(0); w.u16(records.length);
  const header = 4 + records.length * 8;
  const offsets = new Map<Uint8Array, number>();
  let at = header;
  for (const sub of [f4, f12]) {
    if (!sub) continue;
    offsets.set(sub, at);
    at += sub.length;
  }
  for (const [platform, encoding, sub] of records) { w.u16(platform); w.u16(encoding); w.u32(offsets.get(sub)!); }
  const head = w.bytes();
  const out = new Uint8Array(at);
  out.set(head, 0);
  for (const [sub, offset] of offsets) out.set(sub, offset);
  return out;
}

function checksum(bytes: Uint8Array, from: number, length: number): number {
  let sum = 0;
  for (let i = 0; i < length; i += 4) {
    let word = 0;
    for (let k = 0; k < 4; k++) word = (word << 8) | (i + k < length ? bytes[from + i + k]! : 0);
    sum = (sum + (word >>> 0)) >>> 0;
  }
  return sum;
}

/** The file with `cmap` in place of its own: tables in their order, each
 *  on a four-byte boundary, the checksum of the new table computed. */
function withCmap(bytes: Uint8Array, view: DataView, records: readonly TableRecord[], cmap: Uint8Array): Uint8Array {
  const count = records.length;
  const headerLength = 12 + count * 16;
  const bodies = records.map((r) => (r.tag === 'cmap' ? cmap : bytes.subarray(r.offset, r.offset + r.length)));
  let total = headerLength;
  for (const b of bodies) total += (b.length + 3) & ~3;
  const out = new Uint8Array(total);
  out.set(bytes.subarray(0, 12), 0);
  const outView = new DataView(out.buffer);
  let at = headerLength;
  records.forEach((r, i) => {
    const body = bodies[i]!;
    out.set(body, at);
    const rec = 12 + i * 16;
    out.set(bytes.subarray(12 + i * 16, 12 + i * 16 + 4), rec);
    outView.setUint32(rec + 4, r.tag === 'cmap' ? checksum(out, at, body.length) : view.getUint32(12 + i * 16 + 4));
    outView.setUint32(rec + 8, at);
    outView.setUint32(rec + 12, body.length);
    at += (body.length + 3) & ~3;
  });
  return out;
}

/**
 * A copy of a TrueType or OpenType file (`bytes`, not a collection nor a
 * WOFF) whose `cmap` maps every character to the glyph the single
 * substitutions of `features` (`['onum']`, `['lnum', 'tnum']`) give it,
 * applied in lookup order; the other tables as they are. The file itself
 * when the features substitute none of its characters, and null when it
 * cannot be read.
 */
export function freezeFontFeatures(bytes: Uint8Array, features: readonly string[]): Uint8Array | null {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const records = tableRecords(view);
  if (!records) return null;
  const cmapTable = records.find((r) => r.tag === 'cmap');
  if (!cmapTable) return null;
  const gsub = records.find((r) => r.tag === 'GSUB');
  if (!gsub || features.length === 0) return bytes;
  let substitutions: Map<number, number>[];
  let map: Map<number, number>;
  try {
    map = readCmap(view, cmapTable.offset);
    substitutions = featureSubstitutions(view, gsub.offset, new Set(features));
  } catch {
    return null;
  }
  let changed = false;
  for (const [c, glyph] of map) {
    let g = glyph;
    for (const lookup of substitutions) g = lookup.get(g) ?? g;
    if (g !== glyph) {
      map.set(c, g);
      changed = true;
    }
  }
  if (!changed) return bytes;
  return withCmap(bytes, view, records, buildCmap(map));
}
