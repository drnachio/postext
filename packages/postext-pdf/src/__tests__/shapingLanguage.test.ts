import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont } from 'pdf-lib';
import { loadComplexShaper, shapeRun } from '../complexShaping.js';
import { shapeInCurrentLanguage, shapesSegmentLanguages, shapingKey, shapingLanguage, shapingScriptOf, withDocumentLanguage, withSegmentLanguage, withShapingLanguage, withShapingScript } from '../shapingLanguage.js';
import { textAdvancePx } from '../pdf-backend/primitives.js';
import { shapedSvgText } from '../pdf-backend/text/shapedText.js';

// #764: a text is shaped in the language the layout measured it in, by
// both shapers of the PDF. The widths below are the ones Chrome 154 gives
// these very font files on a canvas (`measureText` at 1000 px with
// `ctx.lang` set), each text measured alone, as the layout measures a
// word: thousandths of the em.
//
// Chrome shapes a string with no character above U+00FF as Latin text
// (`2026` and `"` take the Latin forms of the face in the language), and
// any other string by the scripts of its characters: `—` or `……` alone
// are of no script, and take the forms of no language.

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/${name}`, import.meta.url)));
const FILES = {
  serifSC: fixture('cjk/noto-serif-sc-language.ttf'),
  serifTC: fixture('cjk/noto-serif-tc-language.ttf'),
  serifJP: fixture('cjk/noto-serif-jp-vertical.ttf'),
  sansSC: fixture('cjk/noto-sans-sc-language.ttf'),
  sansJP: fixture('cjk/noto-sans-jp-language.ttf'),
  alegreya: fixture('latin/alegreya-language.ttf'),
};
type Face = keyof typeof FILES;

const NBSP = '\u00A0';
const ELLIPSIS = '\u2026';
const DASH = '\u2014';
const HAN = '\u4E00';
/** The texts of the CJK faces: digits, the ellipsis, the dash and the
 *  ASCII quotes alone, a DOI, and each beside a Latin letter or after a
 *  Han character. */
const CJK_TEXTS = ['1', '2026', '2001', ELLIPSIS, `${ELLIPSIS}${ELLIPSIS}`, DASH, `${DASH}${DASH}`, '"', "'", '10.1006/', `2001${NBSP}n`, `${ELLIPSIS}${ELLIPSIS}${NBSP}n`, `${HAN}2026`, 'n"', `n${DASH}`];
/** Text the Japanese serif fixture lacks a glyph for (the full stop and
 *  the slash, U+4E00, the no-break space). */
const NOT_IN_SERIF_JP = new Set(['10.1006/', `${HAN}2026`, `2001${NBSP}n`, `${ELLIPSIS}${ELLIPSIS}${NBSP}n`]);

/** Chrome's widths of {@link CJK_TEXTS}: in the language the face has
 *  forms for (`own`), and in any other (`other`). */
const CHROME: Record<Exclude<Face, 'alegreya'>, { own: string[]; other: string[]; ownWidths: number[]; otherWidths: number[] }> = {
  serifSC: {
    own: ['zh', 'zh-Hans', 'zh-CN', 'zh-SG'],
    other: ['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO', 'zh-Hant-HK', 'yue', 'ja', 'ko', 'en', 'en-US', 'ca', ''],
    ownWidths: [471, 2231, 2143, 1000, 2000, 890, 1692, 392, 205, 3850, 3060, 2917, 3231, 1053, 1661],
    otherWidths: [550, 2200, 2200, 1000, 2000, 890, 1692, 376, 196, 3979, 3117, 2717, 3231, 970, 1546],
  },
  serifTC: {
    own: ['zh-Hant', 'zh-TW'],
    other: ['zh', 'zh-Hans', 'zh-CN', 'zh-SG', 'zh-HK', 'zh-MO', 'zh-Hant-HK', 'yue', 'ja', 'ko', 'en', 'ca', ''],
    ownWidths: [471, 2231, 2143, 1000, 2000, 890, 1692, 392, 205, 3850, 3060, 2917, 3231, 1053, 1661],
    otherWidths: [550, 2200, 2200, 1000, 2000, 890, 1692, 376, 196, 3979, 3117, 2717, 3231, 970, 1546],
  },
  serifJP: {
    own: ['ja'],
    other: ['zh', 'zh-Hans', 'zh-Hant', 'zh-TW', 'zh-HK', 'ko', 'en', 'ca', ''],
    ownWidths: [471, 2231, 2143, 1000, 2000, 890, 1692, 392, 205, 0, 0, 0, 0, 1053, 1661],
    otherWidths: [550, 2200, 2200, 1000, 2000, 890, 1692, 376, 196, 0, 0, 0, 0, 970, 1546],
  },
  sansSC: {
    own: ['zh', 'zh-Hans', 'zh-CN', 'zh-SG'],
    other: ['zh-Hant', 'zh-TW', 'zh-HK', 'zh-MO', 'yue', 'ja', 'ko', 'en', 'ca', ''],
    ownWidths: [555, 2220, 2220, 1000, 2000, 894, 1676, 475, 279, 4000, 3054, 2834, 3220, 1085, 1610],
    otherWidths: [555, 2220, 2220, 1000, 2000, 894, 1676, 474, 278, 4000, 3054, 2952, 3220, 1084, 1504],
  },
  sansJP: {
    own: ['ja'],
    other: ['zh', 'zh-Hans', 'zh-Hant', 'zh-TW', 'zh-HK', 'ko', 'en', 'ca', ''],
    ownWidths: [555, 2220, 2220, 1000, 2000, 894, 1676, 475, 279, 4000, 3054, 2834, 3220, 1085, 1610],
    otherWidths: [555, 2220, 2220, 1000, 2000, 894, 1676, 474, 278, 4000, 3054, 2952, 3220, 1084, 1504],
  },
};

/** Alegreya: `fi` and `fil`, the Catalan `l·l`, `ale`, the Romanian
 *  letters in both spellings, the Dutch `íj`, the Serbian `б`. */
const LATIN_TEXTS = ['fi', 'fil', 'l\u00B7l', 'ale', '\u015F', '\u0163', '\u0219', '\u021B', '\u00EDj', '\u0431', '\u0430\u0431'];
const ALEGREYA_PLAIN = [587, 831, 726, 1158, 402, 330, 402, 330, 532, 525, 986];
const ALEGREYA: Record<string, number[]> = {
  en: ALEGREYA_PLAIN,
  es: ALEGREYA_PLAIN,
  '': ALEGREYA_PLAIN,
  // The Romanian forms are as wide (told apart below by their glyphs), and
  // so is the Dutch pair; Macedonian has no form in this face.
  ro: ALEGREYA_PLAIN,
  'ro-MD': ALEGREYA_PLAIN,
  nl: ALEGREYA_PLAIN,
  mk: ALEGREYA_PLAIN,
  ca: [587, 831, 576, 1158, 402, 330, 402, 330, 532, 525, 986],
  tr: [612, 856, 726, 1158, 402, 330, 402, 330, 532, 525, 986],
  az: [612, 856, 726, 1158, 402, 330, 402, 330, 532, 525, 986],
  sr: [587, 831, 726, 1158, 402, 330, 402, 330, 532, 498, 959],
};

const fonts = {} as Record<Face, PDFFont>;
beforeAll(async () => {
  await loadComplexShaper();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  for (const face of Object.keys(FILES) as Face[]) {
    fonts[face] = await pdf.embedFont(FILES[face], { subset: true });
    shapeInCurrentLanguage(fonts[face]);
  }
});

/** fontkit's advance of `text`, as pdf-lib sets plain text. */
const plain = (face: Face, text: string): number => Math.round(textAdvancePx(fonts[face], text, 1000).advance);
/** HarfBuzz's, through the PDF's own painter of shaped text. */
const shaped = (face: Face, text: string): number => Math.round(shapedSvgText(fonts[face], text, 1000)!.advance);
/** HarfBuzz's, asked in the language and the script the text is shaped in. */
function harfbuzz(face: Face, text: string): number {
  const language = shapingLanguage();
  const script = shapingScriptOf(text);
  const run = shapeRun(FILES[face], text, { direction: 'ltr', ...(language ? { language } : {}), ...(script ? { script } : {}) })!;
  return Math.round((run.glyphs.reduce((sum, g) => sum + g.xAdvance, 0) * 1000) / run.upem);
}
/** The glyphs fontkit sets `text` with. */
function glyphIds(face: Face, text: string): number[] {
  const kit = (fonts[face] as unknown as { embedder: { font: { layout: (text: string) => { glyphs: { id: number }[] } } } }).embedder.font;
  return kit.layout(text).glyphs.map((g) => g.id);
}

describe('the language in force (#764)', () => {
  it('is set for one call and put back, also when the call throws', () => {
    expect(shapingLanguage()).toBeUndefined();
    expect(withShapingLanguage('ca', () => shapingLanguage())).toBe('ca');
    expect(withShapingLanguage('ca', () => withShapingLanguage('zh-Hans', () => shapingLanguage()))).toBe('zh-Hans');
    // The empty tag: a document's text in no language.
    expect(withShapingLanguage('', () => shapingLanguage())).toBe('');
    expect(withShapingLanguage('ca', () => withShapingLanguage(undefined, () => shapingLanguage()))).toBeUndefined();
    expect(() => withShapingLanguage('ca', () => { throw new Error('x'); })).toThrow('x');
    expect(shapingLanguage()).toBeUndefined();
  });

  it('is part of the key of every cache of shaped text, with the script', () => {
    expect(shapingKey('2026')).toBe('2026');
    const keys = [
      shapingKey('2026'),
      withShapingLanguage('', () => shapingKey('2026')),
      withShapingLanguage('zh-Hans', () => shapingKey('2026')),
      withShapingLanguage('zh-Hant', () => shapingKey('2026')),
      withShapingLanguage('zh-Hans', () => withShapingScript('Latn', () => shapingKey('2026'))),
      withShapingLanguage('zh-Hans', () => withShapingScript('Hani', () => shapingKey('2026'))),
      withShapingScript('Latn', () => shapingKey('2026')),
      withDocumentLanguage(undefined, 'ja', () => shapingKey('2026')),
      withDocumentLanguage('ja', 'ja', () => shapingKey('2026')),
    ];
    expect(new Set(keys).size).toBe(keys.length);
  });

  it('a page takes its document\u2019s, and a segment its own', () => {
    withDocumentLanguage('zh-Hans', 'zh-Hans', () => {
      expect(shapingLanguage()).toBe('zh-Hans');
      expect(shapesSegmentLanguages()).toBe(true);
      expect(withSegmentLanguage(undefined, () => shapingLanguage())).toBe('zh-Hans');
      expect(withSegmentLanguage('en', () => shapingLanguage())).toBe('en');
      // As written by the author: read in canonical form.
      expect(withSegmentLanguage('ZH-hant', () => shapingLanguage())).toBe('zh-Hant');
    });
    expect(shapingLanguage()).toBeUndefined();
  });

  it('text with no character above U+00FF is Latin text, in a document\u2019s language only', () => {
    expect(shapingScriptOf('2026')).toBeUndefined();
    withShapingLanguage('zh-Hans', () => {
      expect(shapingScriptOf('2026')).toBe('Latn');
      expect(shapingScriptOf('"')).toBe('Latn');
      expect(shapingScriptOf(`l\u00B7l`)).toBe('Latn');
      expect(shapingScriptOf(DASH)).toBeUndefined();
      expect(shapingScriptOf(`2026${DASH}`)).toBeUndefined();
      expect(shapingScriptOf(HAN)).toBeUndefined();
      // The script the layout gave a word comes first.
      expect(withShapingScript('Grek', () => shapingScriptOf('2026'))).toBe('Grek');
      // Beside an ideograph the canvas shaped the word with no script.
      expect(withShapingScript('Hani', () => shapingScriptOf('2026'))).toBeUndefined();
    });
    expect(withShapingScript('Hani', () => shapingScriptOf('2026'))).toBe('Hani');
    expect(withShapingLanguage('', () => shapingScriptOf('2026'))).toBe('Latn');
  });
});

describe('the widths of the canvas, by both shapers (#764)', () => {
  for (const face of Object.keys(CHROME) as Exclude<Face, 'alegreya'>[]) {
    it(`${face}: digits, the ellipsis, the dash and the quotes in each language`, () => {
      const chrome = CHROME[face];
      const rows: [string[], number[]][] = [[chrome.own, chrome.ownWidths], [chrome.other, chrome.otherWidths]];
      for (const [languages, widths] of rows) {
        for (const language of languages) {
          withShapingLanguage(language, () => {
            CJK_TEXTS.forEach((text, i) => {
              if (face === 'serifJP' && NOT_IN_SERIF_JP.has(text)) return;
              const label = `${face} ${language || '(none)'} ${JSON.stringify(text)}`;
              expect(plain(face, text), `fontkit ${label}`).toBe(widths[i]);
              expect(shaped(face, text), `HarfBuzz ${label}`).toBe(widths[i]);
              expect(harfbuzz(face, text), `shapeRun ${label}`).toBe(widths[i]);
            });
          });
        }
      }
      // The two rows differ: the face does have forms of its own.
      expect(chrome.ownWidths).not.toEqual(chrome.otherWidths);
    });
  }

  it('Noto Serif JP: the quotes of Japanese text', () => {
    // The ASCII quote is Latin text, and takes its Japanese form; “ and ”
    // alone are of no script and keep the default one, on the canvas too.
    withShapingLanguage('ja', () => {
      for (const [text, width] of [['"', 392], ["'", 205], ['\u201C', 426], ['\u201D', 425]] as const) {
        expect(plain('serifJP', text), text).toBe(width);
        expect(shaped('serifJP', text), text).toBe(width);
      }
    });
  });

  it('Alegreya: the Catalan l\u00B7l, the Turkish fi, the Serbian \u0431', () => {
    for (const [language, widths] of Object.entries(ALEGREYA)) {
      withShapingLanguage(language, () => {
        LATIN_TEXTS.forEach((text, i) => {
          const label = `${language || '(none)'} ${JSON.stringify(text)}`;
          expect(plain('alegreya', text), `fontkit ${label}`).toBe(widths[i]);
          expect(shaped('alegreya', text), `HarfBuzz ${label}`).toBe(widths[i]);
          expect(harfbuzz('alegreya', text), `shapeRun ${label}`).toBe(widths[i]);
        });
      });
    }
  });

  it('Alegreya: \u015F and \u0163 are drawn as \u0219 and \u021B in Romanian, by both shapers', () => {
    // As wide in both spellings; Chrome paints the comma forms under `ro`
    // and `ro-MD` (the same ink as ș and ț) and the cedilla ones elsewhere.
    const hb = (text: string, language: string): number[] => shapeRun(FILES.alegreya, text, { direction: 'ltr', script: 'Latn', language })!.glyphs.map((g) => g.gid);
    for (const [cedilla, comma] of [['\u015F', '\u0219'], ['\u0163', '\u021B']] as const) {
      for (const language of ['ro', 'ro-RO', 'ro-MD']) {
        expect(withShapingLanguage(language, () => glyphIds('alegreya', cedilla)), language).toEqual(glyphIds('alegreya', comma));
        expect(hb(cedilla, language), language).toEqual(hb(comma, 'en'));
      }
      for (const language of ['en', 'tr', 'ca', '']) {
        expect(withShapingLanguage(language, () => glyphIds('alegreya', cedilla)), language).not.toEqual(glyphIds('alegreya', comma));
        expect(withShapingLanguage(language, () => glyphIds('alegreya', cedilla)), language).toEqual(glyphIds('alegreya', cedilla));
      }
      // The glyphs HarfBuzz and fontkit set are the same ones.
      expect(withShapingLanguage('ro', () => glyphIds('alegreya', cedilla))).toEqual(hb(cedilla, 'ro'));
    }
    // The Turkish i keeps f and i apart, glyph for glyph in both.
    expect(withShapingLanguage('tr', () => glyphIds('alegreya', 'fi'))).toEqual(hb('fi', 'tr'));
    expect(withShapingLanguage('tr', () => glyphIds('alegreya', 'fi')).length).toBe(2);
    expect(withShapingLanguage('en', () => glyphIds('alegreya', 'fi')).length).toBe(1);
  });
});

describe('a script the layout gave a word, in the document\u2019s language (#725, #764)', () => {
  it('the year of a Latin word in Chinese keeps the digits of the face', () => {
    // `2001` beside a Latin letter: 214.3 px at 100 px in Chinese, 220 in
    // English (Chrome).
    expect(withShapingLanguage('zh-Hans', () => withShapingScript('Latn', () => plain('serifSC', '2001')))).toBe(2143);
    expect(withShapingLanguage('en', () => withShapingScript('Latn', () => plain('serifSC', '2001')))).toBe(2200);
    expect(withShapingLanguage('zh-Hans', () => withShapingScript('Latn', () => shaped('serifSC', '2001')))).toBe(2143);
    expect(withShapingLanguage('en', () => withShapingScript('Latn', () => shaped('serifSC', '2001')))).toBe(2200);
  });

  it('a doubled ellipsis beside a Latin letter: 2 em in Chinese, 1.8 em in English', () => {
    const pair = `${ELLIPSIS}${ELLIPSIS}`;
    for (const measure of [plain, shaped]) {
      expect(withShapingLanguage('zh-Hans', () => withShapingScript('Latn', () => measure('serifSC', pair)))).toBe(2000);
      expect(withShapingLanguage('en', () => withShapingScript('Latn', () => measure('serifSC', pair)))).toBe(1800);
      expect(withShapingLanguage('en', () => withShapingScript('Hani', () => measure('serifSC', pair)))).toBe(2000);
    }
  });

  it('a word measured beside an ideograph has no script: the canvas shaped the two apart', () => {
    // Chrome, in Chinese: `——` + NBSP + 一 is 2948 (1692 for the dashes,
    // their default form), `"` + NBSP + 一 1632 (376) and `2026` + NBSP +
    // 一 3487 (2231); in a Han run the dashes would take the Chinese form,
    // 2 em wide, and the quote the Chinese one, 392.
    const pair = `${DASH}${DASH}`;
    for (const measure of [plain, shaped]) {
      withShapingLanguage('zh-Hans', () => {
        expect(withShapingScript('Hani', () => measure('serifSC', pair))).toBe(1692);
        expect(withShapingScript('Hani', () => measure('serifSC', '"'))).toBe(376);
        expect(withShapingScript('Hani', () => measure('serifSC', '2026'))).toBe(2231);
        // Beside a Latin letter they take the Chinese forms of Latin text.
        expect(withShapingScript('Latn', () => measure('serifSC', pair))).toBe(2000);
        expect(withShapingScript('Latn', () => measure('serifSC', '"'))).toBe(392);
      });
      // In English the digits beside an ideograph are the face's own too.
      expect(withShapingLanguage('en', () => withShapingScript('Hani', () => measure('serifSC', '2026')))).toBe(2231);
      expect(withShapingLanguage('en', () => measure('serifSC', '2026'))).toBe(2200);
    }
  });
});

describe('a segment in a language of its own (#764)', () => {
  it('is shaped in it, and the text around it in the document\u2019s', () => {
    withDocumentLanguage('en', 'en', () => {
      expect(plain('alegreya', 'l\u00B7l')).toBe(726);
      expect(withSegmentLanguage('ca', () => plain('alegreya', 'l\u00B7l'))).toBe(576);
      expect(withSegmentLanguage('ca', () => shaped('alegreya', 'l\u00B7l'))).toBe(576);
      expect(withSegmentLanguage('tr', () => plain('alegreya', 'fi'))).toBe(612);
      expect(plain('alegreya', 'fi')).toBe(587);
    });
    withDocumentLanguage('zh-Hans', 'zh-Hans', () => {
      expect(plain('serifSC', '2026')).toBe(2231);
      expect(withSegmentLanguage('en', () => plain('serifSC', '2026'))).toBe(2200);
      expect(withSegmentLanguage('zh-Hant', () => plain('serifSC', '2026'))).toBe(2200);
    });
  });
});

describe('a document that keeps the host\u2019s language (#764)', () => {
  it('is shaped as before: JAN for Japanese through fontkit, no language otherwise', () => {
    withDocumentLanguage(undefined, 'ja', () => {
      // HarfBuzz was told no language.
      expect(shapingLanguage()).toBeUndefined();
      expect(shapesSegmentLanguages()).toBe(false);
      expect(shapingScriptOf('2026')).toBeUndefined();
      // Punctuation alone was shaped as Han in `JAN `: the Japanese “.
      expect(plain('serifJP', '\u201C')).toBe(465);
      expect(plain('serifJP', '"')).toBe(392);
      expect(shaped('serifJP', '"')).toBe(376);
      // A segment of the body in Japanese, or in any other language.
      expect(withSegmentLanguage('zh', () => plain('serifJP', '\u201C'), true)).toBe(426);
      expect(withSegmentLanguage('zh', () => plain('serifJP', '\u201C'))).toBe(465);
    });
    withDocumentLanguage(undefined, 'zh-Hans', () => {
      expect(shapingLanguage()).toBeUndefined();
      // No language, and the script fontkit reads: the default one.
      expect(plain('serifSC', '2026')).toBe(2231);
      expect(plain('serifSC', '"')).toBe(376);
      expect(plain('serifSC', `n${DASH}`)).toBe(1546);
      expect(withSegmentLanguage('ja', () => plain('serifJP', '\u201C'), true)).toBe(465);
    });
    withDocumentLanguage(undefined, 'ca', () => {
      expect(plain('alegreya', 'l\u00B7l')).toBe(726);
      expect(withSegmentLanguage('ca', () => plain('alegreya', 'l\u00B7l'), true)).toBe(726);
    });
  });

  it('text with no language in force at all is shaped as it always was', () => {
    // The digits alone in the default script of the face.
    expect(plain('serifSC', '2026')).toBe(2231);
    expect(plain('serifSC', '"')).toBe(376);
    expect(plain('alegreya', 'l\u00B7l')).toBe(726);
  });
});
