import { describe, expect, it } from 'vitest';
import type { PostextConfig } from 'postext';
import { withHyphenationLocale } from './hyphenation';

describe('withHyphenationLocale', () => {
  it('fills the app language when the document names none', () => {
    const config: PostextConfig = { bodyText: { fontFamily: 'Lora' } };
    const out = withHyphenationLocale(config, 'es');
    expect(out.bodyText?.hyphenation?.locale).toBe('es');
    expect(out.bodyText?.fontFamily).toBe('Lora');
    expect(withHyphenationLocale(config, 'es')).toBe(out);
    expect(withHyphenationLocale({}, 'xx').bodyText?.hyphenation?.locale).toBe('en-us');
  });

  it('leaves a document with its own language alone', () => {
    const explicit: PostextConfig = { bodyText: { hyphenation: { locale: 'de' } } };
    expect(withHyphenationLocale(explicit, 'es')).toBe(explicit);
    // The document language is the engine's hyphenation fallback: viewing a
    // Spanish book from the English interface must not hyphenate it in English.
    const documentLanguage: PostextConfig = { locale: 'es' };
    expect(withHyphenationLocale(documentLanguage, 'en')).toBe(documentLanguage);
  });
});
