import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, type PDFFont } from 'pdf-lib';
import { loadComplexShaper, needsComplexShaping, shapeRun } from '../complexShaping.js';
import { fileRuns, registerFaceFiles } from '../faceFiles.js';
import { besideLetterOf, shapeInCurrentLanguage, shapingKey, shapingLanguage, shapingScriptOf, withBesideLetter, withDocumentLanguage, withShapingScript, withinRightToLeftText } from '../shapingLanguage.js';
import { textAdvancePx } from '../pdf-backend/primitives.js';
import { shapedSvgText } from '../pdf-backend/text/shapedText.js';

// #764, right-to-left runs and faces in several files. The widths below
// are the ones Chrome 154 gives these very font files on a canvas, loaded
// as the Cookbook loads them (the `latin` file for U+0000-00FF and
// U+2000-206F, the `arabic` file for the Arabic blocks), `measureText` at
// about 1000 px with `ctx.lang` and `ctx.direction` set, each string on a
// font size of its own (Chrome keeps the words it has shaped by font, and
// answers a word met before from there): thousandths of the em.
//
// Chrome cuts a string into runs of one direction and each run into words
// at its spaces, and shapes each word in the script of its letters: a mark
// takes the script of the letter before it in its word, else of the first
// after it, whatever file draws it. A word with no letter has no script,
// unless the whole string has no character above U+00FF, which makes all
// of it Latin text.

const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`./fixtures/fontsource/${name}`, import.meta.url)));
const FILES = {
  markazi: [fixture('markazi-text-latin.ttf'), fixture('markazi-text-arabic.ttf')],
  amiri: [fixture('amiri-latin.ttf'), fixture('amiri-arabic.ttf')],
  crimson: [fixture('crimson-pro-latin.ttf')],
};
type Face = keyof typeof FILES;
type Arabic = Exclude<Face, 'crimson'>;
const ARABIC_FACES: Arabic[] = ['markazi', 'amiri'];
/** The languages measured: Arabic, and no language. */
const LANGUAGES = ['ar', ''] as const;

/** Right-to-left words as the layout cuts and measures them (`«أنا`,
 *  `خالة.»`, `«يوسف؟`, `(ويقال`, `كتاب.`, `كتاب)`, `كتاب:`, `[كتاب]`,
 *  `كتاب!`, `“كتاب”`, `كتاب،`, `كتاب`): in a right-to-left context. */
const WORDS = ['\u00AB\u0623\u0646\u0627', '\u062E\u0627\u0644\u0629.\u00BB', '\u00AB\u064A\u0648\u0633\u0641\u061F', '(\u0648\u064A\u0642\u0627\u0644', '\u0643\u062A\u0627\u0628.', '\u0643\u062A\u0627\u0628)', '\u0643\u062A\u0627\u0628:', '[\u0643\u062A\u0627\u0628]', '\u0643\u062A\u0627\u0628!', '\u201C\u0643\u062A\u0627\u0628\u201D', '\u0643\u062A\u0627\u0628\u060C', '\u0643\u062A\u0627\u0628'];
const WORD_WIDTHS: Record<Arabic, Record<string, number[]>> = {
  // Markazi Text draws the guillemets, the stop and the exclamation mark
  // of Arabic text otherwise in Arabic.
  markazi: {
    ar: [939.4, 1892.1, 2703.6, 1928.7, 1708.0, 1749.5, 1724.6, 2002.0, 1718.3, 2141.6, 1762.7, 1525.4],
    '': [1043.4, 1988.3, 2807.6, 1928.7, 1714.8, 1749.5, 1724.6, 2002.0, 1734.4, 2141.6, 1762.7, 1525.4],
  },
  // Amiri the same in every language: the stop of Arabic text is 0.317 em
  // (0.202 as Latin text), a bracket 0.458 (0.255), a guillemet 0.415
  // (0.47).
  amiri: {
    ar: [1068, 2112, 2936, 2380, 2040, 2181, 1943, 2445, 1958, 2463, 2092, 1723],
    '': [1068, 2112, 2936, 2380, 2040, 2181, 1943, 2445, 1958, 2463, 2092, 1723],
  },
};

/** Words with no letter that the layout measured in the Arabic script
 *  (`scriptContext`, #725), right to left: beside `ب` and a no-break
 *  space, the width of those taken off. */
const SCRIPTED = ['\u00BB.', '(', '.', '\u00AB', ')'];
const SCRIPTED_WIDTHS: Record<Arabic, Record<string, number[]>> = {
  markazi: { ar: [485.8, 224.1, 182.6, 303.2, 224.1], '': [596.7, 224.1, 189.4, 407.2, 224.1] },
  amiri: { ar: [732, 458, 317, 415, 458], '': [732, 458, 317, 415, 458] },
};

/** Strings of several words, as a title or a running head is measured
 *  and set, in a right-to-left and in a left-to-right context. */
const MIXED = ['\u0643\u062A\u0627\u0628 (1)', '\u0643\u062A\u0627\u0628 . \u0643\u062A\u0627\u0628', '\u0643\u062A\u0627\u0628 \u00ABabc\u00BB', '\u00ABabc\u00BB \u0643\u062A\u0627\u0628', '\u0643\u062A\u0627\u0628 \u00AB\u0643\u062A\u0627\u0628\u00BB', '\u0643\u062A\u0627\u0628 46.', '(1) \u0643\u062A\u0627\u0628'];
const MIXED_WIDTHS: Record<Arabic, Record<string, { rtl: number[]; ltr: number[] }>> = {
  markazi: {
    ar: { rtl: [2467.8, 3572.2, 3646.5, 3646.5, 3823.2, 2694.3, 2467.8], ltr: [2467.8, 3572.2, 3646.5, 3646.5, 3927.2, 2694.3, 2467.8] },
    '': { rtl: [2467.8, 3572.2, 3646.5, 3646.5, 4031.2, 2694.3, 2467.8], ltr: [2467.8, 3572.2, 3646.5, 3646.5, 4031.2, 2694.3, 2467.8] },
  },
  amiri: {
    ar: { rtl: [3463, 4347, 4164, 4164, 4568, 3396, 3463], ltr: [3463, 4347, 4274, 4274, 4568, 3396, 3463] },
    '': { rtl: [3463, 4347, 4164, 4164, 4568, 3396, 3463], ltr: [3463, 4347, 4274, 4274, 4568, 3396, 3463] },
  },
};

/** Strings with no character above U+00FF, alone: Latin text. */
const LATIN = ['\u00AB', '\u00BB.', '(1)', '.', '46.', '(d.', '\u00ABabc\u00BB'];
const LATIN_WIDTHS: Record<Arabic, number[]> = {
  markazi: [407.2, 596.7, 776.4, 189.4, 1002.9, 835.4, 1955.1],
  amiri: [470, 672, 1042, 202, 1266, 959, 2259],
};

/** Crimson Pro: the Catalan `l·l`, whose dot is 600 units of 1024 wide
 *  between two `l` in Catalan and 246 anywhere else; and the pieces a
 *  line breaker cuts `instal·lació` into. */
const CATALAN = ['l\u00B7l', 'L\u00B7L', 'col\u00B7legi', 'instal\u00B7laci\u00F3', 'il\u00B7lusi\u00F3', 'COL\u00B7LEGI', 'tal\u00B7', 'la', 'l\u00B7', '\u00B7l', '\u00B7', 'a\u00B7b', 'l\u00B7L', 'paral\u00B7lela'];
const CATALAN_WIDTHS: Record<string, number[]> = {
  ca: [1111.3, 1584.0, 3202.1, 4727.5, 3053.7, 4312.5, 1292.0, 725.6, 502.9, 502.9, 240.2, 1216.8, 1002.0, 4062.5],
  es: [765.6, 1238.3, 2856.4, 4381.8, 2708.0, 3966.8, 1292.0, 725.6, 502.9, 502.9, 240.2, 1216.8, 1002.0, 3716.8],
  '': [765.6, 1238.3, 2856.4, 4381.8, 2708.0, 3966.8, 1292.0, 725.6, 502.9, 502.9, 240.2, 1216.8, 1002.0, 3716.8],
};

const fonts = {} as Record<Face, PDFFont>;
const bytesOf = new Map<PDFFont, Uint8Array>();
beforeAll(async () => {
  await loadComplexShaper();
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  for (const face of Object.keys(FILES) as Face[]) {
    const files: PDFFont[] = [];
    for (const bytes of FILES[face]) {
      const file = await pdf.embedFont(bytes, { subset: true });
      shapeInCurrentLanguage(file);
      bytesOf.set(file, bytes);
      files.push(file);
    }
    // The Cookbook kit's order: the `latin` file first.
    if (files.length > 1) registerFaceFiles(files[0]!, files.slice(1));
    fonts[face] = files[0]!;
  }
});

/** In a document shaped in the language `tag`. */
const inLanguage = <T,>(tag: string, fn: () => T): T => withDocumentLanguage(tag, tag || undefined, fn);
/** HarfBuzz's advance of `text` through the PDF's painter of shaped text,
 *  in a context of direction `base`. */
const painted = (face: Face, text: string, base: 'ltr' | 'rtl'): number => shapedSvgText(fonts[face], text, 1000, base)!.advance;
/** fontkit's, as pdf-lib sets plain text. */
const plain = (face: Face, text: string): number => textAdvancePx(fonts[face], text, 1000).advance;
/** `shapeRun`'s, asked part by part in the script and the language the
 *  painter asks in: `text` is one run of direction `direction`. */
function shapedRun(face: Face, text: string, direction: 'ltr' | 'rtl'): number {
  const language = shapingLanguage() || undefined;
  return withinRightToLeftText(needsComplexShaping(text), () => fileRuns(fonts[face], text, direction === 'rtl').reduce((sum, part) => sum + withBesideLetter(part.beside, () => {
    const script = shapingScriptOf(part.text);
    const run = shapeRun(bytesOf.get(part.font)!, part.text, { direction, ...(language ? { language } : {}), ...(script ? { script } : {}) })!;
    return (run.glyphs.reduce((advance, g) => advance + g.xAdvance, 0) * 1000) / run.upem;
  }), 0));
}
/** Within half a thousandth of the em of Chrome's width. */
const expectWidth = (got: number, chrome: number, what: string): void => expect(Math.abs(got - chrome), `${what}: ${got.toFixed(1)}, Chrome ${chrome}`).toBeLessThan(0.5);

describe('a right-to-left word of a face in several files (#764)', () => {
  it('a mark is shaped in the script of the letter beside it, whatever file draws it', () => {
    for (const face of ARABIC_FACES) {
      for (const tag of LANGUAGES) {
        inLanguage(tag, () => WORDS.forEach((word, i) => {
          const chrome = WORD_WIDTHS[face][tag]![i]!;
          expectWidth(painted(face, word, 'rtl'), chrome, `${face} ${tag} ${word} painted`);
          expectWidth(shapedRun(face, word, 'rtl'), chrome, `${face} ${tag} ${word} shapeRun`);
        }));
      }
    }
  });

  it('Markazi Text sets the guillemet of Arabic text 0.1 em narrower in Arabic, and Amiri no Latin stop in an Arabic word', () => {
    const latinFile = (face: Arabic, text: string, script: string | undefined, language?: string): number => {
      const run = shapeRun(FILES[face][0]!, text, { direction: 'rtl', ...(script ? { script } : {}), ...(language ? { language } : {}) })!;
      return Math.round((run.glyphs.reduce((sum, g) => sum + g.xAdvance, 0) * 1000) / run.upem);
    };
    // The `latin` file of Markazi Text: `arab` has a language system for
    // Arabic, `latn` none.
    expect(latinFile('markazi', '\u00AB', 'Arab', 'ar')).toBe(303);
    expect(latinFile('markazi', '\u00AB', 'Arab')).toBe(407);
    expect(latinFile('markazi', '\u00AB', 'Latn', 'ar')).toBe(407);
    // Amiri's: the Latin forms under `latn` only.
    expect([latinFile('amiri', '.', 'Arab'), latinFile('amiri', '.', undefined), latinFile('amiri', '.', 'Latn')]).toEqual([317, 317, 202]);
    expect([latinFile('amiri', '(', 'Arab'), latinFile('amiri', '(', 'Latn')]).toEqual([458, 255]);
    expect([latinFile('amiri', '\u00AB', 'Arab'), latinFile('amiri', '\u00AB', 'Latn')]).toEqual([415, 470]);
  });

  it('the parts say the letter beside them; a part with a letter, and any part of Latin text, none', () => {
    const parts = (face: Face, text: string, rtl = true): [string, string | undefined][] =>
      fileRuns(fonts[face], text, rtl).map((part) => [part.text, part.beside === undefined ? undefined : String.fromCodePoint(part.beside)]);
    inLanguage('ar', () => {
      expect(parts('amiri', '\u062E\u0627\u0644\u0629.\u00BB')).toEqual([['\u062E\u0627\u0644\u0629', undefined], ['.\u00BB', '\u0629']]);
      expect(parts('amiri', '\u00AB\u0623\u0646\u0627')).toEqual([['\u00AB', '\u0623'], ['\u0623\u0646\u0627', undefined]]);
      expect(parts('markazi', '(\u0648\u064A\u0642\u0627\u0644')).toEqual([['(', '\u0648'], ['\u0648\u064A\u0642\u0627\u0644', undefined]]);
      // Latin text: no character above U+00FF.
      expect(parts('amiri', '\u00ABabc\u00BB', false)).toEqual([['\u00ABabc\u00BB', undefined]]);
      // A word ends at a space: the stop between two takes nothing.
      expect(parts('amiri', '\u0643\u062A\u0627\u0628 . \u0643\u062A\u0627\u0628').map(([, beside]) => beside)).toEqual([undefined, undefined, undefined]);
      expect(besideLetterOf('\u0643\u062A\u0627\u0628 . \u0643\u062A\u0627\u0628', 5, 7)).toBeUndefined();
      expect(besideLetterOf('\u0643\u062A\u0627\u0628 .\u0643\u062A\u0627\u0628', 5, 6)).toBe('\u0643'.codePointAt(0));
      expect(besideLetterOf('\u0643\u062A\u0627\u0628. \u0643\u062A\u0627\u0628', 4, 6)).toBe('\u0628'.codePointAt(0));
      // Not beside an ideograph: the canvas shapes each apart.
      expect(besideLetterOf('\u4E002026', 1, 5)).toBeUndefined();
      // A script in force (#725) is the word's.
      expect(withShapingScript('Arab', () => besideLetterOf('\u062E\u0627\u0644\u0629.\u00BB', 4, 6))).toBeUndefined();
    });
    // A document that keeps the host's language: as before.
    withDocumentLanguage(undefined, 'ar', () => {
      expect(parts('amiri', '\u062E\u0627\u0644\u0629.\u00BB')).toEqual([['\u062E\u0627\u0644\u0629', undefined], ['.\u00BB', undefined]]);
      expect(withBesideLetter(0x629, () => shapingScriptOf('.\u00BB'))).toBeUndefined();
      expect(withBesideLetter(0x629, () => shapingKey('.\u00BB'))).toBe('.\u00BB');
    });
  });

  it('the script of the letter beside a part is in the key of every cache of shaped text', () => {
    inLanguage('ar', () => {
      expect(shapingScriptOf('.\u00BB')).toBe('Latn');
      expect(withBesideLetter(0x629, () => shapingScriptOf('.\u00BB'))).toBe('Arab');
      expect(withBesideLetter(0x5D0, () => shapingScriptOf('.\u00BB'))).toBe('Hebr');
      expect(withBesideLetter(0x629, () => shapingKey('.\u00BB'))).not.toBe(shapingKey('.\u00BB'));
      expect(withBesideLetter(0x629, () => shapingKey('.\u00BB'))).not.toBe(withBesideLetter(0x5D0, () => shapingKey('.\u00BB')));
      // A piece with no letter of a string with right-to-left letters.
      expect(withinRightToLeftText(true, () => shapingScriptOf('(1)'))).toBeUndefined();
      expect(withinRightToLeftText(true, () => shapingScriptOf('abc'))).toBe('Latn');
      expect(withinRightToLeftText(true, () => shapingKey('(1)'))).not.toBe(shapingKey('(1)'));
    });
  });
});

describe('a word with no letter measured in the Arabic script (#725, #764)', () => {
  it('is as wide as beside an Arabic letter, in the document\u2019s language', () => {
    for (const face of ARABIC_FACES) {
      for (const tag of LANGUAGES) {
        inLanguage(tag, () => withShapingScript('Arab', () => SCRIPTED.forEach((word, i) => {
          const chrome = SCRIPTED_WIDTHS[face][tag]![i]!;
          expectWidth(painted(face, word, 'rtl'), chrome, `${face} ${tag} ${word} painted`);
          expectWidth(shapedRun(face, word, 'rtl'), chrome, `${face} ${tag} ${word} shapeRun`);
        })));
      }
    }
  });
});

describe('a string of several words with right-to-left letters (#764)', () => {
  it('each word in the script of its letters, a word with none in no script', () => {
    for (const face of ARABIC_FACES) {
      for (const tag of LANGUAGES) {
        inLanguage(tag, () => MIXED.forEach((text, i) => {
          for (const base of ['rtl', 'ltr'] as const) expectWidth(painted(face, text, base), MIXED_WIDTHS[face][tag]![base][i]!, `${face} ${tag} ${base} ${text}`);
        }));
      }
    }
  });

  it('Latin text alone keeps its Latin forms, by both shapers', () => {
    for (const face of ARABIC_FACES) {
      for (const tag of LANGUAGES) {
        inLanguage(tag, () => LATIN.forEach((text, i) => {
          const chrome = LATIN_WIDTHS[face][i]!;
          expectWidth(plain(face, text), chrome, `${face} ${tag} ${text} fontkit`);
          expectWidth(painted(face, text, 'ltr'), chrome, `${face} ${tag} ${text} painted`);
          expectWidth(shapedRun(face, text, 'ltr'), chrome, `${face} ${tag} ${text} shapeRun`);
        }));
      }
    }
  });
});

describe('the Catalan l\u00B7l of Crimson Pro (#764)', () => {
  it('takes its wide dot between two l in Catalan, by the three shapers', () => {
    for (const tag of ['ca', 'es', '']) {
      inLanguage(tag, () => CATALAN.forEach((text, i) => {
        const chrome = CATALAN_WIDTHS[tag]![i]!;
        expectWidth(plain('crimson', text), chrome, `${tag} ${text} fontkit`);
        expectWidth(painted('crimson', text, 'ltr'), chrome, `${tag} ${text} painted`);
        expectWidth(shapedRun('crimson', text, 'ltr'), chrome, `${tag} ${text} shapeRun`);
      }));
    }
  });

  it('the pieces of a word shaped apart are not the word: the dot needs both its neighbours', () => {
    inLanguage('ca', () => {
      const whole = plain('crimson', 'instal\u00B7laci\u00F3');
      const pieces = ['ins', 'tal\u00B7', 'la', 'ci\u00F3'].reduce((sum, piece) => sum + plain('crimson', piece), 0);
      // 600 - 246 units of 1024.
      expect(whole - pieces).toBeCloseTo((354 / 1024) * 1000, 0);
    });
  });
});
