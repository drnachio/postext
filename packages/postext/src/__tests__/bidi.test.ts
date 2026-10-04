import { describe, expect, it } from 'vitest';
// @ts-expect-error -- a Node built-in: the package compiles without @types/node.
import { readFileSync, existsSync } from 'node:fs';
import {
  BIDI_CLASS_NAMES,
  bidiClassOf,
  hasJoiningScript,
  isRtlScriptChar,
  joiningTypeOf,
  joinsLetters,
  joinsWithNext,
  lineLevels,
  lineRuns,
  lineVisualOrder,
  mirroredChar,
  needsBidi,
  resolveClasses,
  resolveParagraph,
  resolveSpans,
  spanIsolates,
  visualOrder,
  type BidiClass,
} from '../bidi';
import { parseInlineFormatting } from '../parse/inlineFormatting';

// The conformance files of the Unicode Character Database. The fixtures are
// deterministic subsets written by scripts/gen-bidi-data.mjs (the full files
// are 15 MB; the head of each subset says what it keeps); set
// POSTEXT_UCD_DIR to a directory holding the full BidiCharacterTest.txt and
// BidiTest.txt to run every case.
const UCD = (globalThis as unknown as { process: { env: Record<string, string | undefined> } }).process.env.POSTEXT_UCD_DIR;
function conformanceFile(name: string, subset: string): string {
  const full = UCD ? `${UCD.replace(/\/$/, '')}/${name}` : '';
  const read = readFileSync as (path: string | URL, encoding: 'utf8') => string;
  return read(full && (existsSync as (p: string) => boolean)(full) ? full : new URL(`./fixtures/bidi/${subset}`, import.meta.url), 'utf8');
}

/** Visual order of a line with the characters X9 removes left out, as the
 *  conformance files list it. */
function orderWithout(levels: ArrayLike<number>, removed: (i: number) => boolean): number[] {
  const keep: number[] = [];
  for (let i = 0; i < levels.length; i++) if (!removed(i)) keep.push(i);
  const kept = keep.map((i) => levels[i]!);
  return visualOrder(kept).map((k) => keep[k]!);
}

describe('BidiCharacterTest.txt', () => {
  const lines = conformanceFile('BidiCharacterTest.txt', 'BidiCharacterTest-subset.txt').split('\n');
  const cases = lines.filter((l) => l.trim() !== '' && !l.startsWith('#'));

  it('has cases', () => {
    expect(cases.length).toBeGreaterThan(1000);
  });

  it('resolves the levels and the order of every case', () => {
    const failures: string[] = [];
    for (const line of cases) {
      const [cpsField, dirField, parLevelField, levelsField, orderField] = line.split(';');
      const cps = cpsField!.trim().split(/\s+/).map((h) => parseInt(h, 16));
      const text = String.fromCodePoint(...cps);
      const base = dirField!.trim() === '0' ? 'ltr' : dirField!.trim() === '1' ? 'rtl' : 'auto';
      const par = resolveParagraph(text, base);
      const want = levelsField!.trim().split(/\s+/);
      const wantOrder = orderField!.trim() === '' ? [] : orderField!.trim().split(/\s+/).map(Number);
      // Code point index → first UTF-16 unit.
      const unitOf: number[] = [];
      let u = 0;
      for (const cp of cps) {
        unitOf.push(u);
        u += cp > 0xFFFF ? 2 : 1;
      }
      const lv = lineLevels(par);
      const got = cps.map((_, k) => (want[k] === 'x' ? 'x' : String(lv[unitOf[k]!])));
      const cpLevels = cps.map((_, k) => lv[unitOf[k]!]!);
      const order = orderWithout(cpLevels, (k) => want[k] === 'x');
      if (String(par.paragraphLevel) !== parLevelField!.trim() || got.join(' ') !== want.join(' ') || order.join(' ') !== wantOrder.join(' ')) {
        failures.push(`${line}\n   got ${par.paragraphLevel}; ${got.join(' ')}; ${order.join(' ')}`);
      }
    }
    expect(failures.slice(0, 10)).toEqual([]);
  });
});

describe('BidiTest.txt', () => {
  const text = conformanceFile('BidiTest.txt', 'BidiTest-subset.txt');

  it('resolves the levels and the order of every class sequence', () => {
    let levels: string[] = [];
    let order: string[] = [];
    let count = 0;
    const failures: string[] = [];
    for (const raw of text.split('\n')) {
      const line = raw.trim();
      if (line === '' || line.startsWith('#')) continue;
      if (line.startsWith('@Levels:')) {
        levels = line.slice(8).trim().split(/\s+/).filter(Boolean);
        continue;
      }
      if (line.startsWith('@Reorder:')) {
        order = line.slice(9).trim().split(/\s+/).filter(Boolean);
        continue;
      }
      const [seqField, bitsField] = line.split(';');
      const names = seqField!.trim().split(/\s+/) as BidiClass[];
      const cls = new Uint8Array(names.map((n) => BIDI_CLASS_NAMES.indexOf(n)));
      const bits = Number(bitsField!.trim());
      for (const [bit, base] of [[1, -1], [2, 0], [4, 1]] as const) {
        if (!(bits & bit)) continue;
        count++;
        const { levels: lv, paragraphLevel } = resolveClasses(cls, base, null, null);
        const par = { text: '', paragraphLevel, levels: lv, classes: cls };
        const line1 = lineLevels(par);
        const got = names.map((_, k) => (levels[k] === 'x' ? 'x' : String(line1[k])));
        const gotOrder = orderWithout(line1, (k) => levels[k] === 'x');
        if (got.join(' ') !== levels.join(' ') || gotOrder.join(' ') !== order.join(' ')) {
          failures.push(`${names.join(' ')} (${base}): ${got.join(' ')} / ${gotOrder.join(' ')}; want ${levels.join(' ')} / ${order.join(' ')}`);
        }
      }
    }
    expect(count).toBeGreaterThan(1000);
    expect(failures.slice(0, 10)).toEqual([]);
  });
});

describe('character data', () => {
  it('reads Bidi_Class', () => {
    expect(bidiClassOf(0x41)).toBe('L');
    expect(bidiClassOf(0x5D0)).toBe('R'); // א
    expect(bidiClassOf(0x627)).toBe('AL'); // ا
    expect(bidiClassOf(0x661)).toBe('AN'); // ١
    expect(bidiClassOf(0x6F1)).toBe('EN'); // ۱ (Persian digits are European numbers)
    expect(bidiClassOf(0x64B)).toBe('NSM'); // fathatan
    expect(bidiClassOf(0x2067)).toBe('RLI');
    expect(bidiClassOf(0x20AC)).toBe('ET');
    // Unassigned code points in right-to-left blocks default to R / AL.
    expect(bidiClassOf(0x7FF + 0x1)).not.toBe('L');
    expect(bidiClassOf(0x1EE00)).toBe('AL');
    expect(bidiClassOf(0x1F600)).toBe('ON');
  });

  it('tells right-to-left letters', () => {
    expect(isRtlScriptChar(0x627)).toBe(true);
    expect(isRtlScriptChar(0x5D0)).toBe(true);
    expect(isRtlScriptChar(0x710)).toBe(true); // Syriac
    expect(isRtlScriptChar(0x661)).toBe(false); // a digit
    expect(isRtlScriptChar(0x41)).toBe(false);
  });

  it('mirrors brackets and relations, not the Quranic ornate parentheses', () => {
    expect(mirroredChar('(')).toBe(')');
    expect(mirroredChar('«')).toBe('»');
    expect(mirroredChar('≤')).toBe('≥');
    expect(mirroredChar('a')).toBe('a');
    expect(mirroredChar('ab')).toBe('ab');
    expect(mirroredChar('﴾')).toBe('﴾');
    expect(mirroredChar('﴿')).toBe('﴿');
  });

  it('reads Joining_Type', () => {
    expect(joiningTypeOf(0x628)).toBe('D'); // ب
    expect(joiningTypeOf(0x627)).toBe('R'); // ا
    expect(joiningTypeOf(0x640)).toBe('C'); // tatweel
    expect(joiningTypeOf(0x64E)).toBe('T'); // fatha
    expect(joiningTypeOf(0x621)).toBe('U'); // hamza
    expect(joiningTypeOf(0x41)).toBe('U');
    expect(joiningTypeOf(0x301)).toBe('T'); // combining acute: every Mn is transparent
  });

  it('tells joining letters', () => {
    expect(joinsLetters('بيت')).toBe(true);
    // Right-joining letters never join the letter after them.
    expect(joinsLetters('دار')).toBe(false);
    expect(joinsLetters('دار ورد')).toBe(false);
    // Harakat between two letters do not break the join.
    expect(joinsLetters('بَت')).toBe(true);
    expect(joinsWithNext('بَت', 0)).toBe(true);
    expect(joinsWithNext('بَت', 2)).toBe(false);
    expect(joinsWithNext('اب', 0)).toBe(false);
    expect(joinsLetters('abc')).toBe(false);
    expect(joinsLetters('‍‍')).toBe(false);
    expect(hasJoiningScript('word دار')).toBe(true);
    expect(hasJoiningScript('emoji \u{1F469}‍\u{1F4BB}')).toBe(false);
    expect(hasJoiningScript('שלום')).toBe(false);
  });

  it('gates the algorithm', () => {
    expect(needsBidi('plain English, 12 (and) «more»')).toBe(false);
    expect(needsBidi('Arabic-Indic ١٢٣ digits')).toBe(false);
    expect(needsBidi('one word: كتاب')).toBe(true);
    expect(needsBidi('override ‮abc')).toBe(true);
    expect(needsBidi('\u{10800}')).toBe(true); // Cypriot, astral R
  });
});

describe('paragraphs and lines', () => {
  /** The characters of a line in visual order. */
  const visual = (text: string, base: 'ltr' | 'rtl' | 'auto' = 'auto'): string => {
    const par = resolveParagraph(text, base);
    return lineVisualOrder(par).map((i) => String.fromCodePoint(text.codePointAt(i)!)).join('');
  };

  it('takes the base direction from the first strong letter', () => {
    expect(resolveParagraph('كتاب ABC').paragraphLevel).toBe(1);
    expect(resolveParagraph('ABC كتاب').paragraphLevel).toBe(0);
    expect(resolveParagraph('123 ...').paragraphLevel).toBe(0);
    // Letters inside an isolate do not decide it.
    expect(resolveParagraph('⁧كتاب⁩ ABC').paragraphLevel).toBe(0);
    expect(resolveParagraph('ABC', 'rtl').paragraphLevel).toBe(1);
  });

  it('orders a Latin word inside Arabic', () => {
    // In an RTL paragraph the Arabic word is at the right; the Latin word
    // and the number after it (W7: a number after a Latin letter is Latin)
    // make one left-to-right run; the final stop is at the left.
    expect(visual('كتاب ABC 12.', 'rtl')).toBe('.ABC 12 باتك');
    // After an Arabic word the number is a run of its own.
    expect(visual('ABC كتاب 12.', 'rtl')).toBe('.12 باتك ABC');
  });

  it('keeps an Arabic number in its order', () => {
    expect(visual('ص ١٢٣', 'rtl')).toBe('١٢٣ ص');
  });

  it('resolves paired brackets to the enclosing direction', () => {
    // N0: the brackets round a Latin word in Arabic text take the Arabic
    // direction, so they mirror (painted with mirroredChar).
    const text = 'كتاب (ABC) كتاب';
    const par = resolveParagraph(text, 'rtl');
    expect(par.levels[5]).toBe(1);
    expect(par.levels[9]).toBe(1);
    expect(par.levels[6]).toBe(2);
  });

  it('leaves the ornate parentheses to the neutral rules', () => {
    const text = 'قال ﴿بسم﴾ X';
    const par = resolveParagraph(text, 'rtl');
    expect(par.levels[4]).toBe(1);
    expect(par.levels[8]).toBe(1);
  });

  it('applies L1 to trailing spaces', () => {
    const text = 'ABC كتاب  ';
    const par = resolveParagraph(text, 'ltr');
    const lv = lineLevels(par);
    expect(Array.from(lv)).toEqual([0, 0, 0, 0, 1, 1, 1, 1, 0, 0]);
    // A line cut inside the paragraph: the space at its end goes back to the
    // paragraph level as well.
    const line = lineLevels(resolveParagraph('كتاب كتاب ABC', 'ltr'), 0, 5);
    expect(Array.from(line)).toEqual([1, 1, 1, 1, 0]);
  });

  it('keeps surrogate pairs together', () => {
    const text = 'א\u{1F600}ב';
    const par = resolveParagraph(text, 'rtl');
    expect(par.levels[1]).toBe(par.levels[2]);
    expect(lineVisualOrder(par)).toEqual([3, 1, 0]);
  });

  it('cuts a line into runs in visual order', () => {
    const text = 'ABC كتاب DEF';
    const runs = lineRuns(resolveParagraph(text, 'ltr'));
    expect(runs.map((r) => [text.slice(r.start, r.end), r.level])).toEqual([['ABC ', 0], ['كتاب', 1], [' DEF', 0]]);
    const rtl = lineRuns(resolveParagraph(text, 'rtl'));
    expect(rtl.map((r) => [text.slice(r.start, r.end), r.level])).toEqual([['DEF', 2], [' كتاب ', 1], ['ABC', 2]]);
  });

  it('orders segments by their levels', () => {
    expect(visualOrder([0, 1, 1, 0])).toEqual([0, 2, 1, 3]);
    expect(visualOrder([1, 2, 2, 1])).toEqual([3, 1, 2, 0]);
    expect(visualOrder([])).toEqual([]);
  });

  it('isolates stretches given as ranges', () => {
    // An English title with a number inside Arabic: without the isolate the
    // number after it would join the Arabic run.
    const text = 'قرأت Moby Dick 2 مرتين';
    const plain = resolveParagraph(text, 'rtl');
    const isolated = resolveParagraph(text, 'rtl', [{ start: 5, end: 14, direction: 'ltr' }]);
    expect(Array.from(isolated.levels.slice(5, 14))).toEqual([2, 2, 2, 2, 2, 2, 2, 2, 2]);
    expect(isolated.levels[15]).toBe(2);
    expect(plain.levels[9]).toBe(2);
    // The same as writing the controls in the text.
    const controls = resolveParagraph('قرأت ⁦Moby Dick⁩ 2 مرتين', 'rtl');
    expect(controls.levels[17]).toBe(isolated.levels[15]);
  });
});

describe('inline isolates', () => {
  it('parses :rtl[…] and :ltr[…] into span directions', () => {
    const spans = parseInlineFormatting('The word :rtl[كتاب]{lang=ar} means book.');
    expect(spans.map((s) => s.text).join('')).toBe('The word كتاب means book.');
    const iso = spans.find((s) => s.direction);
    expect(iso?.text).toBe('كتاب');
    expect(iso?.direction).toMatchObject({ dir: 'rtl', lang: 'ar' });
  });

  it('nests isolates and keeps marks inside them', () => {
    const spans = parseInlineFormatting(':ltr[Read **:rtl[كتاب]** now]');
    const inner = spans.find((s) => s.direction?.dir === 'rtl')!;
    expect(inner.bold).toBe(true);
    expect(inner.direction!.outer?.dir).toBe('ltr');
    const isolates = spanIsolates(spans);
    expect(isolates).toEqual([
      { start: 0, end: 13, direction: 'ltr' },
      { start: 5, end: 9, direction: 'rtl' },
    ]);
  });

  it('resolves a paragraph from its spans', () => {
    const spans = parseInlineFormatting('قرأت :ltr[Moby Dick] 2 مرتين');
    const par = resolveSpans(spans, 'rtl');
    expect(par.text).toBe('قرأت Moby Dick 2 مرتين');
    expect(par.levels[15]).toBe(2);
    expect(Array.from(par.levels.slice(5, 14)).every((l) => l === 2)).toBe(true);
  });

  it('keeps two isolates side by side apart', () => {
    const spans = parseInlineFormatting(':ltr[AB]:ltr[CD]');
    expect(spanIsolates(spans)).toEqual([
      { start: 0, end: 2, direction: 'ltr' },
      { start: 2, end: 4, direction: 'ltr' },
    ]);
  });
});
