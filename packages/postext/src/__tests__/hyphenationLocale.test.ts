import { describe, it, expect, vi, afterEach } from 'vitest';
import { hyphenateText, setHyphenationLocale, getHyphenationLocale, matchHyphenationLocale, HYPHENATION_LOCALES } from '../hyphenate';
import { resolveBodyTextConfig } from '../defaults/bodyText';
import { buildDocument } from '../pipeline';
import { createMeasurementCache, cachedMeasureRichBlock, initHyphenator } from '../measure';
import type { PostextConfig, VDTDocument } from '../index';

// Deterministic text measurement stub (no DOM in the node test env): every
// character, the space included, is 7 px wide.
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

const SHY = '\u00AD';
const WORDS = 'extraordinariamente puerta computadora';
const pt = (value: number) => ({ value, unit: 'pt' as const });

/** A single 133 px column (19 characters of the stub font) at 72 dpi, so
 *  one point is one pixel. "puerta puerta puer-" fills a line exactly; a
 *  third whole "puerta" does not fit. */
const narrow = (extra: PostextConfig = {}): PostextConfig => ({
  page: { dpi: 72, width: pt(133), height: pt(400), margins: { top: pt(0), bottom: pt(0), left: pt(0), right: pt(0) } },
  layout: { layoutType: 'single' },
  ...extra,
  bodyText: { firstLineIndent: pt(0), optimalLineBreaking: false, ...extra.bodyText },
});

const lineTexts = (doc: VDTDocument): string[] =>
  doc.pages.flatMap((p) => p.columns.flatMap((c) => c.blocks.flatMap((b) => b.lines.map((l) => l.text))));

afterEach(() => {
  setHyphenationLocale('en-us');
  vi.restoreAllMocks();
});

describe('hyphenation locale tags (BCP 47)', () => {
  it('bundles eight languages', () => {
    expect([...HYPHENATION_LOCALES]).toEqual(['en-us', 'es', 'fr', 'de', 'it', 'pt', 'ca', 'nl']);
  });

  it('region, script and variant subtags pick the language\'s patterns', () => {
    const cases: [string, string][] = [
      ['es-ES', 'es'], ['ES', 'es'], ['es_MX', 'es'], ['es-419', 'es'],
      ['pt-BR', 'pt'], ['pt-PT', 'pt'], ['de-CH-1996', 'de'], ['de-AT', 'de'],
      ['ca-ES-valencia', 'ca'], ['fr-CA', 'fr'], ['nl-BE', 'nl'], ['it-CH', 'it'],
      ['en', 'en-us'], ['en-GB', 'en-us'], ['EN-US', 'en-us'], [' es ', 'es'],
    ];
    for (const [tag, want] of cases) {
      expect(matchHyphenationLocale(tag), tag).toBe(want);
      expect(hyphenateText(WORDS, tag), tag).toBe(hyphenateText(WORDS, want as 'es'));
    }
    // Spanish syllables, not the English ones the tag used to fall back to.
    expect(hyphenateText('puerta', 'es-ES')).toBe(`puer${SHY}ta`);
  });

  it('a language with no bundled patterns hyphenates with en-us and warns once', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(matchHyphenationLocale('sv')).toBeUndefined();
    expect(matchHyphenationLocale('')).toBeUndefined();
    expect(hyphenateText(WORDS, 'sv')).toBe(hyphenateText(WORDS, 'en-us'));
    expect(hyphenateText('puerta computadora', 'sv-SE')).toBe(hyphenateText('puerta computadora', 'en-us'));
    expect(hyphenateText(WORDS, 'sv')).toBe(hyphenateText(WORDS, 'en-us'));
    const messages = warn.mock.calls.map((c) => String(c[0]));
    expect(messages.filter((m) => m.includes('"sv"'))).toHaveLength(1);
    expect(messages.filter((m) => m.includes('"sv-SE"'))).toHaveLength(1);
    expect(messages[0]).toContain('en-us');
  });

  it('a missing or blank tag counts as unset, without a warning', () => {
    // Untyped callers pass `config.locale` straight through: a nullish or
    // blank tag keeps the active dictionary (en-us when setting one), as it
    // did before tags were normalised, instead of throwing.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const none = null as unknown as string;
    setHyphenationLocale('es');
    expect(hyphenateText('puerta', none)).toBe(`puer${SHY}ta`);
    expect(hyphenateText('puerta', undefined)).toBe(`puer${SHY}ta`);
    expect(hyphenateText('puerta', '')).toBe(`puer${SHY}ta`);
    expect(hyphenateText('puerta', '   ')).toBe(`puer${SHY}ta`);
    expect(matchHyphenationLocale(none)).toBeUndefined();
    expect(matchHyphenationLocale(42 as unknown as string)).toBeUndefined();
    setHyphenationLocale(undefined as unknown as string);
    expect(getHyphenationLocale()).toBe('en-us');
    setHyphenationLocale('es');
    initHyphenator(none);
    expect(getHyphenationLocale()).toBe('en-us');
    expect(warn).not.toHaveBeenCalled();
  });

  it('no warning when hyphenation is switched off', () => {
    // `enabled: false` is the remedy for a language without patterns, so it
    // must silence the report; the tag is still kept for the PDF.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveBodyTextConfig({ hyphenation: { enabled: false } }, 'nb').hyphenation).toMatchObject({ enabled: false, locale: 'en-us', tag: 'nb' });
    expect(resolveBodyTextConfig({ hyphenation: { enabled: false, locale: 'pl-PL' } }).hyphenation).toMatchObject({ locale: 'en-us', tag: 'pl-PL' });
    buildDocument({ markdown: 'Hej.' }, { locale: 'sv-FI', bodyText: { hyphenation: { enabled: false } } });
    expect(warn).not.toHaveBeenCalled();
    // Switched on, the same language is reported.
    resolveBodyTextConfig(undefined, 'nb');
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('setHyphenationLocale normalises the tag', () => {
    setHyphenationLocale('es-ES' as 'es');
    expect(hyphenateText('puerta')).toBe(`puer${SHY}ta`);
  });

  it('the resolved config names the dictionary used and keeps the tag it came from', () => {
    expect(resolveBodyTextConfig(undefined, 'es-ES').hyphenation).toMatchObject({ enabled: true, locale: 'es', tag: 'es-ES' });
    expect(resolveBodyTextConfig({ hyphenation: { locale: 'pt-BR' } }).hyphenation).toMatchObject({ locale: 'pt', tag: 'pt-BR' });
    expect(resolveBodyTextConfig({ fontSize: pt(9) }, 'de-CH').hyphenation).toMatchObject({ locale: 'de', tag: 'de-CH' });
    // A bundled id resolves to itself and carries no tag.
    const es = resolveBodyTextConfig(undefined, 'es').hyphenation;
    expect(es.locale).toBe('es');
    expect(es.tag).toBeUndefined();
    expect(resolveBodyTextConfig().hyphenation.tag).toBeUndefined();
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(resolveBodyTextConfig(undefined, 'fi').hyphenation).toMatchObject({ locale: 'en-us', tag: 'fi' });
  });

  it('justified text in a region-tagged locale hyphenates with its language\'s patterns', () => {
    const markdown = 'puerta puerta puerta puerta puerta puerta';
    const english = lineTexts(buildDocument({ markdown }, narrow()));
    expect(english.some((t) => t.endsWith('-'))).toBe(false);
    const spanish = lineTexts(buildDocument({ markdown }, narrow({ locale: 'es-ES' })));
    expect(spanish[0]).toBe('puerta puerta puer-');
    const viaHyphenation = lineTexts(buildDocument({ markdown }, narrow({ bodyText: { hyphenation: { locale: 'es-ES' } } })));
    expect(viaHyphenation[0]).toBe('puerta puerta puer-');
  });

  it('a build sets the document\'s dictionary even when none of its text is justified', () => {
    // Words wider than their measure, design text and callout bodies all
    // hyphenate with the active dictionary: a ragged Spanish document must
    // not leave it on whatever the previous build (or the default) set.
    setHyphenationLocale('en-us');
    buildDocument({ markdown: 'Hola.' }, { locale: 'es', bodyText: { textAlign: 'left' } });
    expect(hyphenateText('puerta')).toBe(`puer${SHY}ta`);
  });

  it('measurement cache entries are per dictionary', () => {
    // An overlong word is divided at a dictionary syllable whatever the
    // alignment, so the same text measures differently per locale.
    const cache = createMeasurementCache();
    const measure = () => cachedMeasureRichBlock(
      [{ text: 'computadora', bold: false, italic: false }], 'f', 'f', 'f', 'f', 56, 12, { textAlign: 'left' }, cache,
    ).lines.map((l) => l.text);
    // 8 characters per line: en-us "com-puta-dora", es "compu-tado-ra".
    setHyphenationLocale('en-us');
    expect(measure()).toEqual(['computa-', 'dora']);
    setHyphenationLocale('es');
    expect(measure()).toEqual(['compu-', 'tadora']);
  });
});
