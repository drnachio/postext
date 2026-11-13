import { describe, it, expect, afterEach } from 'vitest';
import { buildDocument } from '../../pipeline/index.js';
import { createMeasurementCache, type MeasurementCache } from '../../measure/index.js';
import { measureRichBlock } from '../../measure/rich.js';
import { hyphenateText, setHyphenationLocale, setHyphenationRules, withHyphenationLanguage, dictionaryInForce } from '../../hyphenation/hyphenate.js';
import type { InlineSpan } from '../../parse/index.js';
import type { PostextConfig, VDTDocument } from '../../index.js';

// A passage marked with another language (#1547) divides its words with
// that language's dictionary and its list of words kept whole: a French
// run (`:ltr[…]{lang=fr}`) or container (`:::paragraphs{lang=fr}`) inside
// a Spanish text, in a left-to-right and in a right-to-left book. A
// language with no patterns divides no word.

// Every printed character, the space included, is 7 px wide.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: [...s].filter((c) => c !== '­' && c !== '​').length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const SOFT = '­';
// Spanish patterns: phi-lo-sop-hi-que; French: phi-lo-so-phique.
const WORD = 'philosophique';
const SPANISH_ONLY = ['philosop-', 'philosophi-'];
const FRENCH_ONLY = ['philoso-'];
const TEXT = `Le mot ${WORD} revient: ${WORD}, ${WORD} et ${WORD} encore.`;

afterEach(() => {
  setHyphenationLocale('en-us');
  setHyphenationRules();
});

/** The heads of WORD that end a line with a hyphen. */
const heads = (lines: readonly { text: string }[]): Set<string> => {
  const out = new Set<string>();
  for (const l of lines) {
    const m = /(\S+)-$/.exec(l.text.trimEnd());
    if (m && WORD.startsWith(m[1]!.replace(/^\p{P}+/u, ''))) out.add(`${m[1]!.replace(/^\p{P}+/u, '')}-`);
  }
  return out;
};

describe('the dictionary of a passage (#1547)', () => {
  it('switches to the passage language and back, nested too', () => {
    setHyphenationLocale('es');
    expect(hyphenateText(WORD).split(SOFT)).toEqual(['phi', 'lo', 'sop', 'hi', 'que']);
    expect(withHyphenationLanguage('fr-CA', () => hyphenateText(WORD).split(SOFT))).toEqual(['phi', 'lo', 'so', 'phique']);
    // Spanish of another region keeps the text's dictionary.
    expect(withHyphenationLanguage('es-MX', () => dictionaryInForce())).toBe('es');
    // Nested: a Spanish run inside a French passage.
    withHyphenationLanguage('fr', () => {
      expect(dictionaryInForce()).toBe('fr');
      expect(withHyphenationLanguage('es', () => dictionaryInForce())).toBe('es');
      expect(dictionaryInForce()).toBe('fr');
    });
    expect(dictionaryInForce()).toBe('es');
  });

  it('divides no word in a language with no patterns, unless it is the text\'s own', () => {
    setHyphenationLocale('es');
    expect(withHyphenationLanguage('el', () => hyphenateText(WORD))).toBe(WORD);
    expect(withHyphenationLanguage('el', () => dictionaryInForce())).toBeNull();
    // A Greek book is hyphenated with the English patterns: a passage in
    // Greek keeps them.
    setHyphenationLocale('el');
    expect(withHyphenationLanguage('el-GR', () => dictionaryInForce())).toBe('en-us');
  });

  it('applies the list of words kept whole of the passage\'s language', () => {
    setHyphenationLocale('es');
    setHyphenationRules({ exceptionsByLanguage: { fr: [WORD] } });
    expect(hyphenateText(WORD)).toContain(SOFT);
    expect(withHyphenationLanguage('fr', () => hyphenateText(WORD))).toBe(WORD);
    setHyphenationRules({ exceptionsByLanguage: { es: [WORD] } });
    expect(hyphenateText(WORD)).toBe(WORD);
    expect(withHyphenationLanguage('fr', () => hyphenateText(WORD))).toContain(SOFT);
  });

  it('sets a French run of a Spanish paragraph with the French syllables (left to right)', () => {
    setHyphenationLocale('es');
    const run = (lang?: string): InlineSpan[] => [{ text: TEXT, bold: false, italic: false, ...(lang ? { direction: { dir: 'ltr' as const, id: 1, lang } } : {}) }];
    const french = new Set<string>();
    const spanish = new Set<string>();
    for (let w = 70; w <= 200; w += 7) {
      for (const h of heads(measureRichBlock(run('fr'), 'x', 'x', 'x', 'x', w, 20, { textAlign: 'justify', hyphenate: true }).lines)) french.add(h);
      for (const h of heads(measureRichBlock(run(), 'x', 'x', 'x', 'x', w, 20, { textAlign: 'justify', hyphenate: true }).lines)) spanish.add(h);
    }
    expect([...french].filter((h) => SPANISH_ONLY.includes(h))).toEqual([]);
    expect([...french].some((h) => FRENCH_ONLY.includes(h))).toBe(true);
    expect([...spanish].some((h) => SPANISH_ONLY.includes(h))).toBe(true);
  });
});

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (widthPt: number, extra: Record<string, unknown> = {}): PostextConfig => ({
  locale: 'es',
  page: { dpi: 96, width: pt(widthPt), height: pt(2000), margins: { top: pt(10), bottom: pt(10), left: pt(10), right: pt(10) } },
  layout: { layoutType: 'single' },
  bodyText: { textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: true, locale: 'es' } },
  headings: { levels: [] },
  ...extra,
}) as unknown as PostextConfig;

const headsOf = (doc: VDTDocument): Set<string> => heads(doc.blocks.flatMap((b) => b.lines));

/** The heads of WORD over a sweep of measures. */
const sweep = (markdown: string, extra?: Record<string, unknown>, cache?: MeasurementCache): Set<string> => {
  const out = new Set<string>();
  for (let w = 95; w <= 215; w += 6) {
    for (const h of headsOf(buildDocument({ markdown }, config(w, extra), cache ?? createMeasurementCache()))) out.add(h);
  }
  return out;
};

describe('passages in a laid-out book (#1547)', () => {
  it('a container that names its language sets its paragraphs with that dictionary (left to right)', () => {
    const french = sweep(`:::paragraphs{lang=fr}\n${TEXT}\n:::\n`);
    expect([...french].filter((h) => SPANISH_ONLY.includes(h))).toEqual([]);
    expect([...french].some((h) => FRENCH_ONLY.includes(h))).toBe(true);
    const spanish = sweep(`${TEXT}\n`);
    expect([...spanish].some((h) => SPANISH_ONLY.includes(h))).toBe(true);
  }, 120_000);

  it('keeps the lines of the text and of the passage apart in a shared cache', () => {
    const cache = createMeasurementCache();
    const spanish = sweep(`${TEXT}\n`, undefined, cache);
    const french = sweep(`:::paragraphs{lang=fr}\n${TEXT}\n:::\n`, undefined, cache);
    expect([...spanish].some((h) => SPANISH_ONLY.includes(h))).toBe(true);
    expect([...french].filter((h) => SPANISH_ONLY.includes(h))).toEqual([]);
  }, 120_000);

  it('takes the passage\'s list of words kept whole', () => {
    const kept = sweep(`:::paragraphs{lang=fr}\n${TEXT}\n:::\n`, { bodyText: { textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: true, locale: 'es', exceptionsByLanguage: { fr: [WORD] } } } });
    expect(kept.size).toBe(0);
  }, 120_000);

  it('sets a French run of an Arabic book with the French syllables (right to left)', () => {
    const arabic = 'نشر الكتاب في سنة';
    const extra = { locale: 'ar', direction: 'rtl', bodyText: { textAlign: 'justify', firstLineIndent: pt(0), hyphenation: { enabled: true, locale: 'es' } } };
    const french = sweep(`${arabic} :ltr[${TEXT}]{lang=fr} ${arabic}\n`, extra);
    expect([...french].filter((h) => SPANISH_ONLY.includes(h))).toEqual([]);
    expect([...french].some((h) => FRENCH_ONLY.includes(h))).toBe(true);
    const spanish = sweep(`${arabic} :ltr[${TEXT}] ${arabic}\n`, extra);
    expect([...spanish].some((h) => SPANISH_ONLY.includes(h))).toBe(true);
  }, 120_000);
});
