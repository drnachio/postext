import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, rgb, type PDFFont } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { loadComplexShaper } from '../complexShaping.js';
import { parseFontString } from '../fontString.js';
import { shapeInCurrentLanguage, withDocumentLanguage } from '../shapingLanguage.js';
import { cellPieces, drawTextPx, textAdvancePx, textShows, type PageCtx } from '../pdf-backend/primitives.js';
import '../pdf-backend/text/shapedText.js';
import { paintedGlyphs, type PaintedGlyph } from './glyphPositions.js';

// #770: a document shaped in its own language is shaped word by word, as
// the canvas shaped it (`canvasWords.ts`), and the characters a line of the
// CJK composer measured one by one are painted one by one. The widths below
// are the ones Chrome 154 gives these very font files on a canvas
// (`measureText` at 1000 px with `ctx.lang` set): thousandths of the em.
//
// Chrome cuts a string at its spaces and around each CJK character and
// shapes every word alone: nothing is kerned across a cut, and a word takes
// the script of its own letters, none when it has no letter (a space, a
// quote, a row of digits) unless the whole string has no character above
// U+00FF. A shaper handed the whole string kerns `ノン` in Noto Serif JP
// (0.04 em), a comma against a space in Alegreya (0.02 em), sets the dash
// of `2026—2026` in its Chinese form beside a Latin word, the quotes of
// `私は“本当”` in their Japanese form, and the space between two Arabic
// words of Aref Ruqaa 0.146 em wide, as inside Arabic text, for 0.333 em.

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const FILES = {
  serifJP: fixture('cjk/noto-serif-jp-vertical.ttf'),
  sansSC: fixture('cjk/noto-sans-sc-language.ttf'),
  alegreya: fixture('latin/alegreya-language.ttf'),
  aref: fixture('fontsource/aref-ruqaa-arabic.ttf'),
};
type Face = keyof typeof FILES;

/** Kana and the marks after them, in Japanese. */
const KANA: [string, number][] = [['\u30CE\u30F3\u30D5\u30EB', 4000], ['\u30AF\u30EA\u30C3\u30AF', 4000], ['\u30A2\u30A4', 2000], ['\u30EA\u30F3\u30AF\u3068\u306F', 5000], ['\u30AF\u30EA\u30C3\u30AF\u3059\u308B\u3002', 7000], ['\u3059\u3002', 1920], ['\u308C\u3001', 2060], ['\u30FC\u3001', 1960], ['\u30E9\u30FC', 2000], ['\u3059\u3002\u3059\u3002', 3840], ['\u30CE\u30F3 \u30CE\u30F3', 4256], ['\u30CE\u30F3\u30D5\u30EB\u306F\u4EBA', 6000]];
/** The quotes of Japanese text: alone, beside a kana or a Han character,
 *  in a Latin word. */
const QUOTES: [string, number][] = [['\u201C', 426], ['\u201D', 425], ['"', 392], ['\'', 205], ['\u306F\u201C', 1426], ['\u306F"', 1376], ['\u306F"\u306F', 2376], ['\u201C\u672C\u5F53\u201D', 2851], ['\u79C1\u306F\u201C\u672C\u5F53\u201D\u3068\u66F8\u304F\u3002', 8831], ['\u201Cyes\u201D', 2484], ['said \u201Cyes\u201D', 4730], ['yes \u201C\u306F\u201D', 3661], ['"hi"', 1779]];
/** A running head in Chinese, with Latin words and a dash between digits. */
const HEAD_ZH: [string, number][] = [['\u672C 2026\u20142026 abn', 8573], ['2026\u20142026', 5334], ['n\u2014n', 2220], ['\u672C \u00B7 n', 3058], ['\u4E00 2026', 3444], ['\u4E00 \u2014', 2118]];
const HEAD_EN: [string, number][] = [['\u672C 2026\u20142026 abn', 8573], ['2026\u20142026', 5334], ['n\u2014n', 2114], ['\u672C \u00B7 n', 3058], ['\u4E00 2026', 3444], ['\u4E00 \u2014', 2118]];
/** Alegreya kerns a comma, a full stop and an interpunct against a space. */
const SPACED: [string, number][] = [['a, e', 1406], ['e \u00B7 a', 1548], ['a. e', 1417], ['a,', 760]];
/** A title in Aref Ruqaa, with a space and with a no-break space. */
const TITLE: [string, number][] = [['\u0623\u0644\u0641 \u0644\u064A\u0644\u0629 \u0648\u0644\u064A\u0644\u0629', 4176], ['\u0623\u0644\u0641 \u0644\u064A\u0644\u0629', 2622], ['\u0623\u0644\u0641\u00A0\u0644\u064A\u0644\u0629', 2435], ['\u0623\u0644\u0641', 1315], ['\u0644\u064A\u0644\u0629', 974]];

const fonts = {} as Record<Face, PDFFont>;
let pdf: PDFDocument;
beforeAll(async () => {
  await loadComplexShaper();
  pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  for (const face of Object.keys(FILES) as Face[]) {
    fonts[face] = await pdf.embedFont(FILES[face], { subset: true });
    shapeInCurrentLanguage(fonts[face]);
  }
});

/** In a document shaped in the language `tag`. */
const inDocument = <T,>(tag: string, fn: () => T): T => withDocumentLanguage(tag, tag, fn);
/** In a document that keeps the host's language, declared in `tag`. */
const inHost = <T,>(tag: string, fn: () => T): T => withDocumentLanguage(undefined, tag, fn);
/** The advance the PDF gives `text` set as plain text. */
const advance = (face: Face, text: string): number => textAdvancePx(fonts[face], text, 1000).advance;
const near = (got: number, chrome: number, what: string): void => expect(Math.abs(got - chrome), `${what}: ${got.toFixed(1)}, Chrome ${chrome}`).toBeLessThan(0.75);

/** `text` painted at 20 pt from x = 50 on a page of its own, in a document
 *  shaped in `tag` (in one that keeps the host's language with `host`):
 *  the glyphs the page shows. */
async function painted(face: Face, text: string, tag: string, host = false): Promise<PaintedGlyph[]> {
  const doc = await PDFDocument.create();
  doc.registerFontkit(fontkit);
  const font = await doc.embedFont(FILES[face], { subset: true });
  shapeInCurrentLanguage(font);
  const page = doc.addPage([600, 100]);
  const ctx: PageCtx = { page, pageHeightPt: 100, scale: 1, colorSpace: 'rgb' };
  const paint = (): void => drawTextPx(ctx, text, 50, 60, font, 20, rgb(0, 0, 0));
  if (host) inHost(tag, paint);
  else inDocument(tag, paint);
  return (await paintedGlyphs(await doc.save()))[0]!;
}

describe('a string shaped word by word, as on the canvas (#770)', () => {
  it('Noto Serif JP: kana are not kerned against each other, and a kana is against the mark after it', () => {
    inDocument('ja', () => KANA.forEach(([text, chrome]) => near(advance('serifJP', text), chrome, text)));
  });

  it('Noto Serif JP: a quote is Japanese in a Latin word and alone in eight bits, the default one beside a kana', () => {
    inDocument('ja', () => QUOTES.forEach(([text, chrome]) => near(advance('serifJP', text), chrome, text)));
  });

  it('Noto Sans SC: the dash between two numbers is the default one, whatever stands in the words beside it', () => {
    inDocument('zh-Hans', () => HEAD_ZH.forEach(([text, chrome]) => near(advance('sansSC', text), chrome, text)));
    inDocument('en', () => HEAD_EN.forEach(([text, chrome]) => near(advance('sansSC', text), chrome, text)));
  });

  it('Alegreya: nothing is kerned against a space', () => {
    inDocument('en', () => SPACED.forEach(([text, chrome]) => near(advance('alegreya', text), chrome, text)));
  });

  it('a document that keeps the host\u2019s language is shaped string by string, as before', () => {
    inHost('ja', () => {
      // The pair kerned, and the quotes of the whole run Japanese.
      near(advance('serifJP', '\u30CE\u30F3\u30D5\u30EB'), 3920, 'kana');
      near(advance('serifJP', '\u79C1\u306F\u201C\u672C\u5F53\u201D\u3068\u66F8\u304F\u3002'), 8000 + 465 + 465 - 20, 'quotes');
    });
    inHost('en', () => near(advance('alegreya', 'a, e'), 1386, 'a, e'));
    // And so is text with no language in force at all.
    near(advance('alegreya', 'a, e'), 1386, 'a, e');
    near(advance('serifJP', '\u30CE\u30F3\u30D5\u30EB'), 3920, 'kana');
  });

  it('the words that follow each other in one file are one operator, with no number between two kana', () => {
    const shows = (text: string): string[] => textShows(fonts.serifJP, text).map((show) => show.op.toString());
    inDocument('ja', () => {
      const ops = shows('\u30CE\u30F3\u30D5');
      expect(ops).toHaveLength(1);
      expect(ops[0]).toMatch(/^<[0-9A-F]{12}> Tj$/i);
      // The kana and its full stop are one word: kerned.
      expect(shows('\u3059\u3002')[0]).toMatch(/TJ$/);
    });
    inHost('ja', () => expect(shows('\u30CE\u30F3\u30D5')[0]).toMatch(/TJ$/));
  });
});

describe('the glyphs of a string painted word by word (#770)', () => {
  it('Noto Serif JP: each kana an em after the one before', async () => {
    const glyphs = await painted('serifJP', '\u30CE\u30F3\u30D5\u30EB\u306F\u4EBA', 'ja');
    expect(glyphs.map((g) => g.text).join('')).toBe('\u30CE\u30F3\u30D5\u30EB\u306F\u4EBA');
    glyphs.forEach((g, i) => expect(g.x, g.text).toBeCloseTo(50 + 20 * i, 2));
    // Shaped as one string, the ones after a kerned pair stand left of their places.
    const whole = await painted('serifJP', '\u30CE\u30F3\u30D5\u30EB\u306F\u4EBA', 'ja', true);
    expect(whole.filter((g, i) => Math.abs(g.x - (50 + 20 * i)) > 0.1).length).toBeGreaterThan(0);
  });

  it('Noto Serif JP: the quotes beside a Han character are the default ones, the ones of a Latin word Japanese', async () => {
    const face = fontkit.create(Buffer.from(FILES.serifJP));
    const k = 1000 / face.unitsPerEm;
    const layout = face.layout as unknown as (text: string, features: string[], script?: string, language?: string) => ReturnType<typeof face.layout>;
    const boxOf = (text: string, at: number, script: string, language?: string): string => {
      const b = layout.call(face, text, [], script, language).glyphs[at]!.bbox;
      return [b.minX, b.maxX, b.minY, b.maxY].map((v) => Math.round(v * k)).join(' ');
    };
    const plain = { open: boxOf('\u201C', 0, 'DFLT'), close: boxOf('\u201D', 0, 'DFLT'), ascii: boxOf('"', 0, 'DFLT') };
    const japanese = { open: boxOf('n\u201C', 1, 'latn', 'JAN'), close: boxOf('n\u201D', 1, 'latn', 'JAN'), ascii: boxOf('n"', 1, 'latn', 'JAN') };
    expect(plain.open).not.toBe(japanese.open);
    expect(plain.ascii).not.toBe(japanese.ascii);
    const boxes = async (text: string, host = false): Promise<Record<string, string[]>> => {
      const out: Record<string, string[]> = {};
      for (const g of await painted('serifJP', text, 'ja', host)) (out[g.text] ??= []).push(g.box);
      return out;
    };
    const sentence = await boxes('\u79C1\u306F\u201C\u672C\u5F53\u201D\u3068\u66F8\u304F\u3002');
    expect(sentence['\u201C']).toEqual([plain.open]);
    expect(sentence['\u201D']).toEqual([plain.close]);
    expect((await boxes('\u306F"\u306F'))['"']).toEqual([plain.ascii]);
    const word = await boxes('said \u201Cyes\u201D');
    expect(word['\u201C']).toEqual([japanese.open]);
    expect(word['\u201D']).toEqual([japanese.close]);
    expect((await boxes('"'))['"']).toEqual([japanese.ascii]);
    expect((await boxes('"hi"'))['"']).toEqual([japanese.ascii, japanese.ascii]);
    // A document that keeps the host's language prints the Japanese ones everywhere (#427).
    const host = await boxes('\u79C1\u306F\u201C\u672C\u5F53\u201D\u3068\u66F8\u304F\u3002', true);
    expect(host['\u201C']).toEqual([japanese.open]);
    expect(host['\u201D']).toEqual([japanese.close]);
  });

  it('Aref Ruqaa: the space between two Arabic words is a word of its own, 0.333 em wide', async () => {
    /** How wide the glyphs of a painted text stand, thousandths of the em. */
    const width = (glyphs: PaintedGlyph[]): number => ((Math.max(...glyphs.map((g) => g.end)) - Math.min(...glyphs.map((g) => g.x))) / 20) * 1000;
    for (const [text, chrome] of TITLE) near(width(await painted('aref', text, 'ar')), chrome, text);
    const space = (glyphs: PaintedGlyph[]): number => glyphs.find((g) => g.text === ' ')!.advance / 20;
    expect(space(await painted('aref', '\u0623\u0644\u0641 \u0644\u064A\u0644\u0629', 'ar'))).toBeCloseTo(0.333, 3);
    // Shaped as one string, the space is the one of Arabic text, and the two words stand 0.187 em closer.
    const whole = await painted('aref', '\u0623\u0644\u0641 \u0644\u064A\u0644\u0629', 'ar', true);
    expect(space(whole)).toBeCloseTo(0.146, 3);
    near(width(whole), 2435, 'host');
  });
});

// The layout of the documents below: a canvas that measures with the
// font's own advances, each string as fontkit sets it alone. The composer
// measures a CJK character by itself, so every kana and every mark is one
// em in its line.
const jp = fontkit.create(Buffer.from(FILES.serifJP));
class StubCtx {
  font = '';
  letterSpacing = '0px';
  measureText(s: string) {
    const size = parseFontString(this.font)?.sizePx ?? 16;
    let w = 0;
    for (const p of jp.layout(s).positions) w += p.xAdvance;
    const width = (w / jp.unitsPerEm) * size;
    return { width, actualBoundingBoxAscent: 0.88 * size, actualBoundingBoxDescent: 0.12 * size, actualBoundingBoxLeft: 0, actualBoundingBoxRight: width };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const japaneseConfig = (shapingLanguage: 'host' | 'document'): PostextConfig => ({
  locale: 'ja',
  page: { width: pt(300), height: pt(420), dpi: 72, margins: { top: pt(40), bottom: pt(40), left: pt(30), right: pt(30) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Noto Serif JP', fontSize: pt(16), lineHeight: pt(24), firstLineIndent: pt(0), textAlign: 'left', hyphenation: { enabled: false }, shapingLanguage },
  headings: { fontFamily: 'Noto Serif JP' },
  header: { elements: [] },
  footer: { elements: [] },
});

/** The glyphs of the first page of `markdown` laid out and printed. */
async function printed(markdown: string, shapingLanguage: 'host' | 'document'): Promise<PaintedGlyph[]> {
  const doc = buildDocument({ markdown }, japaneseConfig(shapingLanguage));
  return (await paintedGlyphs(await renderToPdf(doc, { fontProvider: async () => FILES.serifJP })))[0]!;
}

/** How far each `。` that follows a `す` stands from it, pt. */
function stops(glyphs: PaintedGlyph[]): number[] {
  const out: number[] = [];
  glyphs.forEach((g, i) => {
    if (g.text === '\u3002' && glyphs[i - 1]?.text === '\u3059') out.push(g.x - glyphs[i - 1]!.x);
  });
  return out;
}

describe('the characters a line of the CJK composer measured one by one (#770)', () => {
  it('are painted one by one where a face kerns them together, and a Western run whole', () => {
    inDocument('ja', () => {
      // Six ems as the layout measured them; as one string the stop stands 0.08 em closer.
      expect(advance('serifJP', '\u30AF\u30EA\u30C3\u30AF\u3059\u3002')).toBeCloseTo(5920, 0);
      const cells = cellPieces(fonts.serifJP, '\u30AF\u30EA\u30C3\u30AF\u3059\u3002', 6 * 16, 16);
      expect(cells?.map((cell) => cell.text).join('|')).toBe([...'\u30AF\u30EA\u30C3\u30AF\u3059\u3002'].join('|'));
      cells!.forEach((cell) => expect(cell.width).toBeCloseTo(16, 6));
      // Chrome's em at 15.625 px is 15.62 px: the same characters.
      expect(cellPieces(fonts.serifJP, '\u30AF\u30EA\u30C3\u30AF\u3059\u3002', 6 * 15.6199951171875, 15.625)).toHaveLength(6);
      // With the line's character spacing in every cell.
      expect(cellPieces(fonts.serifJP, '\u30AF\u30EA\u30C3\u30AF\u3059\u3002', 6 * 17, 16, 1)?.map((cell) => cell.width)).toEqual([17, 17, 17, 17, 17, 17]);
      // Nothing kerns in these: painted as they are.
      expect(cellPieces(fonts.serifJP, '\u30AF\u30EA\u30C3\u30AF', 4 * 16, 16)).toBeUndefined();
      expect(cellPieces(fonts.serifJP, 'said', (1990 / 1000) * 16, 16)).toBeUndefined();
      // A segment of another width is not these characters one by one.
      expect(cellPieces(fonts.serifJP, '\u30AF\u30EA\u30C3\u30AF\u3059\u3002', 6 * 16 + 4, 16)).toBeUndefined();
    });
    // A document that keeps the host's language prints its segments as it did.
    inHost('ja', () => expect(cellPieces(fonts.serifJP, '\u30AF\u30EA\u30C3\u30AF\u3059\u3002', 6 * 16, 16)).toBeUndefined());
    expect(cellPieces(fonts.serifJP, '\u30AF\u30EA\u30C3\u30AF\u3059\u3002', 6 * 16, 16)).toBeUndefined();
  });

  it('a line painted as one text: every stop an em after its kana', async () => {
    const document = stops(await printed('\u30EA\u30F3\u30AF\u3068\u306F\u4F55\u304B\u3002\u30AF\u30EA\u30C3\u30AF\u3059\u3002\u79C1\u306F\u898B\u305F\u3002', 'document'));
    expect(document.length).toBeGreaterThan(0);
    document.forEach((d) => expect(d).toBeCloseTo(16, 2));
    // Shaped in one string, as a document that keeps the host's language is: 0.08 em closer.
    const host = stops(await printed('\u30EA\u30F3\u30AF\u3068\u306F\u4F55\u304B\u3002\u30AF\u30EA\u30C3\u30AF\u3059\u3002\u79C1\u306F\u898B\u305F\u3002', 'host'));
    expect(host.length).toBe(document.length);
    host.forEach((d) => expect(d).toBeCloseTo(16 - 0.08 * 16, 2));
  });

  it('a line painted segment by segment: the same', async () => {
    const document = stops(await printed('**\u30AF\u30EA\u30C3\u30AF\u3059\u3002**\u30EA\u30F3\u30AF\u3068\u306F\u4F55\u304B', 'document'));
    expect(document).toHaveLength(1);
    expect(document[0]).toBeCloseTo(16, 2);
    const host = stops(await printed('**\u30AF\u30EA\u30C3\u30AF\u3059\u3002**\u30EA\u30F3\u30AF\u3068\u306F\u4F55\u304B', 'host'));
    expect(host[0]).toBeCloseTo(16 - 0.08 * 16, 2);
  });
});
