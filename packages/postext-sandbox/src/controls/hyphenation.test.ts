import { describe, expect, it } from 'vitest';
import { matchHyphenationLocale, resolveBodyTextConfig, type PostextConfig } from 'postext';
import { defaultDocumentLocale, withHyphenationLocale } from './hyphenation';

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

  it('reads an unnamed document as Chinese in the Chinese interface', () => {
    const out = withHyphenationLocale({}, 'zh-Hans');
    expect(out.bodyText?.hyphenation?.locale).toBe('zh-Hans');
    // Which the engine sets without hyphenation.
    expect(resolveBodyTextConfig(out.bodyText).hyphenation.enabled).toBe(false);
    expect(withHyphenationLocale({ locale: 'en-us' }, 'zh-Hans').bodyText).toBeUndefined();
  });
});

describe('defaultDocumentLocale', () => {
  it('is the interface language, as a hyphenation dictionary or a Chinese script', () => {
    expect(defaultDocumentLocale('en')).toBe('en-us');
    expect(defaultDocumentLocale('es')).toBe('es');
    expect(defaultDocumentLocale('zh-Hans')).toBe('zh-Hans');
    expect(defaultDocumentLocale('zh')).toBe('zh-Hans');
    expect(defaultDocumentLocale('zh-TW')).toBe('zh-Hant');
    expect(defaultDocumentLocale('ja')).toBe('ja');
    expect(defaultDocumentLocale('ja-JP')).toBe('ja');
    expect(defaultDocumentLocale('xx')).toBe('en-us');
  });

  it('reads an unnamed document as Brazilian Portuguese in the Portuguese interface', () => {
    // The web app passes the page's `lang`, `pt-BR`.
    expect(defaultDocumentLocale('pt-BR')).toBe('pt-BR');
    expect(defaultDocumentLocale('pt')).toBe('pt-BR');
    expect(defaultDocumentLocale('es-ES')).toBe('es');
    const out = withHyphenationLocale({}, 'pt-BR');
    expect(out.bodyText?.hyphenation?.locale).toBe('pt-BR');
    const resolved = resolveBodyTextConfig(out.bodyText).hyphenation;
    expect(resolved.enabled).toBe(true);
    expect(matchHyphenationLocale(resolved.locale)).toBe('pt');
  });
});
