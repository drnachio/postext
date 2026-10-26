import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearMeasurementCache } from '../measure/index.js';
import { setMeasureLanguage } from '../measure/canvas.js';
import { measureBlock } from '../measure/plain.js';
import { measureRichBlock } from '../measure/rich.js';
import { setHyphenationLocale } from '../hyphenation/hyphenate.js';
import type { MeasureBlockOptions } from '../measure/types.js';
import type { VDTLine } from '../vdt.js';

// #770: one book set the same word two ways. A paragraph with a style in
// it is cut word by word, and a word a line may end inside is measured
// whole, with what the face draws across the places it may break at (the
// Catalan form of `l·l`, a ligature, a kerned pair). A paragraph with no
// formatting went to the text library, which measures each piece of such
// a word alone. In a document shaped in its own language both now take
// the lines of the first; one that keeps the host's language keeps the
// widths it had.

const DOT = '·';
const sizeOf = (font: string): number => parseFloat(/(\d*\.?\d+)px/.exec(font)?.[1] ?? '10');

/**
 * The advance of `text`, px at 10 px, in a face like Crimson Pro: every
 * letter 5; a space 2.5; a hyphen 3; a comma or a stop 2; the middle dot
 * 6 between two `l` in Catalan and 2.5 anywhere else; `ff` a ligature
 * 2 narrower and `fi` one 1 narrower; `yo` kerned 1.
 */
function faceWidth(text: string, font: string, lang: string): number {
  const catalan = lang.toLowerCase().split('-')[0] === 'ca';
  const chars = Array.from(text);
  let px = 0;
  chars.forEach((ch, i) => {
    const prev = chars[i - 1];
    const next = chars[i + 1];
    if (ch === ' ' || ch === ' ') px += 2.5;
    else if (ch === '-') px += 3;
    else if (ch === '.' || ch === ',') px += 2;
    else if (ch === DOT) px += catalan && prev === 'l' && next === 'l' ? 6 : 2.5;
    else if (ch.codePointAt(0)! >= 0x2E80) px += 10;
    else px += 5;
    const pair = `${prev ?? ''}${ch}`;
    if (pair === 'ff') px -= 2;
    if (pair === 'fi') px -= 1;
    if (pair === 'yo') px -= 1;
  });
  return (px * sizeOf(font)) / 10;
}

/** The language of the page the layout runs on. */
let host = 'en';
class MeasureContext {
  font = '10px Punt';
  lang = 'inherit';
  direction = 'ltr';
  measureText(s: string): { width: number } {
    return { width: faceWidth(s, this.font, this.lang === 'inherit' ? host : this.lang) };
  }
}
const globals = globalThis as unknown as { OffscreenCanvas: unknown; OffscreenCanvasRenderingContext2D: unknown };
globals.OffscreenCanvasRenderingContext2D = MeasureContext;
globals.OffscreenCanvas = class {
  getContext(): MeasureContext {
    return new MeasureContext();
  }
};

const FONT = '10px Punt';
const round = (n: number): number => Math.round(n * 1000) / 1000;
const ink = (text: string, lang: string): number => faceWidth(text, FONT, lang);

const JUSTIFIED: MeasureBlockOptions = { textAlign: 'justify', hyphenate: true, optimal: true };
const RAGGED: MeasureBlockOptions = { textAlign: 'left', hyphenate: true };

function plain(text: string, width: number, language: string | undefined, locale: string, options: MeasureBlockOptions) {
  setHyphenationLocale(locale as never);
  setMeasureLanguage(language);
  return measureBlock(text, FONT, width, 14, options);
}
function styled(text: string, width: number, language: string | undefined, locale: string, options: MeasureBlockOptions) {
  setHyphenationLocale(locale as never);
  setMeasureLanguage(language);
  return measureRichBlock([{ text, bold: false, italic: false }], FONT, FONT, FONT, FONT, width, 14, options);
}
/** The word of `line` that holds `part`: its pieces joined, and their widths added. */
function word(lines: VDTLine[], part: string): [string, number] | undefined {
  for (const line of lines) {
    const segs = line.segments ?? [];
    for (let i = 0; i < segs.length;) {
      if (segs[i]!.kind === 'space') { i++; continue; }
      let j = i;
      let text = '';
      let width = 0;
      while (j < segs.length && segs[j]!.kind !== 'space') {
        text += segs[j]!.text;
        width += segs[j]!.width;
        j++;
      }
      if (text.includes(part)) return [text, round(width)];
      i = j;
    }
  }
  return undefined;
}
const texts = (lines: VDTLine[]): string[] => lines.map((l) => l.text);
const shape = (lines: VDTLine[]) => lines.map((l) => ({ text: l.text, width: round(l.bbox.width), segments: (l.segments ?? []).map((s) => [s.text, round(s.width)]) }));

beforeEach(() => {
  host = 'en';
  clearMeasurementCache();
});
afterEach(() => {
  setMeasureLanguage(undefined);
  setHyphenationLocale('en-us');
});

describe.each([['Knuth–Plass', JUSTIFIED], ['line by line', RAGGED]])('a paragraph with no formatting in a document shaped in its own language, %s', (_name, options) => {
  it('measures a Catalan word whole: the form of its l·l is in it', () => {
    // `il·luminació` is 61 px in Catalan (the dot 6 px) and 57.5 px as the
    // pieces `il·`, `lu`, `mi`, `na`, `ció` set one by one (the dot 2.5).
    const text = `aa il${DOT}luminació bb`;
    const own = plain(text, 400, 'ca', 'ca', options);
    expect(word(own.lines, DOT)).toEqual([`il${DOT}luminació`, ink(`il${DOT}luminació`, 'ca')]);
    expect(word(own.lines, DOT)![1]).toBe(61);
    // On a Catalan page a document in its host's language keeps the
    // pieces of the text library: each as wide as it is alone.
    host = 'ca';
    clearMeasurementCache();
    const kept = plain(text, 400, undefined, 'ca', options);
    expect(word(kept.lines, DOT)![1]).toBe(57.5);
  });

  it('sets the lines a paragraph with a style takes for the same text', () => {
    const text = `La instal${DOT}lació de la il${DOT}luminació col${DOT}lectiva fou una il${DOT}lusió paral${DOT}lela del col${DOT}legi, i la pel${DOT}lícula.`;
    for (const width of [60, 75, 90, 120, 400]) {
      const a = plain(text, width, 'ca', 'ca', options);
      const b = styled(text, width, 'ca', 'ca', options);
      expect(shape(a.lines)).toEqual(shape(b.lines));
      expect(a.breaks?.path).toBe(b.breaks?.path);
    }
  });

  it('a ligature across a syllable is kept in a word that stays on its line', () => {
    // `office` 27 px with its `ffi`; `of` and `fice` set apart, 10 and 19.
    const own = plain('An office and an officer', 400, 'en', 'en-us', options);
    expect(word(own.lines, 'office')).toEqual(['office', 27]);
    const kept = plain('An office and an officer', 400, undefined, 'en-us', options);
    expect(word(kept.lines, 'office')).toEqual(['office', 29]);
  });

  it('a word broken at a line end: each half as wide as the text painted', () => {
    const text = `aa instal${DOT}lar bb cc`;
    const own = plain(text, 47, 'ca', 'ca', options);
    expect(texts(own.lines)).toEqual(['aa instal-', 'lar bb cc']);
    expect(word(own.lines.slice(1), 'lar')).toEqual(['lar', ink('lar', 'ca')]);
    expect(word(own.lines.slice(0, 1), 'instal-')).toEqual(['instal-', ink('instal', 'ca') + 3]);
  });

  it('a compound: the pair kerned across its hyphen is in the word', () => {
    // `-y` is no pair here, `yo` is: `yo-yo` is 21 px whole and as pieces.
    const own = plain('a yo-yo b', 400, 'en', 'en-us', { ...options, hyphenate: false });
    expect(word(own.lines, 'yo-yo')).toEqual(['yo-yo', ink('yo-yo', 'en')]);
  });
});

describe('what keeps the text library', () => {
  it('a paragraph no line can end inside a word of', () => {
    const own = plain('aa bb cc dd ee ff gg', 40, 'en', 'en-us', { textAlign: 'justify', optimal: true });
    expect(own.breaks?.path).toBe('plain');
    expect(plain('aa instal bb', 400, 'ca', 'ca', { textAlign: 'justify', optimal: true }).breaks?.path).toBe('plain');
  });

  it('every paragraph of a document shaped in its host\'s language', () => {
    const text = `La instal${DOT}lació de la il${DOT}luminació col${DOT}lectiva fou una il${DOT}lusió.`;
    expect(plain(text, 90, undefined, 'ca', JUSTIFIED).breaks?.path).toBe('plain');
    expect(plain(text, 90, 'ca', 'ca', JUSTIFIED).breaks?.path).toBe('rich');
  });

  it('vertical text', () => {
    // Latin words run sideways down a vertical line, set as they were.
    const text = 'An official office offered an efficient affiliation of officers.';
    expect(plain(text, 90, 'en', 'en-us', JUSTIFIED).breaks?.path).toBe('rich');
    expect(plain(text, 90, 'en', 'en-us', { ...JUSTIFIED, writingMode: 'vertical-rl' }).breaks?.path).toBe('plain');
  });
});
