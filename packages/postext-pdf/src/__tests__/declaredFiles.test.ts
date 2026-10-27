import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { FontCache, declarationOf, declaredFontFile, inDeclarationOrder, withBareFiles, type PdfFontAnswer, type PdfFontFile, type PdfFontRequest } from '../fontCache.js';
import { FaceFiles, fileRuns, registerFaceFiles, type FileDeclaration } from '../faceFiles.js';
import { parseFontString } from '../fontString.js';
import { parseUnicodeRange, rangesHold } from '../unicodeRange.js';
import { withDocumentLanguage } from '../shapingLanguage.js';
import { drawTextPx, textAdvancePx, type PageCtx } from '../pdf-backend/primitives.js';
import { inlineSvgFontsForRaster } from '../pdf-backend/blocks/renderResourceBlock.js';
import { paintedGlyphs, type PaintedGlyph } from './glyphPositions.js';

// #770: a browser sets a character two files of a family hold in the file
// declared last among those whose `unicode-range` holds it, and a provider
// that hands each file with its range and its place in the declaration
// (`PdfFontFile`: the bytes, carrying both) gets the PDF set the same way,
// in a document shaped in its own language; one that keeps the host's
// language reads the files in the order given and prints as before. The
// rules and the widths below are Chrome 154's (`measureText` at 1000 px on
// a canvas, in a page and in a worker; thousandths of the em).
//
// The face of the tests is Noto Serif JP 400 as Fontsource serves it, cut
// to `Shift_JIS` and a space: `latin` holds every character and kerns `t_`
// and `_J`, slice 118 repeats the letters, slice 113 the `_`. A pen adds
// `latin` first and the numbered slices after it, so the page sets the
// letters from 118 and the `_` from 113, with nothing kerned across:
// 4252, where `latin` alone gives 4318.

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/fontsource/${name}`, import.meta.url)));
const LATIN = fixture('noto-serif-jp-latin.ttf');
const S118 = fixture('noto-serif-jp-118.ttf');
const S113 = fixture('noto-serif-jp-113.ttf');
/** The ranges `@fontsource/noto-serif-jp@5/400.css` declares the files with. */
const RANGE = {
  latin: 'U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD',
  118: 'U+21-22,U+27-2a,U+2c-3b,U+3f,U+41-4d,U+4f-5d,U+61-7b,U+7d,U+ab,U+ae,U+b2-b3,U+b7,U+bb,U+c9,U+cd,U+d6,U+d8,U+dc,U+e0-e5,U+e7-ed,U+ef,U+f1-f4,U+f6,U+f8,U+fa,U+fc-fd,U+103,U+14d,U+1b0,U+300-301,U+1ebf,U+1ec7,U+2013-2014,U+201c-201d,U+2039-203a,U+203c,U+2048-2049,U+2113,U+2122,U+65e5,U+6708,U+70b9',
  113: 'U+26,U+5f,U+2026,U+203b,U+4e09,U+4eac,U+4ed5,U+4fa1,U+5143,U+5199,U+5207,U+539f,U+53e3,U+53f7,U+5411,U+5473,U+5546,U+55b6,U+5929,U+597d,U+5bb9,U+5c11,U+5c4b,U+5ddd,U+5f97,U+5fc5,U+6295,U+6301,U+6307,U+671b,U+76f8,U+78ba,U+795e,U+7d30,U+7d39,U+7d9a,U+89e3,U+8a00,U+8a73,U+8a8d,U+8a9e,U+8aad,U+8abf,U+8cea,U+8eca,U+8ffd,U+904b,U+9650,U+ff11-ff12',
};
/** The three files as a pen declares them: `latin`, then the slices from
 *  the last of the sheet to the first (118 before 113). */
const DECLARED: PdfFontFile[] = [
  declaredFontFile(LATIN, { unicodeRange: RANGE.latin, order: 0 }),
  declaredFontFile(S118, { unicodeRange: RANGE[118], order: 6 }),
  declaredFontFile(S113, { unicodeRange: RANGE[113], order: 11 }),
];
/** The same files with nothing said of them. */
const BARE = [LATIN, S118, S113];

const FONT = '400 16px "Noto Serif JP"';

/** The face a provider answering `answer` gives the renderers. */
async function faceOf(answer: PdfFontAnswer): Promise<PDFFont> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const cache = new FontCache(doc, async () => answer);
  await cache.preloadFontStrings([FONT]);
  return cache.get(FONT)!;
}

const inDocument = <T,>(tag: string, fn: () => T): T => withDocumentLanguage(tag, tag, fn);
const inHost = <T,>(tag: string, fn: () => T): T => withDocumentLanguage(undefined, tag, fn);
const advance = (font: PDFFont, text: string): number => textAdvancePx(font, text, 1000).advance;
const near = (got: number, chrome: number, what: string): void => expect(Math.abs(got - chrome), `${what}: ${got.toFixed(1)}, Chrome ${chrome}`).toBeLessThan(0.75);

describe('a file that says how the page declared it (#770)', () => {
  it('is its bytes, carrying a range and a place, and the bytes given stay as they were', () => {
    const file = declaredFontFile(LATIN, { unicodeRange: 'U+0-FF', order: 3 });
    expect(file).toBeInstanceOf(Uint8Array);
    expect(file.buffer).toBe(LATIN.buffer);
    expect(file.length).toBe(LATIN.length);
    expect(declarationOf(file)).toEqual({ unicodeRange: 'U+0-FF', order: 3 });
    expect(declarationOf(LATIN)).toBeUndefined();
    // Marked in place, as a pen does with bytes of its own.
    expect(declarationOf(Object.assign(new Uint8Array(2), { unicodeRange: 'U+41', order: 0 }))).toEqual({ unicodeRange: 'U+41', order: 0 });
    // What is no range and no number is not read.
    expect(declarationOf(Object.assign(new Uint8Array(2), { unicodeRange: 7, order: 'last' }) as unknown as PdfFontFile)).toBeUndefined();
  });

  it('says nothing to a render with no document shaped in its own language', async () => {
    const bare = withBareFiles(async () => DECLARED);
    const files = (await bare('Noto Serif JP', 400, 'normal')) as PdfFontFile[];
    expect(files.map((file) => declarationOf(file))).toEqual([undefined, undefined, undefined]);
    expect(files.map((file) => file.length)).toEqual(DECLARED.map((file) => file.length));
    // One file stays one file, and a plain one the same object.
    expect(await withBareFiles(async () => LATIN)('Noto Serif JP', 400, 'normal')).toBe(LATIN);
    expect(Array.isArray(await withBareFiles(async () => DECLARED[0]!)('Noto Serif JP', 400, 'normal'))).toBe(false);
  });
});

describe('unicode-range', () => {
  it('reads intervals, single code points and wildcards, merged and in order', () => {
    expect(parseUnicodeRange('U+0000-00FF, u+131,U+4E??')).toEqual([[0, 0xff], [0x131, 0x131], [0x4e00, 0x4eff]]);
    expect(parseUnicodeRange('U+41-5A,U+30-39,U+3A-40')).toEqual([[0x30, 0x5a]]);
    expect(parseUnicodeRange('U+??')).toEqual([[0, 0xff]]);
    expect(parseUnicodeRange('U+1F6??')).toEqual([[0x1f600, 0x1f6ff]]);
  });

  it('gives nothing for a value a browser drops: the file then answers for every character', () => {
    for (const value of ['', 'latin', 'U+', 'U+5A-41', 'U+110000', 'U+0-FF,x', 'U+4?5', 'U+1234567']) expect(parseUnicodeRange(value), value).toBeUndefined();
  });

  it('says whether a code point is held', () => {
    const ranges = parseUnicodeRange(RANGE[118])!;
    expect([...'Shift_JIS '].map((ch) => rangesHold(ranges, ch.codePointAt(0)!))).toEqual([true, true, true, true, true, false, true, true, true, false]);
  });
});

/** A file that has glyphs for the characters of `chars`: enough for the
 *  cut of a text, which looks at nothing else of a font. */
const stub = (chars: string): PDFFont => {
  const cps = new Set([...chars].map((ch) => ch.codePointAt(0)!));
  return { embedder: { font: { hasGlyphForCodePoint: (cp: number) => cps.has(cp) } } } as unknown as PDFFont;
};

/** The runs of `text` in a face of `files`, each `[name, glyphs, range?,
 *  order?]`, the first being the font the renderers are handed; as
 *  `name:text` joined by a bar. In a document shaped in its own language,
 *  or (`host`) in one that keeps the host's. */
function cut(text: string, files: Array<[string, string, string?, number?]>, rtl = false, host = false): string {
  const fonts = files.map(([, chars]) => stub(chars));
  const declarations = new Map<PDFFont, FileDeclaration>();
  files.forEach(([, , unicodeRange, order], i) => {
    if (unicodeRange !== undefined || order !== undefined) declarations.set(fonts[i]!, { ...(unicodeRange !== undefined ? { unicodeRange } : {}), ...(order !== undefined ? { order } : {}) });
  });
  registerFaceFiles(fonts[0]!, fonts.slice(1), declarations);
  const runs = (host ? inHost : inDocument)('en', () => fileRuns(fonts[0]!, text, rtl));
  return runs.map((run) => `${files[fonts.indexOf(run.font)]![0]}:${run.text}`).join('|');
}

describe('the file a character is set in, for a face given with its ranges (#770)', () => {
  const ALL = 'ABab_ ()';

  it('is the one declared last among those whose range holds it', () => {
    // Chrome: `a` of two files that both claim it is the later one's, 557
    // for 541, whichever was made or loaded first.
    expect(cut('Aa', [['first', ALL, 'U+0-FF', 0], ['last', ALL, 'U+0-FF', 1]])).toBe('last:Aa');
    expect(cut('Aa', [['last', ALL, 'U+0-FF', 1], ['first', ALL, 'U+0-FF', 0]])).toBe('last:Aa');
    // With no number, the first file given is the one declared last, as
    // a list of bare files is read.
    expect(cut('Aa', [['given first', ALL, 'U+0-FF'], ['given second', ALL, 'U+0-FF']])).toBe('given first:Aa');
  });

  it('is never one whose range leaves the character out, though the file has a glyph', () => {
    // Chrome: `Aa` with the capitals alone claimed by the last file is `A`
    // from it and `a` from the other, 1269; 1253 and 1274 in one file.
    expect(cut('Aa', [['all', ALL, undefined, 0], ['capitals', ALL, 'U+41-5A', 1]])).toBe('capitals:A|all:a');
    // Nothing stays in a file because the character before it was set there.
    expect(cut('AaBb', [['all', ALL, undefined, 0], ['capitals', ALL, 'U+41-5A', 1]])).toBe('capitals:A|all:a|capitals:B|all:b');
  });

  it('passes over a file whose range claims a character it has no glyph for', () => {
    // Chrome: `S` claimed by a file that has none is the next one's down, 567.
    expect(cut('A_', [['first', ALL, 'U+0-FF', 0], ['second', ALL, 'U+0-FF', 1], ['claims all', '_', 'U+0-FF', 2]])).toBe('second:A|claims all:_');
  });

  it('takes a file with no range for every character', () => {
    expect(cut('Aa_', [['ranged', ALL, 'U+61', 0], ['no range', ALL, undefined, 1]])).toBe('no range:Aa_');
    expect(cut('Aa_', [['no range', ALL, undefined, 0], ['ranged', ALL, 'U+61', 1]])).toBe('no range:A|ranged:a|no range:_');
  });

  it('sets a space in the file whose range holds it, though every file has one', () => {
    // An Arabic family: the `arabic` file has a space and brackets, and its
    // range claims neither.
    const arabic: [string, string, string, number] = ['arabic', '\u0623\u0644\u0641\u0644\u064A\u0629 (', 'U+0600-06FF,U+200C-200E', 3];
    const latin: [string, string, string, number] = ['latin', 'ab ()', 'U+0-FF,U+2000-206F', 0];
    expect(cut('\u0623\u0644\u0641 \u0644\u064A\u0644\u0629', [arabic, latin])).toBe('arabic:\u0623\u0644\u0641|latin: |arabic:\u0644\u064A\u0644\u0629');
    // The bracket is the `latin` file's whatever follows it, and in a
    // right-to-left run too.
    expect(cut('(\u0623\u0644\u0641)', [arabic, latin], true)).toBe('latin:(|arabic:\u0623\u0644\u0641|latin:)');
    // Bare, the first file with a glyph keeps the line in one run.
    expect(cut('\u0623\u0644\u0641 \u0644\u064A\u0644\u0629', [['arabic', arabic[1]], ['latin', latin[1]]])).toBe('arabic:\u0623\u0644\u0641 \u0644\u064A\u0644\u0629');
  });

  it('sets a letter and the marks on it in one file, the last declared that answers for them all', () => {
    // Chrome: `a` + U+0308 where the last file answers for `a` alone is the
    // first file's whole, 541 for 557; `a` alone is the last file's.
    const first: [string, string, string | undefined, number] = ['first', 'ab\u0308', undefined, 0];
    expect(cut('a\u0308a', [first, ['last', 'ab\u0308', 'U+61', 1]])).toBe('first:a\u0308|last:a');
    expect(cut('a\u0308a', [first, ['last', 'ab\u0308', 'U+61,U+308', 1]])).toBe('last:a\u0308a');
    // No file sets them all: the mark beside its letter when that file
    // has a glyph for it, else by itself.
    expect(cut('a\u0308', [['marks', '\u0308', 'U+308', 0], ['letters', 'a\u0308', 'U+61', 1]])).toBe('letters:a\u0308');
    expect(cut('a\u0308', [['marks', '\u0308', 'U+308', 0], ['letters', 'a', 'U+61', 1]])).toBe('letters:a|marks:\u0308');
  });

  it('keeps a joiner with the letter it joins and an invisible character in its run', () => {
    const arabic: [string, string, string, number] = ['arabic', '\u0628\u0646', 'U+0600-06FF', 1];
    const latin: [string, string, string, number] = ['latin', 'ab\u200C\u00AD', 'U+0-FF,U+2000-206F', 0];
    expect(cut('\u0628\u200C\u0646', [arabic, latin])).toBe('arabic:\u0628\u200C\u0646');
    expect(cut('\u200C\u0628', [arabic, latin])).toBe('arabic:\u200C\u0628');
    expect(cut('\u0628\u00AD\u0646', [arabic, latin])).toBe('arabic:\u0628\u00AD\u0646');
  });

  it('draws a character no range holds as a face given bare does: beside the one before it, else from the first file that has it', () => {
    expect(cut('a_b', [['letters', 'ab_', 'U+61-7A', 0], ['other', '_', 'U+41', 1]])).toBe('letters:a_b');
    expect(cut('a_b', [['letters', 'ab', 'U+61-7A', 0], ['other', '_', 'U+41', 1]])).toBe('letters:a|other:_|letters:b');
    // No file has it at all: it stays in its run, and is reported when shaped.
    expect(cut('a\u2603b', [['letters', 'ab', 'U+61-7A', 0], ['other', '_', 'U+5F', 1]])).toBe('letters:a\u2603b');
  });

  it('answers a later file for a character an earlier one was drawn from', () => {
    const [latin, slice] = [stub('ab_'), stub('ab')];
    const files = new FaceFiles([latin], new Map([[latin, { unicodeRange: 'U+0-FF', order: 0 }]]));
    expect(files.ranged).toBe(true);
    expect(files.declaredFile(0x61)).toBe(latin);
    files.add(slice, { unicodeRange: 'U+61-7A', order: 5 });
    expect(files.declaredFile(0x61)).toBe(slice);
    expect(files.declaredFile(0x5f)).toBe(latin);
    // A file given again keeps what was first said of it.
    files.add(slice, { unicodeRange: 'U+5F', order: -1 });
    expect(files.declaredFile(0x61)).toBe(slice);
  });

  it('reads the files as bare ones in a document that keeps the host\u2019s language, and with no document at all', () => {
    const files: Array<[string, string, string, number]> = [['all', ALL, 'U+0-FF', 0], ['capitals', ALL, 'U+41-5A', 1]];
    expect(cut('AaBb', files)).toBe('capitals:A|all:a|capitals:B|all:b');
    expect(cut('AaBb', files, false, true)).toBe('all:AaBb');
    const fonts = files.map(([, chars]) => stub(chars));
    registerFaceFiles(fonts[0]!, fonts.slice(1), new Map(fonts.map((font, i) => [font, { unicodeRange: files[i]![2], order: files[i]![3] }])));
    expect(fileRuns(fonts[0]!, 'AaBb')).toEqual([{ font: fonts[0], text: 'AaBb' }]);
  });

  it('leaves a face given bare as it was: the first file with a glyph, and what follows in it', () => {
    const files = new FaceFiles([stub('ab'), stub('ab_')]);
    expect(files.ranged).toBe(false);
    expect(cut('a_b', [['first', 'ab'], ['second', 'ab_']])).toBe('first:a|second:_b');
    // A place alone, with no range of any file, changes nothing either.
    expect(cut('a_b', [['first', 'ab', undefined, 0], ['second', 'ab_', undefined, 9]])).toBe('first:a|second:_b');
  });
});

describe('Noto Serif JP: `Shift_JIS` from the files the page took it from (#770)', () => {
  /** Chrome's widths with the files declared `latin`, 118, 113. */
  const DECLARED_WIDTHS: [string, number][] = [['Shift_JIS', 4252], ['Shift', 2315], ['_', 563], ['JIS', 1374], ['t_', 930], ['_J', 966], ['Shift_JIS Shift_JIS', 8760]];
  /** And with `latin` declared last, or alone: `t_` and `_J` kerned. */
  const LATIN_WIDTHS: [string, number][] = [['Shift_JIS', 4318], ['Shift', 2315], ['_', 563], ['JIS', 1374], ['t_', 943], ['_J', 1019], ['Shift_JIS Shift_JIS', 8892]];

  it('sets the letters from slice 118 and the `_` from slice 113: 4252, with nothing kerned across', async () => {
    const font = await faceOf(DECLARED);
    inDocument('ja', () => DECLARED_WIDTHS.forEach(([text, chrome]) => near(advance(font, text), chrome, text)));
    inDocument('en', () => DECLARED_WIDTHS.forEach(([text, chrome]) => near(advance(font, text), chrome, text)));
  });

  it('whatever order the provider lists the files in', async () => {
    const font = await faceOf([DECLARED[2]!, DECLARED[0]!, DECLARED[1]!]);
    inDocument('ja', () => DECLARED_WIDTHS.forEach(([text, chrome]) => near(advance(font, text), chrome, text)));
  });

  it('and from `latin` when it is the one declared last, as a style sheet of Fontsource declares it', async () => {
    const font = await faceOf([declaredFontFile(LATIN, { unicodeRange: RANGE.latin, order: 20 }), DECLARED[1]!, DECLARED[2]!]);
    inDocument('ja', () => LATIN_WIDTHS.forEach(([text, chrome]) => near(advance(font, text), chrome, text)));
  });

  it('a document that keeps the host\u2019s language reads the files in the order given, as bare ones', async () => {
    const font = await faceOf(DECLARED);
    inHost('en', () => LATIN_WIDTHS.forEach(([text, chrome]) => near(advance(font, text), chrome, text)));
    inHost('ja', () => near(advance(font, 'Shift_JIS'), 4318, 'Shift_JIS'));
    // And so does text with no document in force.
    near(advance(font, 'Shift_JIS'), 4318, 'Shift_JIS');
  });

  it('bare files are read as before: the first file with a glyph, `latin` for the whole word', async () => {
    const font = await faceOf(BARE);
    inDocument('ja', () => LATIN_WIDTHS.forEach(([text, chrome]) => near(advance(font, text), chrome, text)));
    inHost('en', () => LATIN_WIDTHS.forEach(([text, chrome]) => near(advance(font, text), chrome, text)));
  });

  /** `Shift_JIS` painted at 20 pt from x = 50, in a face of `answer`. */
  async function painted(answer: PdfFontAnswer, host = false): Promise<PaintedGlyph[]> {
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const cache = new FontCache(doc, async () => answer);
    await cache.preloadFontStrings([FONT]);
    const page = doc.addPage([600, 100]);
    const ctx: PageCtx = { page, pageHeightPt: 100, scale: 1, colorSpace: 'rgb' };
    const paint = (): void => drawTextPx(ctx, 'Shift_JIS', 50, 60, cache.get(FONT)!, 20, rgb(0, 0, 0));
    if (host) inHost('ja', paint);
    else inDocument('ja', paint);
    return (await paintedGlyphs(await doc.save()))[0]!;
  }

  it('paints the word in three runs of two fonts, each glyph where the page put it', async () => {
    const glyphs = await painted(DECLARED);
    expect(glyphs.map((g) => g.text).join('')).toBe('Shift_JIS');
    const fonts = glyphs.map((g) => g.font);
    // Letters in one font, the `_` in another.
    expect(new Set(fonts).size).toBe(2);
    expect(fonts[5]).not.toBe(fonts[4]);
    expect(fonts[6]).toBe(fonts[4]);
    // The `_` an unkerned `t` after it, the `J` an unkerned `_` after: 20 pt of 2315 and 2878.
    expect(glyphs[5]!.x).toBeCloseTo(50 + 20 * 2.315, 2);
    expect(glyphs[6]!.x).toBeCloseTo(50 + 20 * 2.878, 2);
    expect(glyphs[8]!.end).toBeCloseTo(50 + 20 * 4.252, 2);
    // Bare: one font, the pairs kerned (13 and 53 thousandths more).
    const bare = await painted(BARE);
    expect(new Set(bare.map((g) => g.font)).size).toBe(1);
    expect(bare[8]!.end).toBeCloseTo(50 + 20 * 4.318, 2);
    // A document that keeps the host's language: the same glyphs, of the
    // same font, at the same places, whatever the provider says of its files.
    expect(await painted(DECLARED, true)).toEqual(await painted(BARE, true));
  });
});

describe('a face that grows, given with its ranges (#770)', () => {
  it('asks for every character it was not asked for: a file declared later may answer for it', async () => {
    const asked: number[][] = [];
    const provider = async (_family: string, _weight: number, _style: string, request?: PdfFontRequest): Promise<PdfFontFile[]> => {
      const codePoints = [...(request?.codePoints ?? [])];
      asked.push(codePoints);
      // As a pen answers: for each character, the file its page set it in.
      return [...new Set(codePoints.map((cp) => (cp === 0x5f ? DECLARED[2]! : cp === 0x20 ? DECLARED[0]! : DECLARED[1]!)))];
    };
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const cache = new FontCache(doc, provider);
    // The space first: `latin`, which has a glyph for every letter and
    // a range that holds them all.
    await cache.preloadFontStrings(new Map([[FONT, new Set([0x20])]]));
    await cache.preloadFontStrings(new Map([[FONT, new Set([...'Shift_JIS '].map((ch) => ch.codePointAt(0)!))]]));
    // Asked again for the letters and the `_`, which the slices declared
    // after `latin` answer for; not for the space.
    expect(asked).toHaveLength(2);
    expect(String.fromCodePoint(...asked[1]!.sort((a, b) => a - b))).toBe('IJS_fhit');
    const font = cache.get(FONT)!;
    inDocument('ja', () => near(advance(font, 'Shift_JIS'), 4252, 'Shift_JIS'));
    // Once every character has its file, nothing more is asked.
    await cache.preloadFontStrings(new Map([[FONT, new Set([0x53, 0x5f])]]));
    expect(asked).toHaveLength(2);
  });

  it('a bare face does not: a glyph anywhere is enough, as before', async () => {
    const asked: number[][] = [];
    const doc = await PDFDocument.create();
    doc.registerFontkit(fontkit);
    const cache = new FontCache(doc, async (_family, _weight, _style, request) => {
      asked.push([...(request?.codePoints ?? [])]);
      return [LATIN];
    });
    await cache.preloadFontStrings(new Map([[FONT, new Set([0x20])]]));
    await cache.preloadFontStrings(new Map([[FONT, new Set([0x53, 0x5f])]]));
    expect(asked).toHaveLength(1);
  });
});

// A layout measured as the page measures a face of three files declared
// `latin`, 118, 113: each character in the file that answers for it, no
// pair kerned across two files.
const FACES = { latin: fontkit.create(Buffer.from(LATIN)), 118: fontkit.create(Buffer.from(S118)), 113: fontkit.create(Buffer.from(S113)) };
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string) {
    const size = parseFontString(this.font)?.sizePx ?? 16;
    let units = 0;
    let run = '';
    let face: (typeof FACES)[keyof typeof FACES] | undefined;
    const flush = (): void => {
      if (face && run) units += face.layout(run).advanceWidth;
      run = '';
    };
    // Word by word, as the canvas shapes a string.
    for (const word of s.split(/( )/)) {
      for (const ch of word) {
        const next = ch === '_' ? FACES[113] : ch === ' ' ? FACES.latin : FACES[118];
        if (next !== face) flush();
        face = next;
        run += ch;
      }
      flush();
    }
    const width = (units / 1000) * size;
    return { width, actualBoundingBoxAscent: 0.88 * size, actualBoundingBoxDescent: 0.12 * size, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width };
  }
}

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (shapingLanguage: 'host' | 'document'): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(300), height: pt(200), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Noto Serif JP', fontSize: pt(20), lineHeight: pt(30), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, shapingLanguage },
  headings: { fontFamily: 'Noto Serif JP' },
  header: { elements: [] },
  footer: { elements: [] },
});

describe('a document printed from files given with their ranges (#770)', () => {
  /** The glyphs of `Shift_JIS Shift_JIS` laid out and printed, page by
   *  page; `asked` takes the characters the provider is asked for. */
  async function printedPage(answer: PdfFontAnswer, shapingLanguage: 'host' | 'document', asked?: number[][]): Promise<PaintedGlyph[][]> {
    const canvas = (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas;
    (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
      getContext(): StubCtx {
        return new StubCtx();
      }
    };
    try {
      const doc = buildDocument({ markdown: 'Shift_JIS Shift_JIS' }, config(shapingLanguage));
      return await paintedGlyphs(await renderToPdf(doc, {
        fontProvider: async (_family, _weight, _style, request) => {
          asked?.push([...(request?.codePoints ?? [])].sort((a, b) => a - b));
          return answer;
        },
      }));
    } finally {
      (globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = canvas;
    }
  }

  /** Where the second word ends on the page, pt from the first glyph,
   *  and the fonts the line is shown in. */
  async function printed(answer: PdfFontAnswer, shapingLanguage: 'host' | 'document'): Promise<{ width: number; fonts: number }> {
    const glyphs = (await printedPage(answer, shapingLanguage))[0]!.filter((g) => g.text !== ' ');
    expect(glyphs.map((g) => g.text).join('')).toBe('Shift_JISShift_JIS');
    return { width: glyphs[glyphs.length - 1]!.end - glyphs[0]!.x, fonts: new Set(glyphs.map((g) => g.font)).size };
  }

  it('ends each word where the layout measured it, in a document shaped in its own language', async () => {
    // 8760 thousandths of 20 pt, as the page measured the line.
    const line = await printed(DECLARED, 'document');
    expect(line.width).toBeCloseTo(20 * 8.76, 1);
    expect(line.fonts).toBe(2);
  });

  it('and 1.3 pt past it from bare files, each word kerned in `latin`', async () => {
    for (const mode of ['document', 'host'] as const) {
      const line = await printed(BARE, mode);
      // The second word starts where the layout put it and runs 66
      // thousandths longer: 4252 + 256 + 4318.
      expect(line.width, mode).toBeCloseTo(20 * 8.826, 1);
      expect(line.fonts, mode).toBe(1);
    }
  });

  it('a document that keeps the host\u2019s language prints the same page whatever the provider says of its files', async () => {
    const described = (await printedPage(DECLARED, 'host'))[0]!;
    expect(described).toEqual((await printedPage(BARE, 'host'))[0]!);
    expect(new Set(described.map((g) => g.font)).size).toBe(1);
    // And its provider is asked for the same characters.
    const asked: number[][] = [];
    await printedPage(DECLARED, 'host', asked);
    const bare: number[][] = [];
    await printedPage(BARE, 'host', bare);
    expect(asked).toEqual(bare);
  });
});

describe('the files of an answer in the order a style sheet declares them (#770)', () => {
  const file = (name: string, order?: number): PdfFontFile => declaredFontFile(new TextEncoder().encode(name), order === undefined ? {} : { order });
  const names = (files: PdfFontFile[]): string => files.map((f) => new TextDecoder().decode(f)).join(' ');

  it('by their numbers, and a list with none from its last file to its first', () => {
    expect(names(inDeclarationOrder([file('c', 7), file('a', 0), file('b', 3)]))).toBe('a b c');
    expect(names(inDeclarationOrder([file('last'), file('middle'), file('first')]))).toBe('first middle last');
  });

  it('an SVG picture drawn as an image declares ranged files as the page did: each rule with its range, the last declared last', async () => {
    const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><text font-family="Noto Serif JP">Shift_JIS</text></svg>';
    const out = await inlineSvgFontsForRaster(svg, [FONT], async () => [DECLARED[2]!, DECLARED[0]!, DECLARED[1]!]);
    const rules = [...out.matchAll(/@font-face\{[^}]*\}/g)].map((m) => m[0]);
    expect(rules).toHaveLength(3);
    expect(rules.map((rule) => /unicode-range:([^;}]*)/.exec(rule)?.[1]?.split(',')[0])).toEqual(['U+0-ff', 'U+21-22', 'U+26']);
    // Bare files: one rule each, as given, with no range.
    const bare = await inlineSvgFontsForRaster(svg, [FONT], async () => BARE);
    expect([...bare.matchAll(/@font-face\{[^}]*\}/g)]).toHaveLength(3);
    expect(bare).not.toContain('unicode-range');
  });
});
