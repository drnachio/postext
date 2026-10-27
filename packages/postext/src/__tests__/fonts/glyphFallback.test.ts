import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline/build.js';
import { formatWarning } from '../../pipeline/contentWarnings.js';
import { rangesHave, sfntCodePointRanges, type CodePointRanges } from '../../fonts/cmap.js';
import { minimalFont } from '../../fonts/minimalFont.js';
import { forgetFontCoverage, glyphFallbacks, registerFontCoverage, GLYPH_FALLBACK_LISTED } from '../../fonts/glyphFallback.js';
import { fontStringFamilies } from '../../measure/fontString.js';
import type { ContentWarning, VDTDocument } from '../../vdt.js';

// #1105: a character the text sets in a face that has no glyph for it was
// taken from another face without a word. The build now says so, once per
// face, with the characters and the face that drew them.

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

/** A file with only a `cmap` table holding `subtable` (platform 3,
 *  encoding `encoding`): what the reader needs. */
function sfntWithCmap(subtable: number[], encoding = 1): Uint8Array {
  const cmap = [0, 0, 0, 1, 0, 3, 0, encoding, 0, 0, 0, 12, ...subtable];
  const header = [0, 1, 0, 0, 0, 1, 0, 16, 0, 0, 0, 0];
  const offset = 12 + 16;
  const rec = [...'cmap'].map((c) => c.charCodeAt(0)).concat([0, 0, 0, 0, 0, 0, 0, offset, 0, 0, (cmap.length >> 8) & 0xff, cmap.length & 0xff]);
  return Uint8Array.from([...header, ...rec, ...cmap]);
}
const u16 = (v: number) => [(v >> 8) & 0xff, v & 0xff];
const u32 = (v: number) => [...u16((v >>> 16) & 0xffff), ...u16(v & 0xffff)];

/** A format 4 subtable mapping each [start, end] segment with idDelta. */
function format4(segments: [number, number, number][]): number[] {
  const segs = [...segments, [0xffff, 0xffff, 1] as [number, number, number]];
  const n = segs.length;
  const body = [
    ...u16(n * 2), ...u16(0), ...u16(0), ...u16(0),
    ...segs.flatMap(([, end]) => u16(end)), ...u16(0),
    ...segs.flatMap(([start]) => u16(start)),
    ...segs.flatMap(([, , delta]) => u16(delta & 0xffff)),
    ...segs.flatMap(() => u16(0)),
  ];
  return [...u16(4), ...u16(6 + body.length), ...u16(0), ...body];
}

function format12(groups: [number, number, number][]): number[] {
  return [...u16(12), ...u16(0), ...u32(16 + groups.length * 12), ...u32(0), ...u32(groups.length), ...groups.flatMap(([a, b, g]) => [...u32(a), ...u32(b), ...u32(g)])];
}

const LATIN: CodePointRanges = [[0x20, 0x7e]];

afterEach(() => forgetFontCoverage());

describe('#1105: the cmap reader', () => {
  it('reads the format 13 cmap of a minimal font', () => {
    const ranges = sfntCodePointRanges(minimalFont({ family: 'Probe', ranges: [[0x41, 0x5a], [0x2190, 0x2193]], advanceEm: 1 }))!;
    expect(ranges).toEqual([[0x41, 0x5a], [0x2190, 0x2193]]);
  });

  it('reads a format 4 subtable, leaving out the code that maps to .notdef', () => {
    // 0x41–0x45 map to glyphs 1–5; 0x60–0x62 with delta -0x61 send 0x61 to 0.
    const ranges = sfntCodePointRanges(sfntWithCmap(format4([[0x41, 0x45, -0x40], [0x60, 0x62, -0x61]])))!;
    expect(ranges).toEqual([[0x41, 0x45], [0x60, 0x60], [0x62, 0x62]]);
  });

  it('reads a format 12 subtable over the BMP', () => {
    const ranges = sfntCodePointRanges(sfntWithCmap(format12([[0x1f600, 0x1f602, 3], [0x30, 0x39, 10]]), 10))!;
    expect(rangesHave(ranges, 0x1f601)).toBe(true);
    expect(rangesHave(ranges, 0x35)).toBe(true);
    expect(rangesHave(ranges, 0x40)).toBe(false);
  });

  it('answers null for what is not a TrueType or OpenType file', () => {
    expect(sfntCodePointRanges(Uint8Array.from([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0, 0, 0, 0, 0]))).toBeNull();
    expect(sfntCodePointRanges(new Uint8Array(4))).toBeNull();
  });
});

describe('#1105: font lists', () => {
  it('lists every family of a shorthand', () => {
    expect(fontStringFamilies('italic 700 16px "Subset Sans", \'Wide, Serif\', serif')).toEqual(['Subset Sans', 'Wide, Serif', 'serif']);
    expect(fontStringFamilies('16px Lora')).toEqual(['Lora']);
  });
});

describe('#1105: glyphFallback warnings', () => {
  const build = (markdown: string, family = 'Subset Sans') =>
    buildDocument({ markdown }, { page: { dpi: 100 }, layout: { layoutType: 'single' }, bodyText: { fontFamily: family }, headings: { fontFamily: family } });
  const glyphWarnings = (warnings: readonly ContentWarning[] | undefined) =>
    (warnings ?? []).filter((w): w is Extract<ContentWarning, { kind: 'glyphFallback' }> => w.kind === 'glyphFallback');

  it('names the characters a subset face lacks, from the cmap of its file', () => {
    registerFontCoverage('Subset Sans', 400, 'normal', minimalFont({ family: 'Subset Sans', ranges: LATIN, advanceEm: 0.5 }));
    const doc = build('An arrow → here, and ← back → again.');
    const found = glyphWarnings(doc.contentWarnings);
    expect(found).toEqual([{ kind: 'glyphFallback', family: 'Subset Sans', weight: 400, style: 'normal', characters: ['→', '←'], count: 2 }]);
    const message = formatWarning(found[0]!);
    expect(message).toContain('"Subset Sans" 400 has no glyph for 2 characters (→ ←)');
    expect(message).toContain('a face the system picks');
  });

  it('names the family of a font list that drew them', () => {
    registerFontCoverage('Subset Sans', 400, 'normal', LATIN);
    registerFontCoverage('Wide Serif', 400, 'normal', [[0x20, 0x7e], [0x2190, 0x21ff]]);
    const font = '400 16px "Subset Sans", "Wide Serif", serif';
    const line = { text: 'a → b', bbox: { x: 0, y: 0, width: 10, height: 10 }, baseline: 8, hyphenated: false, segments: [{ kind: 'text' as const, text: 'a → b', width: 10, fontString: font }] };
    const doc = { blocks: [{ lines: [line], fontString: font }], pages: [] } as unknown as VDTDocument;
    const [w] = glyphFallbacks(doc);
    expect(w).toMatchObject({ family: 'Subset Sans', characters: ['→'], supplier: 'Wide Serif' });
    expect(formatWarning({ kind: 'glyphFallback', ...w! })).toContain('the face of "Wide Serif" draws them');
  });

  it('gives one warning per face across documents, its list capped', () => {
    registerFontCoverage('Subset Sans', 400, 'normal', [[0x20, 0x7e]]);
    const greek = 'αβγδεζηθικλμνξοπρστυφχψω';
    const a = build(`Greek ${greek.slice(0, 12)}.`);
    const b = build(`More ${greek} and ${greek.slice(0, 3)}.`);
    const merged = glyphFallbacks([a, b]);
    expect(merged).toHaveLength(1);
    expect(merged[0]!.count).toBe(greek.length);
    expect(merged[0]!.characters).toHaveLength(Math.min(GLYPH_FALLBACK_LISTED, greek.length));
    expect(merged[0]!.characters.slice(0, 3)).toEqual(['α', 'β', 'γ']);
  });

  it('reads a slice by its unicode-range and adds the slices of a face up', () => {
    const all = minimalFont({ family: 'Subset Sans', ranges: [[0x20, 0x7e], [0x391, 0x3c9]], advanceEm: 0.5 });
    registerFontCoverage('Subset Sans', 400, 'normal', all, 'U+0000-00FF');
    expect(glyphFallbacks(build('Alpha α.'))[0]?.characters).toEqual(['α']);
    registerFontCoverage('Subset Sans', 400, 'normal', all, 'U+0370-03FF');
    expect(glyphFallbacks(build('Alpha α.'))).toEqual([]);
  });

  it('checks nothing for a face no source knows, nor marks, spaces and joiners', () => {
    expect(glyphWarnings(build('An arrow → here.').contentWarnings)).toEqual([]);
    registerFontCoverage('Subset Sans', 400, 'normal', LATIN);
    expect(glyphWarnings(build('Café a b‍c.').contentWarnings)).toEqual([]);
  });

  it('stays quiet behind debug.warnings.missingFont: false', () => {
    registerFontCoverage('Subset Sans', 400, 'normal', LATIN);
    const doc = buildDocument({ markdown: 'An arrow → here.' }, { bodyText: { fontFamily: '"Subset Sans", serif' }, debug: { warnings: { missingFont: false } } });
    expect(glyphWarnings(doc.contentWarnings)).toEqual([]);
  });
});
