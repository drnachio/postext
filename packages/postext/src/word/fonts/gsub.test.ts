import { describe, it, expect } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { fileURLToPath } from 'node:url';
import { gsubSingles } from './gsub.js';
import { ByteWriter, readSfnt } from './sfnt.js';
import { readCmap } from './cmap.js';

/** A GSUB with one script (`script`), one feature per entry and one
 *  single-substitution lookup each, built the way the options say. */
function gsubOf(script: string, feats: { tag: string; map: [number, number][]; extension?: boolean; delta?: number }[]): Uint8Array {
  const w = new ByteWriter();
  // Header (10) · ScriptList · FeatureList · LookupList, offsets laid out by hand.
  const scriptList = 10;
  const scriptListLen = 2 + 6 + 4 + 6 + 2 * feats.length; // records, Script, LangSys
  const featureList = scriptList + scriptListLen;
  const featureListLen = 2 + 6 * feats.length + 6 * feats.length;
  const lookupList = featureList + featureListLen;
  w.u16(1).u16(0).u16(scriptList).u16(featureList).u16(lookupList);
  // ScriptList: one record → Script with a default LangSys listing every feature.
  w.u16(1).bytes(new TextEncoder().encode(script)).u16(8);
  w.u16(4).u16(0); // Script: defaultLangSys at 4, no language records
  w.u16(0).u16(0xffff).u16(feats.length);
  feats.forEach((_, i) => w.u16(i));
  // FeatureList.
  w.u16(feats.length);
  feats.forEach((f, i) => w.bytes(new TextEncoder().encode(f.tag)).u16(2 + 6 * feats.length + 6 * i));
  feats.forEach((_, i) => w.u16(0).u16(1).u16(i));
  // LookupList: each lookup is 8 bytes, then its subtable.
  const subs = feats.map((f) => {
    const s = new ByteWriter();
    const glyphs = f.map.map(([g]) => g);
    // Coverage format 2 (one range per glyph) after the subtable header.
    const cover = (sw: ByteWriter): void => {
      sw.u16(2).u16(glyphs.length);
      glyphs.forEach((g, i) => sw.u16(g).u16(g).u16(i));
    };
    if (f.delta !== undefined) {
      s.u16(1).u16(6).i16(f.delta);
    } else {
      s.u16(2).u16(6 + 2 * glyphs.length).u16(glyphs.length);
      f.map.forEach(([, to]) => s.u16(to));
    }
    cover(s);
    const single = s.finish();
    if (!f.extension) return { type: 1, bytes: single };
    return { type: 7, bytes: new ByteWriter().u16(1).u16(1).u32(8).bytes(single).finish() };
  });
  w.u16(feats.length);
  let at = 2 + 2 * feats.length;
  for (const s of subs) {
    w.u16(at);
    at += 8 + s.bytes.length;
  }
  for (const s of subs) w.u16(s.type).u16(0).u16(1).u16(8).bytes(s.bytes);
  return w.finish();
}

describe('GSUB single substitutions (#1406)', () => {
  it('reads format 1 and 2 substitutions, directly and through extensions', () => {
    const gsub = gsubOf('latn', [
      { tag: 'tnum', map: [[5, 20], [6, 21]] },
      { tag: 'onum', map: [[5, 30], [7, 31]], extension: true },
      { tag: 'smcp', map: [[8, 40]], delta: 32 },
    ]);
    expect([...gsubSingles(gsub, ['tnum'])]).toEqual([[5, 20], [6, 21]]);
    expect([...gsubSingles(gsub, ['onum'])]).toEqual([[5, 30], [7, 31]]);
    expect([...gsubSingles(gsub, ['smcp'])]).toEqual([[8, 40]]);
    // Lookups apply in list order: tnum swaps 5 first, onum no longer sees it.
    expect(new Map(gsubSingles(gsub, ['onum', 'tnum']))).toEqual(new Map([[5, 20], [6, 21], [7, 31]]));
    expect(gsubSingles(gsub, ['pnum']).size).toBe(0);
    expect(gsubSingles(undefined, ['tnum']).size).toBe(0);
  });

  it('chains a later lookup onto an earlier one', () => {
    const gsub = gsubOf('DFLT', [{ tag: 'tnum', map: [[5, 9]] }, { tag: 'onum', map: [[9, 12]], extension: true }]);
    expect(new Map(gsubSingles(gsub, ['tnum', 'onum']))).toEqual(new Map([[5, 12], [9, 12]]));
  });

  it('takes a feature only another script lists', () => {
    const gsub = gsubOf('cyrl', [{ tag: 'tnum', map: [[5, 9]] }]);
    expect([...gsubSingles(gsub, ['tnum'])]).toEqual([[5, 9]]);
  });

  const lora = fileURLToPath(new URL('../../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
  it.runIf(existsSync(lora))('swaps Lora\'s figures for its tabular ones', () => {
    const font = readSfnt(new Uint8Array(readFileSync(lora)))!;
    const cmap = readCmap(font.tables.get('cmap'));
    const one = cmap.get(0x31)!;
    const tnum = gsubSingles(font.tables.get('GSUB'), ['tnum']);
    expect(tnum.get(one)).toBeDefined();
    expect(tnum.get(one)).not.toBe(one);
    // pnum undoes tnum; Lora has no onum, so its figures stay.
    const pnum = gsubSingles(font.tables.get('GSUB'), ['pnum']);
    expect(pnum.get(tnum.get(one)!)).toBe(one);
    expect(gsubSingles(font.tables.get('GSUB'), ['onum']).size).toBe(0);
  });
});
