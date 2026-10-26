import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { clearMeasurementCache } from '../measure/index.js';
import { setMeasureLanguage } from '../measure/canvas.js';
import { measureRichBlock } from '../measure/rich.js';
import { setHyphenationLocale } from '../hyphenation/hyphenate.js';
import type { MeasureBlockOptions } from '../measure/types.js';
import type { VDTLine, VDTLineSegment } from '../vdt.js';

// #770, round 2: the two halves of a word broken at a line end. In a
// paragraph cut word by word a piece of a word was as wide as the word
// grew by it, so the rest that opens the next line was the whole word
// less what stayed above: whatever the face draws across the break (the
// wide dot of a Catalan `l·l`, a ligature, a kerned pair) stayed in a box
// nothing paints it in. A document shaped in its own language measures
// each half as the text painted; one that keeps the host's language keeps
// the widths it had.

const SHY = '­';
const DOT = '·';
const sizeOf = (font: string): number => parseFloat(/(\d*\.?\d+)px/.exec(font)?.[1] ?? '10');

/**
 * The advance of `text` in a face that draws across its letters, px at
 * 10 px: every letter 5; a space 2.5; a hyphen 3; a full stop 2. `Punt`
 * (as Crimson Pro) sets the middle dot 6 between two `l` in Catalan and
 * 2.5 anywhere else. `Lliga` (as Lora) sets it 2.5 and ligates `l·`,
 * 1.3 narrower. Both: `ff` a ligature 2 narrower, `fi` one 1 narrower,
 * `yo` kerned 1, `o.` kerned 0.5, `-y` kerned 0.4.
 */
function faceWidth(text: string, font: string, lang: string): number {
  const catalan = lang.toLowerCase().split('-')[0] === 'ca';
  const lliga = font.includes('Lliga');
  const chars = Array.from(text);
  let px = 0;
  chars.forEach((ch, i) => {
    const prev = chars[i - 1];
    const next = chars[i + 1];
    if (ch === ' ' || ch === ' ') px += 2.5;
    else if (ch === '-') px += 3;
    else if (ch === '.') px += 2;
    else if (ch === DOT) px += !lliga && catalan && prev === 'l' && next === 'l' ? 6 : 2.5;
    else if (ch.codePointAt(0)! >= 0x2E80) px += 10;
    else px += 5;
    const pair = `${prev ?? ''}${ch}`;
    if (pair === 'ff') px -= 2;
    if (pair === 'fi') px -= 1;
    if (pair === 'yo') px -= 1;
    if (pair === 'o.') px -= 0.5;
    if (pair === '-y') px -= 0.4;
    if (lliga && pair === `l${DOT}`) px -= 1.3;
  });
  return (px * sizeOf(font)) / 10;
}

/** The language of the page the layout runs on: what a context left at
 *  `inherit` measures in. */
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

const PUNT = '10px Punt';
const LLIGA = '10px Lliga';
const HYPHEN = 3;
/** The width of `text` painted alone in `lang`, to a thousandth. */
const ink = (text: string, lang: string, font = PUNT): number => faceWidth(text, font, lang);
const round = (n: number): number => Math.round(n * 1000) / 1000;

type Mode = { language: string | undefined; locale: string };
const DOCUMENT_CA: Mode = { language: 'ca', locale: 'ca' };
const HOST_CA: Mode = { language: undefined, locale: 'ca' };
const DOCUMENT_EN: Mode = { language: 'en', locale: 'en-us' };
const HOST_EN: Mode = { language: undefined, locale: 'en-us' };

/** The two breakers: line by line, and Knuth–Plass on a justified text. */
const GREEDY: MeasureBlockOptions = { textAlign: 'left', hyphenate: true };
const OPTIMAL: MeasureBlockOptions = { textAlign: 'justify', hyphenate: true, optimal: true };

function lay(text: string, width: number, mode: Mode, options: MeasureBlockOptions, font = PUNT): VDTLine[] {
  setHyphenationLocale(mode.locale as never);
  setMeasureLanguage(mode.language);
  return measureRichBlock([{ text, bold: false, italic: false }], font, font, font, font, width, 14, options).lines;
}
const words = (line: VDTLine): VDTLineSegment[] => (line.segments ?? []).filter((s) => s.kind === 'text');
/** The text pieces a line carries, each with its width to a thousandth. */
const pieces = (line: VDTLine): [string, number][] => words(line).map((s) => [s.text, round(s.width)]);
/** The pieces a line opens with up to its first space, joined: the rest
 *  of the word broken at the line before, and its width. */
function opening(line: VDTLine): [string, number] {
  let text = '';
  let width = 0;
  for (const s of line.segments ?? []) {
    if (s.kind === 'space') break;
    text += s.text;
    width += s.width;
  }
  return [text, round(width)];
}
/** The pieces a line ends on, back to its last space, joined. */
function closing(line: VDTLine): [string, number] {
  const segs = line.segments ?? [];
  let text = '';
  let width = 0;
  for (let i = segs.length - 1; i >= 0 && segs[i]!.kind !== 'space'; i--) {
    text = segs[i]!.text + text;
    width += segs[i]!.width;
  }
  return [text, round(width)];
}

beforeEach(() => {
  host = 'en';
  clearMeasurementCache();
});
afterEach(() => {
  setMeasureLanguage(undefined);
  setHyphenationLocale('en-us');
});

describe.each([['line by line', GREEDY], ['Knuth–Plass', OPTIMAL]])('a word broken at a line end, %s', (_name, options) => {
  it('the rest of a Catalan word broken inside its l·l is as wide as the text painted', () => {
    // `instal·lar` is 51 px whole in Catalan (the dot 6 px between its two
    // `l`) and `instal·` 32.5 px: the rest was 18.5 px for `lar`, 15 px.
    const text = `aa instal${DOT}lar bb cc`;
    const own = lay(text, 47, DOCUMENT_CA, options);
    expect(own.map((l) => l.text)).toEqual(['aa instal-', 'lar bb cc']);
    expect(opening(own[1]!)).toEqual(['lar', ink('lar', 'ca')]);
    expect(opening(own[1]!)[1]).toBe(15);
    // On a Catalan page a document that keeps the host's language is
    // measured in Catalan too, and keeps the rest it had: what the word
    // grew by, the wide dot in it.
    host = 'ca';
    clearMeasurementCache();
    const kept = lay(text, 47, HOST_CA, options);
    expect(kept.map((l) => l.text)).toEqual(['aa instal-', 'lar bb cc']);
    expect(opening(kept[1]!)).toEqual(['lar', 18.5]);
  });

  it('the breaker counts the rest at the width painted: a line it fits is set', () => {
    // `lar bb cc dd` is 52.5 px as painted and fits a measure of 54; with
    // the rest at 18.5 px it was 56 px, and `dd` went down.
    const text = `aa instal${DOT}lar bb cc dd`;
    host = 'ca';
    clearMeasurementCache();
    expect(lay(text, 54, DOCUMENT_CA, options).map((l) => l.text)).toEqual(['aa instal-', 'lar bb cc dd']);
    expect(lay(text, 54, HOST_CA, options).length).toBeGreaterThan(2);
  });

  it('a ligature undone by the break is not kept in the rest', () => {
    // `office` 27 px (ffi), `of` 10: the rest was 17 px for `fice`, 19 px.
    const text = `aa of${SHY}fice bb`;
    const own = lay(text, 27, DOCUMENT_EN, options);
    expect(own.map((l) => l.text)).toEqual(['aa of-', 'fice', 'bb']);
    expect(opening(own[1]!)).toEqual(['fice', 19]);
    expect(closing(own[0]!)).toEqual(['of-', ink('of', 'en') + HYPHEN]);
    const host = lay(text, 27, HOST_EN, options);
    expect(host.map((l) => l.text)).toEqual(['aa of-', 'fice', 'bb']);
    expect(opening(host[1]!)).toEqual(['fice', 17]);
    expect(closing(host[0]!)).toEqual(['of-', 13]);
  });

  it('the head of a break inside an l·l is the text before the dot and its hyphen', () => {
    // Lliga ligates `l·`: `col·` is 16.2 px and the dot alone 2.5, so the
    // head was 13.7 px and its hyphen for `col`, 15 px.
    const text = `aa col${DOT}lecció bb`;
    const own = lay(text, 32, DOCUMENT_CA, options, LLIGA);
    expect(own[0]!.text).toBe('aa col-');
    expect(closing(own[0]!)).toEqual(['col-', ink('col', 'ca', LLIGA) + HYPHEN]);
    expect(closing(own[0]!)[1]).toBe(18);
    const host = lay(text, 32, HOST_CA, options, LLIGA);
    expect(host[0]!.text).toBe('aa col-');
    expect(closing(host[0]!)[1]).toBe(16.7);
  });

  it('the pieces of the rest are as wide as that rest grows by them', () => {
    // `official` broken after `of`: the next line opens with `ficial`,
    // 29 px, whose `fi` is 9 px (7 px as a piece of `offi`).
    const text = `aa of${SHY}fi${SHY}cial bb`;
    const own = lay(text, 31, DOCUMENT_EN, options);
    expect(own.map((l) => l.text)).toEqual(['aa of-', 'ficial', 'bb']);
    expect(opening(own[1]!)).toEqual(['ficial', ink('ficial', 'en')]);
    if (options.optimal) expect(pieces(own[1]!)).toEqual([['fi', 9], ['cial', 20]]);
    const host = lay(text, 31, HOST_EN, options);
    expect(opening(host[1]!)).toEqual(['ficial', 27]);
    if (options.optimal) expect(pieces(host[1]!)).toEqual([['fi', 7], ['cial', 20]]);
  });

  it('a rest that breaks again: the line it leaves is its own text and a hyphen', () => {
    // `efficient` over three lines: `ef-`, `fi-`, `cient`. The middle one
    // was 7 px and a hyphen (what `effi` grew by after `ef`), for `fi`, 9.
    const text = `aa ef${SHY}fi${SHY}cient bb`;
    const own = lay(text, 26, DOCUMENT_EN, options);
    expect(own.map((l) => l.text)).toEqual(['aa ef-', 'fi-', 'cient', 'bb']);
    expect(closing(own[1]!)).toEqual(['fi-', ink('fi', 'en') + HYPHEN]);
    expect(opening(own[2]!)).toEqual(['cient', 25]);
    const host = lay(text, 26, HOST_EN, options);
    expect(host.map((l) => l.text)).toEqual(['aa ef-', 'fi-', 'cient', 'bb']);
    expect(closing(host[1]!)).toEqual(['fi-', 10]);
  });

  it('the rest of an address divided at a joint', () => {
    // `www.oo.oo.oo` cut before its second dot: the pair `o.` is kerned
    // 0.5 px, and the rest was that much narrower than `.oo.oo` alone.
    const text = 'aa www.oo.oo.oo';
    const own = lay(text, 40, DOCUMENT_EN, options);
    expect(own.map((l) => l.text)).toEqual(['aa www.oo', '.oo.oo']);
    expect(opening(own[1]!)).toEqual(['.oo.oo', ink('.oo.oo', 'en')]);
    expect(opening(own[1]!)[1]).toBe(23.5);
    const host = lay(text, 40, HOST_EN, options);
    expect(opening(host[1]!)).toEqual(['.oo.oo', 23]);
  });

  it('a compound that repeats its hyphen: the rest is measured with it', () => {
    const text = 'aa yoyo-yoyo bb';
    const repeat = { ...options, repeatHyphen: true };
    const own = lay(text, 36, DOCUMENT_EN, repeat);
    expect(own.map((l) => l.text)).toEqual(['aa yoyo-', '-yoyo bb']);
    expect(opening(own[1]!)).toEqual(['-yoyo', round(ink('-yoyo', 'en'))]);
    expect(closing(own[0]!)).toEqual(['yoyo-', ink('yoyo-', 'en')]);
  });

  it('a word that stays on its line keeps the pieces it had: they add up to the word', () => {
    const text = `An of${SHY}fice and an of${SHY}fi${SHY}cial`;
    for (const mode of [DOCUMENT_EN, HOST_EN]) {
      const lines = lay(text, 400, mode, options);
      expect(lines).toHaveLength(1);
      const all = pieces(lines[0]!);
      if (options.optimal) expect(all).toEqual([['An', 10], ['of', 10], ['fice', 17], ['and', 15], ['an', 10], ['of', 10], ['fi', 7], ['cial', 20]]);
      else expect(all).toEqual([['An', 10], ['office', 27], ['and', 15], ['an', 10], ['official', 37]]);
    }
  });
});

describe('a word wider than its line', () => {
  it('is divided, and what is left is measured from the cut on', () => {
    // No syllable here: the word is cut at the last character that fits,
    // between a `y` and the `o` it is kerned to.
    const lines = lay('oyoyoyoyoy', 22.5, DOCUMENT_EN, { textAlign: 'left', hyphenate: false });
    expect(lines.length).toBeGreaterThan(1);
    for (let i = 0; i < lines.length; i++) {
      const [text, width] = closing(lines[i]!);
      const body = lines[i]!.hyphenated && text.endsWith('-') ? text.slice(0, -1) : text;
      expect([text, width]).toEqual([text, round(ink(body, 'en') + (body === text ? 0 : HYPHEN))]);
    }
    expect(lines.map((l) => closing(l))).toEqual([['oyoy-', 22], ['oy-', 13], ['oyoy', 19]]);
    // In the host's language the rest is the word less its head: the pair
    // kerned across each cut stays in it, and the last line is 1 px short
    // of the text it paints for each of the two cuts.
    const host = lay('oyoyoyoyoy', 22.5, HOST_EN, { textAlign: 'left', hyphenate: false });
    expect(host.map((l) => closing(l))).toEqual([['oyoy-', 22], ['oy-', 13], ['oyoy', 17]]);
  });

  it('an address in a Chinese paragraph, cut at a joint by the composer', () => {
    const text = '中文 www.oo.oo.oo 中文';
    const own = lay(text, 52, { language: 'zh-Hans', locale: 'en-us' }, { textAlign: 'left' });
    const at = own.findIndex((l) => l.text.startsWith('.oo'));
    expect(at).toBeGreaterThan(0);
    const rest = words(own[at]!)[0]!;
    expect(rest.text.startsWith('.oo')).toBe(true);
    expect(round(rest.width)).toBe(round(ink(rest.text, 'zh-Hans')));
    const host = lay(text, 52, { language: undefined, locale: 'en-us' }, { textAlign: 'left' });
    expect(host.map((l) => l.text)).toEqual(own.map((l) => l.text));
    expect(round(words(host[at]!)[0]!.width)).toBe(round(ink(rest.text, 'en') - 0.5));
  });
});

// A word over three lines: its middle line opens with the rest of the
// first break and ends on a hyphen of its own. Knuth–Plass counts that
// line while it chooses breaks as the rest's shift, the boxes between the
// two cuts and the second break's hyphen, and the line set is the text
// between the cuts measured alone, and its hyphen. The two are one number:
// both leave out what the word draws from the second cut on, so they part
// only where the start of the rest changes the glyphs at the second cut.
// In Chrome 154, over 9 700 such lines in Crimson Pro, Lora, Fira Sans and
// EB Garamond at measures of 40 to 300 pt (Catalan `l·l`, `ffi`, addresses,
// repeated hyphens, a soft hyphen after every letter), the breaker's count,
// the widths written and the text painted were equal to 0.001 px.
//
// Each case here sets the middle line in a measure it fills to a
// thousandth: the breaker takes it when it counts the width set, and may
// not when the measure is that much narrower.
describe.each([['line by line', GREEDY], ['Knuth–Plass', OPTIMAL]])('a word over three lines, %s', (_name, options) => {
  /** The lines with no word space: their boxes, summed, to a thousandth. */
  const oneWordLines = (lines: VDTLine[]): [string, number][] => lines
    .filter((l) => !(l.segments ?? []).some((s) => s.kind === 'space'))
    .map((l) => [l.text, round((l.segments ?? []).reduce((sum, s) => sum + s.width, 0))]);
  /** What a line paints: its text measured alone, the hyphen the layout
   *  added measured apart. */
  const painted = (line: VDTLine, lang: string, font = PUNT): number => {
    const added = line.hyphenated === true && !line.hardHyphen && line.text.endsWith('-');
    const body = added ? line.text.slice(0, -1) : line.text;
    return round(ink(body, lang, font) + (added ? HYPHEN : 0));
  };

  it('the middle line of a word whose ligature the first break undoes fills its measure', () => {
    // `of|ficial|ly`: the middle line paints `ficial` (29 px, its `fi`
    // ligature) and a hyphen, 32 px. As what `official` grew by after
    // `of` it was 27 px and a hyphen.
    const text = `aa of${SHY}ficial${SHY}ly bb`;
    const own = lay(text, 32.001, DOCUMENT_EN, options);
    expect(own.map((l) => l.text)).toEqual(['aa of-', 'ficial-', 'ly bb']);
    expect(closing(own[1]!)).toEqual(['ficial-', 32]);
    expect(pieces(own[1]!)).toEqual([['ficial-', 32]]);
    // A thousandth narrower it does not fit, and nothing set is past the
    // measure.
    const narrow = lay(text, 31.999, DOCUMENT_EN, options);
    expect(narrow.map((l) => l.text)).not.toContain('ficial-');
    for (const [, width] of oneWordLines(narrow)) expect(width).toBeLessThanOrEqual(31.999);
    // The host's language keeps the count it had: 30 px, set in 31.999.
    const host = lay(text, 31.999, HOST_EN, options);
    expect(host.map((l) => l.text)).toEqual(['aa of-', 'ficial-', 'ly bb']);
    expect(closing(host[1]!)).toEqual(['ficial-', 30]);
  });

  it('a middle line that ends inside an l·l: the text before the dot and its hyphen', () => {
    // `ins|tal·|lar` in Catalan: `tal` alone is 15 px, 18 with its hyphen.
    // The word grew by 17.5 px from `ins` to `instal·` (the dot 2.5 px at
    // the end of a text), and the rest after the dot is `lar`, 15 px.
    const text = `instal${DOT}lar`;
    host = 'ca';
    clearMeasurementCache();
    const own = lay(text, 18.001, DOCUMENT_CA, options);
    expect(oneWordLines(own)).toEqual([['ins-', 18], ['tal-', 18], ['lar', 15]]);
    for (const line of own) expect(round((line.segments ?? []).reduce((sum, s) => sum + s.width, 0))).toBe(painted(line, 'ca'));
    clearMeasurementCache();
    const narrow = lay(text, 17.999, DOCUMENT_CA, options);
    for (const [, width] of oneWordLines(narrow)) expect(width).toBeLessThanOrEqual(17.999);
    // A face that ligates `l·` (Lora): the same lines, the same widths.
    clearMeasurementCache();
    const lliga = lay(text, 18.001, DOCUMENT_CA, options, LLIGA);
    expect(oneWordLines(lliga)).toEqual([['ins-', 18], ['tal-', 18], ['lar', 15]]);
  });

  it('a middle line between two hyphens of a compound, the first repeated', () => {
    // `yoyo-yoyo-yoyo`: the middle line paints `-yoyo-`, 23.6 px (the
    // pair `-y` kerned 0.4 px).
    const text = 'yoyo-yoyo-yoyo';
    const repeat = { ...options, repeatHyphen: true };
    const own = lay(text, 23.601, DOCUMENT_EN, repeat);
    expect(oneWordLines(own)).toEqual([['yoyo-', 21], ['-yoyo-', 23.6], ['-yoyo', 20.6]]);
    expect(own.map((l) => round(ink(l.text, 'en')))).toEqual([21, 23.6, 20.6]);
    const narrow = lay(text, 23.599, DOCUMENT_EN, repeat);
    expect(narrow.map((l) => l.text)).not.toContain('-yoyo-');
    for (const [, width] of oneWordLines(narrow)) expect(width).toBeLessThanOrEqual(23.599);
  });

  it('an address over several lines, each longer than the rest is measured from its break', () => {
    // 80 joints, 243 characters: at these measures a line holds more than
    // the 32 characters measured from the break it opens at, and the rest
    // of it is what the whole address grew by from there on.
    const text = `www${'.oo'.repeat(80)}`;
    let longMiddles = 0;
    for (let measure = 190; measure <= 260; measure += 3.5) {
      clearMeasurementCache();
      const lines = lay(text, measure, DOCUMENT_EN, options);
      expect(lines.length).toBeGreaterThan(2);
      expect(lines.map((l) => l.text).join('')).toBe(text);
      lines.forEach((line, i) => {
        const width = round((line.segments ?? []).reduce((sum, s) => sum + s.width, 0));
        expect([line.text, width]).toEqual([line.text, round(ink(line.text, 'en'))]);
        expect(width).toBeLessThanOrEqual(measure);
        if (i > 0 && i < lines.length - 1 && line.text.length > 32) longMiddles++;
      });
    }
    expect(longMiddles).toBeGreaterThan(20);
  });
});
