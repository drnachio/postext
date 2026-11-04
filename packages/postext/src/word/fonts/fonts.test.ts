// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { existsSync, readFileSync } from 'node:fs';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { zlibSync } from 'fflate';
import { readCmap, writeCmap } from './cmap.js';
import { componentGlyphs, readGlyphs } from './glyf.js';
import { mergeSlices } from './merge.js';
import { readNames } from './meta.js';
import { faceKey, fitWordFamily, MAX_WORD_FAMILY, planWordFonts, wordFontFor, wordSlotFor } from './plan.js';
import { ByteWriter, readSfnt, type Sfnt, SFNT_OTTO, SFNT_TRUE, SFNT_TRUETYPE, tableChecksum, view, writeSfnt } from './sfnt.js';
import type { SourceFace } from './types.js';

// A tiny but valid TrueType font: .notdef, one square per code point (with
// a glyph program), and optionally a composite of the first two squares
// mapped to `composite`.
interface SynthOptions {
  codes: number[];
  composite?: number;
  fsType?: number;
  fpgm?: number[];
  family?: string;
  upem?: number;
  flavor?: number;
  extra?: Record<string, Uint8Array>;
}

function square(size: number): Uint8Array {
  const w = new ByteWriter();
  w.i16(1).i16(0).i16(0).i16(size).i16(size);
  w.u16(3);
  w.u16(2).u8(0xb0).u8(0x01); // PUSHB[0] 1 — a two-byte program
  for (let i = 0; i < 4; i++) w.u8(0x01);
  for (const dx of [0, size, 0, -size]) w.i16(dx);
  for (const dy of [0, 0, size, 0]) w.i16(dy);
  return w.finish();
}

function compositeOf(a: number, b: number): Uint8Array {
  const w = new ByteWriter();
  w.i16(-1).i16(0).i16(0).i16(200).i16(200);
  w.u16(0x0001 | 0x0002 | 0x0020).u16(a).i16(0).i16(0);
  w.u16(0x0001 | 0x0002).u16(b).i16(100).i16(0);
  return w.finish();
}

function nameTable(family: string): Uint8Array {
  const records: [number, string][] = [
    [0, 'Copyright test'],
    [1, family],
    [2, 'Regular'],
    [4, family],
    [6, family.replace(/ /g, '')],
  ];
  const w = new ByteWriter();
  w.u16(0).u16(records.length).u16(6 + records.length * 12);
  const s = new ByteWriter();
  for (const [id, text] of records) {
    w.u16(3).u16(1).u16(0x409).u16(id).u16(text.length * 2).u16(s.length);
    for (const c of text) s.u16(c.charCodeAt(0));
  }
  return w.bytes(s.finish()).finish();
}

function os2Table(fsType: number): Uint8Array {
  const w = new ByteWriter();
  w.u16(4).i16(500).u16(400).u16(5).u16(fsType);
  for (let i = 0; i < 10; i++) w.i16(0); // subscript … strikeout
  w.i16(0x0105); // sFamilyClass: oldstyle serif
  for (const p of [2, 2, 5, 3, 5, 4, 5, 2, 2, 4]) w.u8(p);
  w.u32(0x80000001).u32(2).u32(0).u32(0);
  w.u8(0x54).u8(0x45).u8(0x53).u8(0x54);
  w.u16(0x0040).u16(0x20).u16(0x7e);
  w.i16(800).i16(-200).i16(0).u16(1000).u16(250);
  w.u32(1).u32(0);
  w.i16(500).i16(700).u16(0).u16(0x20).u16(1);
  return w.finish();
}

function synthFont(o: SynthOptions): Uint8Array {
  const glyphs: Uint8Array[] = [new Uint8Array(0)];
  const cmap = new Map<number, number>();
  o.codes.forEach((c, i) => {
    glyphs.push(square(100 + i));
    cmap.set(c, i + 1);
  });
  if (o.composite !== undefined) {
    cmap.set(o.composite, glyphs.length);
    glyphs.push(compositeOf(1, 2));
  }
  const glyf = new ByteWriter();
  const loca = new ByteWriter();
  for (const g of glyphs) {
    loca.u16(glyf.length / 2);
    glyf.bytes(g).pad(2);
  }
  loca.u16(glyf.length / 2);
  const hmtx = new ByteWriter();
  glyphs.forEach((_, i) => hmtx.u16(500 + i).i16(0));
  const head = new ByteWriter();
  head.u32(0x00010000).u32(0x00010000).u32(0).u32(0x5f0f3cf5).u16(0x000b).u16(o.upem ?? 1000);
  head.u32(0).u32(0).u32(0).u32(0); // created, modified
  head.i16(0).i16(-200).i16(1000).i16(800).u16(0).u16(8).i16(2).i16(0).i16(0);
  const hhea = new ByteWriter();
  hhea.u32(0x00010000).i16(800).i16(-200).i16(0).u16(600).i16(0).i16(0).i16(400).i16(1).i16(0).i16(0);
  hhea.i16(0).i16(0).i16(0).i16(0).i16(0).u16(glyphs.length);
  const maxp = new ByteWriter();
  maxp.u32(0x00010000).u16(glyphs.length).u16(4).u16(1).u16(8).u16(2).u16(2).u16(0).u16(1).u16(0).u16(0);
  maxp.u16(2).u16(0).u16(2).u16(1);
  const post = new ByteWriter();
  post.u32(0x00030000).u32(0).i16(-100).i16(50).u32(0).u32(0).u32(0).u32(0).u32(0);
  const tables = new Map<string, Uint8Array>([
    ['head', head.finish()],
    ['hhea', hhea.finish()],
    ['maxp', maxp.finish()],
    ['OS/2', os2Table(o.fsType ?? 0)],
    ['name', nameTable(o.family ?? 'Synth')],
    ['cmap', writeCmap(cmap)],
    ['hmtx', hmtx.finish()],
    ['loca', loca.finish()],
    ['glyf', glyf.finish()],
    ['post', post.finish()],
  ]);
  if (o.fpgm) tables.set('fpgm', new Uint8Array(o.fpgm));
  for (const [k, v] of Object.entries(o.extra ?? {})) tables.set(k, v);
  return writeSfnt({ flavor: o.flavor ?? SFNT_TRUETYPE, tables });
}

function checksumsValid(bytes: Uint8Array): boolean {
  const font = readSfnt(bytes)!;
  const v = view(bytes);
  const count = v.getUint16(4);
  for (let i = 0; i < count; i++) {
    const r = 12 + i * 16;
    const tag = String.fromCharCode(...bytes.subarray(r, r + 4));
    let data = font.tables.get(tag)!;
    if (tag === 'head') {
      data = data.slice();
      view(data).setUint32(8, 0);
    }
    if (tableChecksum(data) !== v.getUint32(r + 4)) return false;
  }
  return tableChecksum(bytes) === 0xb1b0afba;
}

function glyphsOf(font: Sfnt): Uint8Array[] {
  const t = font.tables;
  const n = view(t.get('maxp')!).getUint16(4);
  return readGlyphs(t.get('loca')!, t.get('glyf')!, n, view(t.get('head')!).getInt16(50) === 1);
}

const face = (family: string, weight: number, style: 'normal' | 'italic', files: Uint8Array[]): SourceFace => ({ family, weight, style, files });

const LATIN = [0x41, 0x42, 0x43, 0x61];
const CYRILLIC = [0x410, 0x411, 0x1f600];

describe('sfnt container', () => {
  it('writes table checksums and checkSumAdjustment', () => {
    const bytes = synthFont({ codes: LATIN });
    expect(checksumsValid(bytes)).toBe(true);
    const again = writeSfnt(readSfnt(bytes)!);
    expect(again).toEqual(bytes);
  });

  it('reads back format 4 and format 12 maps', () => {
    const map = new Map([
      [0x41, 3],
      [0x42, 4],
      [0x44, 9],
      [0x45, 2],
      [0x1f600, 7],
    ]);
    expect(readCmap(writeCmap(map))).toEqual(map);
  });
});

describe('mergeSlices', () => {
  const latin = readSfnt(synthFont({ codes: LATIN, composite: 0xc5, fpgm: [0xb0, 1] }))!;
  const cyr = readSfnt(synthFont({ codes: CYRILLIC, composite: 0x419, fpgm: [0xb0, 2] }))!;

  it('passes a single slice through', () => {
    expect(mergeSlices([latin])).toBe(latin);
  });

  it('maps every code point of every slice, base slice first', () => {
    const merged = mergeSlices([cyr, latin]) as Sfnt;
    const bytes = writeSfnt(merged);
    expect(checksumsValid(bytes)).toBe(true);
    const back = readSfnt(bytes)!;
    const cmap = readCmap(back.tables.get('cmap'));
    for (const c of [...LATIN, 0xc5, ...CYRILLIC, 0x419]) expect(cmap.has(c)).toBe(true);
    // The Latin slice keeps its numbering (its layout tables stay valid).
    expect(cmap.get(0x41)).toBe(1);
    const glyphs = glyphsOf(back);
    expect(glyphs.length).toBe(6 + 4); // notdef + 4 + composite, then 3 + composite
    expect(view(back.tables.get('maxp')!).getUint16(4)).toBe(glyphs.length);
    expect(view(back.tables.get('hhea')!).getUint16(34)).toBe(glyphs.length);
    expect(view(back.tables.get('head')!).getInt16(50)).toBe(1);
    expect(view(back.tables.get('post')!).getUint32(0)).toBe(0x00030000);
    // The Cyrillic composite points at the Cyrillic squares, renumbered.
    const comp = glyphs[cmap.get(0x419)!]!;
    expect(componentGlyphs(comp)).toEqual([cmap.get(0x410), cmap.get(0x411)]);
    expect(componentGlyphs(glyphs[cmap.get(0xc5)!]!)).toEqual([1, 2]);
    // Different fpgm: hinting dropped, glyph programs stripped.
    expect(back.tables.has('fpgm')).toBe(false);
    expect(view(glyphs[1]!).getUint16(12)).toBe(0);
    // Outline data follows straight after the emptied program.
    expect(glyphs[1]!.subarray(14, 34)).toEqual(square(100).subarray(16));
  });

  it('keeps hinting when every slice carries the same programs', () => {
    const a = readSfnt(synthFont({ codes: LATIN, fpgm: [0xb0, 1] }))!;
    const b = readSfnt(synthFont({ codes: CYRILLIC, fpgm: [0xb0, 1] }))!;
    const merged = mergeSlices([a, b]) as Sfnt;
    expect(merged.tables.has('fpgm')).toBe(true);
    expect(glyphsOf(merged)[1]!.subarray(0, 36)).toEqual(square(100));
  });

  it('refuses slices of different em sizes', () => {
    const a = readSfnt(synthFont({ codes: LATIN }))!;
    const b = readSfnt(synthFont({ codes: CYRILLIC, upem: 2048 }))!;
    expect(mergeSlices([a, b])).toMatch(/unitsPerEm/);
  });
});

describe('planWordFonts', () => {
  it('maps weights and styles to Word families and slots', () => {
    expect(wordSlotFor('Lora', 400, 'normal')).toEqual({ family: 'Lora', slot: 'regular' });
    expect(wordSlotFor('Lora', 400, 'italic')).toEqual({ family: 'Lora', slot: 'italic' });
    expect(wordSlotFor('Lora', 700, 'normal')).toEqual({ family: 'Lora', slot: 'bold' });
    expect(wordSlotFor('Lora', 700, 'italic')).toEqual({ family: 'Lora', slot: 'boldItalic' });
    expect(wordSlotFor('Lora', 300, 'normal')).toEqual({ family: 'Lora Light', slot: 'regular' });
    expect(wordSlotFor('Lora', 600, 'italic')).toEqual({ family: 'Lora SemiBold', slot: 'italic' });
  });

  it('embeds merged faces named after their Word family', async () => {
    const files = [synthFont({ codes: LATIN }), synthFont({ codes: CYRILLIC })];
    const faces = [300, 400, 600, 700].flatMap((w) => [face('Synth', w, 'normal', files), face('Synth', w, 'italic', files)]);
    const plan = await planWordFonts(faces);
    expect(plan.warnings).toEqual([]);
    expect(plan.faces.length).toBe(8);
    const slots = plan.faces.map((f) => `${f.family}:${f.slot}`).sort();
    expect(slots).toEqual(
      [
        'Synth PTX:bold',
        'Synth PTX:boldItalic',
        'Synth PTX:italic',
        'Synth PTX:regular',
        'Synth Light PTX:italic',
        'Synth Light PTX:regular',
        'Synth SemiBold PTX:italic',
        'Synth SemiBold PTX:regular',
      ].sort(),
    );
    expect(plan.altNames.get('Synth SemiBold PTX')).toBe('Synth SemiBold');
    const semiItalic = plan.faces.find((f) => f.family === 'Synth SemiBold PTX' && f.slot === 'italic')!;
    expect(checksumsValid(semiItalic.bytes)).toBe(true);
    const font = readSfnt(semiItalic.bytes)!;
    const names = readNames(font.tables.get('name'));
    expect(names.get(1)).toBe('Synth SemiBold PTX');
    expect(names.get(2)).toBe('Italic');
    expect(names.get(4)).toBe('Synth SemiBold PTX Italic');
    expect(names.get(6)).toBe('SynthSemiBoldPTX-Italic');
    expect(names.get(16)).toBe('Synth SemiBold PTX');
    expect(names.get(0)).toBe('Copyright test');
    expect(view(font.tables.get('OS/2')!).getUint16(62) & 0x61).toBe(0x01);
    expect(view(font.tables.get('head')!).getUint16(44) & 3).toBe(2);
    const cmap = readCmap(font.tables.get('cmap'));
    for (const c of [...LATIN, ...CYRILLIC]) expect(cmap.has(c)).toBe(true);
    expect(semiItalic.panose).toBe('02020503050405020204');
    expect(semiItalic.familyClass).toBe('roman');
    expect(semiItalic.pitch).toBe('variable');
    expect(semiItalic.sig).toEqual({ usb0: '80000001', usb1: '00000002', usb2: '00000000', usb3: '00000000', csb0: '00000001', csb1: '00000000' });

    expect(wordFontFor(plan, 'italic 700 16px "Synth"')).toEqual({ family: 'Synth PTX', bold: true, italic: true });
    expect(wordFontFor(plan, '600 12px Synth, serif')).toEqual({ family: 'Synth SemiBold PTX', bold: false, italic: false });
    expect(wordFontFor(plan, 'italic 300 12px "Synth"')).toEqual({ family: 'Synth Light PTX', bold: false, italic: true });
    expect(wordFontFor(plan, '12px Synth')).toEqual({ family: 'Synth PTX', bold: false, italic: false });
    // 650 is not planned: the nearest weight (700) answers.
    expect(wordFontFor(plan, '650 12px Synth')).toEqual({ family: 'Synth PTX', bold: true, italic: false });
    expect(wordFontFor(plan, '700 12px "Other Face"')).toEqual({ family: 'Other Face', bold: true, italic: false });
  });

  it('keeps CSS names with an empty suffix', async () => {
    const plan = await planWordFonts([face('Synth', 400, 'normal', [synthFont({ codes: LATIN })])], { familySuffix: '' });
    expect(plan.faces[0]!.family).toBe('Synth');
    expect(plan.altNames.size).toBe(0);
  });

  it('honours fsType and warns on CFF and variable faces', async () => {
    const plan = await planWordFonts([
      face('Locked', 400, 'normal', [synthFont({ codes: LATIN, fsType: 0x0002 })]),
      face('Preview', 400, 'normal', [synthFont({ codes: LATIN, fsType: 0x0004 })]),
      face('Cff', 400, 'normal', [synthFont({ codes: LATIN, flavor: SFNT_OTTO })]),
      face('Var', 400, 'normal', [synthFont({ codes: LATIN, extra: { fvar: new Uint8Array(16) } })]),
    ]);
    expect(plan.faces.map((f) => f.family)).toEqual(['Preview PTX']);
    expect(plan.warnings.map((w) => `${w.family}:${w.reason}`).sort()).toEqual(
      ['Cff:cff', 'Locked:restricted', 'Preview:preview-print', 'Var:variable'].sort(),
    );
    // Faces not embedded keep their CSS family.
    expect(plan.map.get(faceKey('Locked', 400, 'normal'))).toEqual({ family: 'Locked', bold: false, italic: false });
  });

  it('embeds only the faces the font strings ask for, and only used slices', async () => {
    const files = [synthFont({ codes: LATIN }), synthFont({ codes: CYRILLIC })];
    const plan = await planWordFonts([face('Synth', 400, 'normal', files), face('Synth', 700, 'normal', files)], {
      fontStrings: ['16px "Synth"'],
      usedText: new Map([['Synth', new Set([0x41])]]),
    });
    expect(plan.faces.map((f) => f.slot)).toEqual(['regular']);
    const cmap = readCmap(readSfnt(plan.faces[0]!.bytes)!.tables.get('cmap'));
    expect(cmap.has(0x41)).toBe(true);
    expect(cmap.has(0x410)).toBe(false);
  });

  it('unwraps WOFF and uses an injected WOFF2 decompressor', async () => {
    const ttf = synthFont({ codes: LATIN });
    const woff1 = toWoff1(ttf);
    const woff2 = new Uint8Array([0x77, 0x4f, 0x46, 0x32, 0, 0, 0, 0]);
    const without = await planWordFonts([face('W2', 400, 'normal', [woff2])]);
    expect(without.warnings[0]?.reason).toBe('missing');
    const plan = await planWordFonts([face('W1', 400, 'normal', [woff1]), face('W2', 400, 'normal', [woff2])], {
      decompressWoff2: async () => ttf,
    });
    expect(plan.warnings).toEqual([]);
    expect(plan.faces.length).toBe(2);
    for (const f of plan.faces) expect(readCmap(readSfnt(f.bytes)!.tables.get('cmap')).get(0x41)).toBe(1);
  });
});

describe('review fixes (#1393)', () => {
  it('round-trips a format 4 map with glyph arrays and cuts it at 64 KB', () => {
    const map = new Map<number, number>([
      [0x41, 7],
      [0x42, 3],
      [0x43, 9],
      [0x100, 20],
      [0x101, 21],
    ]);
    // Symbol cmaps carry the format 4 subtable alone.
    expect([...readCmap(writeCmap(map, true))].sort((a, b) => a[0] - b[0])).toEqual([...map]);
    // 12000 isolated codes need more segments than 64 KB holds: format 4
    // keeps what fits and stays valid, format 12 carries all of them.
    const many = new Map<number, number>();
    for (let i = 0; i < 12000; i++) many.set(0x20 + i * 2, 1 + ((i * 7) % 5000));
    const table = writeCmap(many);
    const v = view(table);
    const f4At = v.getUint32(8);
    expect(v.getUint16(f4At + 2)).toBeLessThanOrEqual(0xffff);
    const f4Only = new ByteWriter().u16(0).u16(1).u16(3).u16(1).u32(12).bytes(table.subarray(f4At, f4At + v.getUint16(f4At + 2))).finish();
    const partial = readCmap(f4Only);
    expect(partial.size).toBeGreaterThan(7000);
    for (const [c, g] of partial) expect(many.get(c)).toBe(g);
    expect(readCmap(table)).toEqual(many);
  });

  it('keeps Word family names within GDI\'s 31 characters, apart and stable', async () => {
    const long = 'Noto Serif Display ExtraCondensed';
    const a = fitWordFamily(`${long} SemiBold`, ' PTX');
    const b = fitWordFamily(`${long} Medium`, ' PTX');
    expect(a.length).toBeLessThanOrEqual(MAX_WORD_FAMILY);
    expect(a).not.toBe(b);
    expect(a.endsWith(' PTX')).toBe(true);
    expect(fitWordFamily(`${long} SemiBold`, ' PTX')).toBe(a);
    expect(fitWordFamily('Lora', ' PTX')).toBe('Lora PTX');
    const files = [synthFont({ codes: LATIN })];
    const plan = await planWordFonts([face(long, 400, 'normal', files), face(long, 700, 'normal', files)]);
    expect(new Set(plan.faces.map((f) => f.family)).size).toBe(1);
    const family = plan.faces[0]!.family;
    expect(family.length).toBeLessThanOrEqual(MAX_WORD_FAMILY);
    expect(readNames(readSfnt(plan.faces[1]!.bytes)!.tables.get('name')).get(1)).toBe(family);
    expect(plan.altNames.get(family)).toBe(long);
    expect(wordFontFor(plan, `700 12px "${long}"`)).toEqual({ family, bold: true, italic: false });
  });

  it('keeps a derived weight family apart from a CSS family of the same name', async () => {
    const plan = await planWordFonts([
      face('Lora SemiBold', 400, 'normal', [synthFont({ codes: LATIN, family: 'Lora SemiBold' })]),
      face('Lora', 600, 'normal', [synthFont({ codes: [0x41, 0x5a] })]),
    ]);
    expect(plan.faces.map((f) => f.family).sort()).toEqual(['Lora 600 PTX', 'Lora SemiBold PTX']);
    expect(plan.map.get(faceKey('Lora', 600, 'normal'))!.family).toBe('Lora 600 PTX');
  });

  it('warns on a malformed face instead of failing the whole plan', async () => {
    const good = synthFont({ codes: LATIN });
    const font = readSfnt(synthFont({ codes: CYRILLIC }))!;
    // A format 4 header claiming 2048 segments in a 26-byte subtable.
    const broken = new ByteWriter().u16(0).u16(1).u16(3).u16(1).u32(12).u16(4).u16(14).u16(0).u16(4096).u16(0).u16(0).u16(0).finish();
    font.tables.set('cmap', broken);
    const bad = writeSfnt(font);
    const truncatedWoff = toWoff1(good).subarray(0, 60);
    const plan = await planWordFonts([
      face('Bad', 400, 'normal', [good, bad]),
      face('Cut', 400, 'normal', [truncatedWoff]),
      face('Good', 400, 'normal', [good]),
    ]);
    expect(plan.faces.map((f) => f.family)).toEqual(['Good PTX']);
    expect(plan.warnings.map((w) => `${w.family}:${w.reason}`)).toEqual(['Bad:merge-failed', 'Cut:merge-failed']);
  });

  it('gives a family in another script a distinct ASCII PostScript name', async () => {
    const plan = await planWordFonts([
      face('思源宋体', 400, 'normal', [synthFont({ codes: LATIN })]),
      face('思源黑体', 700, 'normal', [synthFont({ codes: LATIN })]),
    ]);
    const ps = plan.faces.map((f) => readNames(readSfnt(f.bytes)!.tables.get('name')).get(6)!);
    expect(ps[0]).toMatch(/^PTX[0-9A-F]{8}-Regular$/);
    expect(ps[1]).toMatch(/^PTX[0-9A-F]{8}-Bold$/);
    expect(ps[0]!.slice(0, 11)).not.toBe(ps[1]!.slice(0, 11));
    // Latin families keep their plain name.
    const latin = await planWordFonts([face('EB Garamond', 400, 'normal', [synthFont({ codes: LATIN })])]);
    expect(readNames(readSfnt(latin.faces[0]!.bytes)!.tables.get('name')).get(6)).toBe('EBGaramondPTX-Regular');
  });

  it("writes Apple 'true' faces with the Windows TrueType tag", async () => {
    const plan = await planWordFonts([face('Apple', 400, 'normal', [synthFont({ codes: LATIN, flavor: SFNT_TRUE })])]);
    expect(readSfnt(plan.faces[0]!.bytes)!.flavor).toBe(SFNT_TRUETYPE);
  });

  it('reads the fsType bits beyond restricted', async () => {
    const files = (fsType: number): Uint8Array[] => [synthFont({ codes: LATIN, fsType }), synthFont({ codes: CYRILLIC, fsType })];
    const plan = await planWordFonts(
      [
        face('Bitmap', 400, 'normal', files(0x0200)),
        face('Legacy', 400, 'normal', files(0x0006)),
        face('Editable', 400, 'normal', files(0x000c)),
        face('Whole', 400, 'normal', files(0x0100)),
      ],
      { usedText: new Map([['Whole', new Set([0x41])], ['Editable', new Set([0x41])]]) },
    );
    expect(plan.warnings.map((w) => `${w.family}:${w.reason}`)).toEqual(['Bitmap:restricted', 'Legacy:preview-print']);
    const cmapOf = (family: string): Map<number, number> =>
      readCmap(readSfnt(plan.faces.find((f) => f.family === family)!.bytes)!.tables.get('cmap'));
    // No-subsetting faces keep every slice; others drop the unused ones.
    expect(cmapOf('Whole PTX').has(0x410)).toBe(true);
    expect(cmapOf('Editable PTX').has(0x410)).toBe(false);
  });
});

/** A WOFF 1 wrapper with every table zlib-compressed. */
function toWoff1(ttf: Uint8Array): Uint8Array {
  const font = readSfnt(ttf)!;
  const tags = [...font.tables.keys()].sort();
  const parts = tags.map((t) => ({ tag: t, orig: font.tables.get(t)!, comp: zlibSync(font.tables.get(t)!) }));
  const w = new ByteWriter();
  w.u32(0x774f4646).u32(font.flavor).u32(0).u16(tags.length).u16(0).u32(ttf.byteLength).u16(1).u16(0);
  w.u32(0).u32(0).u32(0).u32(0).u32(0);
  let offset = 44 + tags.length * 20;
  for (const p of parts) {
    for (const c of p.tag) w.u8(c.charCodeAt(0));
    w.u32(offset).u32(p.comp.byteLength).u32(p.orig.byteLength).u32(tableChecksum(p.orig));
    offset += (p.comp.byteLength + 3) & ~3;
  }
  for (const p of parts) w.bytes(p.comp).pad(4);
  const out = w.finish();
  view(out).setUint32(8, out.byteLength);
  return out;
}

const garamondPath = fileURLToPath(new URL('../../../../postext-cli/fonts/EBGaramond-400.ttf', import.meta.url));

describe.runIf(existsSync(garamondPath))('a real face (EB Garamond)', () => {
  const bytes = new Uint8Array(readFileSync(garamondPath));

  it('passes one file through, renamed', async () => {
    const plan = await planWordFonts([face('EB Garamond', 400, 'normal', [bytes])]);
    const out = readSfnt(plan.faces[0]!.bytes)!;
    expect(checksumsValid(plan.faces[0]!.bytes)).toBe(true);
    expect(readNames(out.tables.get('name')).get(1)).toBe('EB Garamond PTX');
    const src = readSfnt(bytes)!;
    for (const t of ['glyf', 'loca', 'GSUB', 'GPOS', 'cmap']) expect(out.tables.get(t)).toEqual(src.tables.get(t));
  });

  it('merges two copies with composites renumbered', () => {
    const src = readSfnt(bytes)!;
    const merged = mergeSlices([src, src]) as Sfnt;
    const back = readSfnt(writeSfnt(merged))!;
    const a = glyphsOf(src);
    const all = glyphsOf(back);
    expect(all.length).toBe(a.length * 2 - 1);
    const first = a.length;
    const ci = a.findIndex((g) => componentGlyphs(g).length > 0);
    const shifted = componentGlyphs(all[first + ci - 1]!);
    expect(shifted).toEqual(componentGlyphs(a[ci]!).map((g) => (g === 0 ? 0 : first + g - 1)));
    expect(readCmap(back.tables.get('cmap'))).toEqual(readCmap(src.tables.get('cmap')));
  });
});
