import { describe, it, expect, afterEach } from 'vitest';
import { getHyphenationRulesKey, hyphenateByDictionary, hyphenateText, setHyphenationLocale, setHyphenationRules, type HyphenationRules } from '../../hyphenation/hyphenate.js';
import { hyphenationLocaleFor } from '../../hyphenation/locale.js';
import { stripConfigDefaults } from '../../defaults/index.js';
import { resolveAllConfig } from '../../pipeline/config.js';
import type { PostextConfig } from '../../index.js';

const SHY = '­';
const show = (s: string): string => s.split(SHY).join('-');
const divide = (word: string, locale: string, rules?: HyphenationRules): string => {
  setHyphenationRules(rules);
  return show(hyphenateText(word, locale));
};

afterEach(() => {
  setHyphenationLocale('en-us');
  setHyphenationRules();
});

describe('hyphenation.exceptionsByLanguage', () => {
  it('resolves each list as exceptions is read, keyed by dictionary, tags of one dictionary merged', () => {
    const en = hyphenationLocaleFor('en', false);
    const resolved = resolveAllConfig({ bodyText: { hyphenation: { exceptionsByLanguage: { es: ['b', 'a', '1'], en: ['Alice'], 'en-US': ['Bob'], fr: [] } } } } as PostextConfig);
    expect(resolved.bodyText.hyphenation.exceptionsByLanguage).toEqual({ [en]: ['Alice', 'Bob'], es: ['a', 'b'] });
    expect(resolveAllConfig({}).bodyText.hyphenation.exceptionsByLanguage).toBeUndefined();
    expect(resolveAllConfig({ bodyText: { hyphenation: { exceptionsByLanguage: { es: ['1'] } } } } as PostextConfig).bodyText.hyphenation.exceptionsByLanguage).toBeUndefined();
  });

  it('applies a list only where its dictionary divides', () => {
    const en = hyphenationLocaleFor('en', false);
    const rules: HyphenationRules = { exceptionsByLanguage: { [en]: ['information'] } };
    expect(divide('information', 'en-us', rules)).toBe('information');
    expect(divide('information', 'es', rules)).toBe(show(hyphenateByDictionary('information', 'es')));
  });

  it('wins over the same word in exceptions, in its language only', () => {
    const rules: HyphenationRules = { exceptions: ['ca-mi-no'], exceptionsByLanguage: { es: ['camino'] } };
    expect(divide('camino', 'es', rules)).toBe('camino');
    expect(divide('camino', 'it', rules)).toBe('ca-mi-no');
  });

  it('gives the rule set its own id, and none set changes nothing', () => {
    setHyphenationRules({ exceptions: ['Alice'] });
    const plain = getHyphenationRulesKey();
    setHyphenationRules({ exceptions: ['Alice'], exceptionsByLanguage: { es: ['camino'] } });
    expect(getHyphenationRulesKey()).not.toBe(plain);
    setHyphenationRules({ exceptions: ['Alice'], exceptionsByLanguage: {} });
    expect(getHyphenationRulesKey()).toBe(plain);
    setHyphenationRules({ exceptionsByLanguage: {} });
    expect(getHyphenationRulesKey()).toBe('');
  });

  it('survives the strip, and an empty record is dropped', () => {
    const c = { bodyText: { hyphenation: { exceptionsByLanguage: { es: ['camino'] } } } } as PostextConfig;
    expect(JSON.stringify(resolveAllConfig(stripConfigDefaults(c)))).toBe(JSON.stringify(resolveAllConfig(c)));
    expect(stripConfigDefaults({ bodyText: { hyphenation: { exceptionsByLanguage: {} } } } as PostextConfig)).toEqual({});
  });
});
