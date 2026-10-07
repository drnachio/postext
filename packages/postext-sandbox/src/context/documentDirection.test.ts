import { describe, expect, it } from 'vitest';
import { resolvePageConfig, type PostextConfig } from 'postext';
import { documentComicDirection, documentDirection } from './documentDirection';

describe('documentComicDirection', () => {
  it('is undefined without a comics section', () => {
    expect(documentComicDirection({}, 'ja', 'horizontal-tb', 'ltr')).toBeUndefined();
  });

  it('gives the binding Auto resolves to in each edition (#593)', () => {
    const cases: [PostextConfig, 'ltr' | 'rtl' | undefined, 'left' | 'right'][] = [
      [{ locale: 'ja', comics: {} }, 'rtl', 'right'],
      [{ locale: 'ja', comics: { readingDirection: 'ltr' } }, 'ltr', 'left'],
      [{ locale: 'zh-Hans', comics: {} }, 'ltr', 'left'],
      [{ locale: 'zh-Hant', comics: {} }, 'rtl', 'right'],
      [{ locale: 'ar', comics: {} }, 'rtl', 'right'],
      [{ locale: 'en', comics: { artDirection: 'rtl' } }, 'rtl', 'right'],
      [{ locale: 'en', comics: {} }, 'ltr', 'left'],
      [{ locale: 'ja' }, undefined, 'left'],
    ];
    for (const [config, comic, binding] of cases) {
      const direction = documentDirection(config.direction, config.locale);
      const got = documentComicDirection(config, config.locale, config.layout?.writingMode, direction);
      expect(got, JSON.stringify(config)).toBe(comic);
      expect(resolvePageConfig(config.page, config.locale, config.layout?.writingMode, direction, got).binding, JSON.stringify(config)).toBe(binding);
    }
  });
});
