import { describe, it, expect } from 'vitest';
import { DOCUMENT_LANGUAGES } from 'postext';
import { DOCUMENT_LOCALE_OPTIONS, LOCALE_OPTIONS, documentLocaleLabel, documentLocaleOptionsFor, localeOptionsFor } from './constants';

describe('localeOptionsFor', () => {
  it('offers the bundled languages when the value is one of them', () => {
    expect(localeOptionsFor('es')).toBe(LOCALE_OPTIONS);
    expect(localeOptionsFor(undefined)).toBe(LOCALE_OPTIONS);
  });

  it('adds a tag the engine accepts but the list lacks, so the select shows it', () => {
    // A region tag, named after the language whose patterns it uses.
    expect(localeOptionsFor('es-ES').at(-1)).toEqual({ value: 'es-ES', label: 'Español (es-ES)' });
    expect(localeOptionsFor('en').at(-1)).toEqual({ value: 'en', label: 'English (en)' });
    // A language without patterns, as written.
    expect(localeOptionsFor('sv').at(-1)).toEqual({ value: 'sv', label: 'sv' });
    expect(localeOptionsFor('sv')).toHaveLength(LOCALE_OPTIONS.length + 1);
  });
});

describe('documentLocaleOptionsFor', () => {
  it('offers the hyphenation languages, Chinese in both scripts, Japanese and Arabic', () => {
    expect(DOCUMENT_LOCALE_OPTIONS.map((o) => o.value)).toEqual(['en-us', 'es', 'fr', 'de', 'it', 'pt', 'ca', 'nl', 'zh-Hans', 'zh-Hant', 'zh-Hant-HK', 'ja', 'ar', 'ar-EG', 'ar-MA']);
    expect(DOCUMENT_LOCALE_OPTIONS.slice(8, 12).map((o) => o.label)).toEqual(['中文（简体）', '中文（繁體）', '中文（香港）', '日本語']);
    expect(DOCUMENT_LOCALE_OPTIONS.slice(-3).map((o) => o.label)).toEqual(['العربية', 'العربية (مصر)', 'العربية (المغرب)']);
    expect(documentLocaleOptionsFor('ar-MA')).toBe(DOCUMENT_LOCALE_OPTIONS);
    expect(documentLocaleOptionsFor('zh-Hant')).toBe(DOCUMENT_LOCALE_OPTIONS);
    expect(documentLocaleOptionsFor('ja')).toBe(DOCUMENT_LOCALE_OPTIONS);
    // The engine's list, name for name.
    expect(DOCUMENT_LOCALE_OPTIONS).toEqual(DOCUMENT_LANGUAGES.map((l) => ({ value: l.tag, label: l.name })));
  });

  it('names a stored tag after the language it reads as', () => {
    expect(documentLocaleOptionsFor('zh-TW').at(-1)).toEqual({ value: 'zh-TW', label: '中文（繁體） (zh-TW)' });
    expect(documentLocaleOptionsFor('zh-MO').at(-1)).toEqual({ value: 'zh-MO', label: '中文（香港） (zh-MO)' });
    expect(documentLocaleOptionsFor('zh-CN').at(-1)).toEqual({ value: 'zh-CN', label: '中文（简体） (zh-CN)' });
    expect(documentLocaleOptionsFor('es-ES').at(-1)).toEqual({ value: 'es-ES', label: 'Español (es-ES)' });
    expect(documentLocaleOptionsFor('sv').at(-1)).toEqual({ value: 'sv', label: 'sv' });
    expect(documentLocaleOptionsFor('ar-SA').at(-1)).toEqual({ value: 'ar-SA', label: 'العربية (ar-SA)' });
    // Japanese is not Chinese: ja-JP reads as 日本語, never as a Chinese option.
    expect(documentLocaleOptionsFor('ja-JP').at(-1)).toEqual({ value: 'ja-JP', label: '日本語 (ja-JP)' });
    expect(documentLocaleOptionsFor('fa').at(-1)).toEqual({ value: 'fa', label: 'fa' });
  });
});

describe('documentLocaleLabel', () => {
  it('names a document language in its own language', () => {
    expect(documentLocaleLabel('es')).toBe('Español');
    expect(documentLocaleLabel('en')).toBe('English');
    expect(documentLocaleLabel('zh-Hans')).toBe('中文（简体）');
    expect(documentLocaleLabel('zh-TW')).toBe('中文（繁體）');
    expect(documentLocaleLabel('zh-HK')).toBe('中文（香港）');
    expect(documentLocaleLabel('zh-CN')).toBe('中文（简体）');
    expect(documentLocaleLabel('sv')).toBe('sv');
    expect(documentLocaleLabel('ar-EG')).toBe('العربية (مصر)');
    expect(documentLocaleLabel('ar_SA')).toBe('العربية');
    expect(documentLocaleLabel('ja')).toBe('日本語');
    expect(documentLocaleLabel('ja_JP')).toBe('日本語');
  });
});
