import { describe, expect, it } from 'vitest';
import { localeDisplayName, localeShortTag } from './localeNames';

describe('localeDisplayName', () => {
  it('names a content locale in the interface language', () => {
    expect(localeDisplayName('zh-Hant', 'en')).toBe('Traditional Chinese');
    expect(localeDisplayName('zh-Hans', 'en')).toBe('Simplified Chinese');
    expect(localeDisplayName('zh-Hant', 'es')).toBe('chino tradicional');
    expect(localeDisplayName('zh-hans', 'es')).toBe('chino simplificado');
    expect(localeDisplayName('en', 'es')).toBe('inglés');
    expect(localeDisplayName('es', 'en')).toBe('Spanish');
    expect(localeDisplayName('e s', 'en')).toBe('e s');
  });
});

describe('localeShortTag', () => {
  it('shows 繁 / 简 for the Chinese editions and the language for the rest', () => {
    const hlm = ['zh-Hant', 'zh-Hans', 'en'];
    expect(localeShortTag('zh-Hant', hlm)).toEqual({ text: '繁', lang: 'zh-Hant' });
    expect(localeShortTag('zh-Hans', hlm)).toEqual({ text: '简', lang: 'zh-Hans' });
    expect(localeShortTag('en', hlm)).toEqual({ text: 'en' });
    expect(localeShortTag('zh-TW', ['zh-TW', 'zh-CN'])).toEqual({ text: '繁', lang: 'zh-Hant' });
    // Two editions in one script, two regions of one language: the tag.
    expect(localeShortTag('zh-Hant-HK', ['zh-Hant-HK', 'zh-Hant-TW'])).toEqual({ text: 'zh-Hant-HK' });
    expect(localeShortTag('pt-BR', ['pt-BR', 'pt-PT'])).toEqual({ text: 'pt-BR' });
    expect(localeShortTag('en-GB', ['es', 'en-GB'])).toEqual({ text: 'en' });
  });

  it('shows ع for the only Arabic edition, the tag when there are two', () => {
    expect(localeShortTag('ar', ['es', 'en', 'ar'])).toEqual({ text: 'ع', lang: 'ar' });
    expect(localeShortTag('ar-EG', ['ar-EG', 'en'])).toEqual({ text: 'ع', lang: 'ar' });
    expect(localeShortTag('ar-EG', ['ar-EG', 'ar-MA'])).toEqual({ text: 'ar-EG' });
  });

  it('shows 日 for the only Japanese edition, the tag when there are two', () => {
    expect(localeShortTag('ja', ['ja'])).toEqual({ text: '日', lang: 'ja' });
    expect(localeShortTag('ja-JP', ['en', 'ja-JP', 'zh-Hant'])).toEqual({ text: '日', lang: 'ja' });
    expect(localeShortTag('ja', ['ja', 'ja-Latn'])).toEqual({ text: 'ja' });
    // Japanese is not a Chinese script.
    expect(localeShortTag('zh-Hant', ['ja', 'zh-Hant'])).toEqual({ text: '繁', lang: 'zh-Hant' });
    expect(localeDisplayName('ja', 'en')).toBe('Japanese');
    expect(localeDisplayName('ja', 'es')).toBe('japonés');
    expect(localeShortTag('ja', ['es', 'en', 'ja'])).toEqual({ text: '日', lang: 'ja' });
    expect(localeShortTag('ja-JP', ['ja-JP', 'en'])).toEqual({ text: '日', lang: 'ja' });
    expect(localeShortTag('ja-JP', ['ja-JP', 'ja-Latn'])).toEqual({ text: 'ja-JP' });
  });
});
