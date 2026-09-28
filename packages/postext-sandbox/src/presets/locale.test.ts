import { describe, expect, it } from 'vitest';
import { activeLocaleTag, bundleContentLocales, choosePresetOpen, presetOpenLocale, resolvePresetLocale, sameContentLocale } from './locale';

const bilingual = { id: 'guide', locales: ['es', 'en'] };
const spanish = { id: 'emp', locale: 'es' };
const d = (presetId: string, locale: string, updatedAt = 1) => ({ key: `${presetId}::${locale}`, presetId, locale, updatedAt });

describe('resolvePresetLocale', () => {
  it('matches by language, falls back to a single locale, else unknown', () => {
    expect(resolvePresetLocale(bilingual, 'es-ES')).toBe('es');
    expect(resolvePresetLocale(spanish, 'en')).toBe('es');
    expect(resolvePresetLocale(bilingual, 'fr')).toBeNull();
    expect(resolvePresetLocale({}, 'en')).toBeNull();
  });
});

describe('choosePresetOpen', () => {
  it('opens the original in the viewer locale when nothing was edited', () => {
    expect(choosePresetOpen({ summary: bilingual, viewer: 'en', drafts: [] })).toEqual({ locale: 'en', draft: null });
  });

  it("opens the viewer locale's draft", () => {
    const drafts = [d('guide', 'en'), d('guide', 'es', 5)];
    expect(choosePresetOpen({ summary: bilingual, viewer: 'en', drafts }).draft?.key).toBe('guide::en');
  });

  it('opens the latest edited locale when only another one was edited', () => {
    const choice = choosePresetOpen({ summary: bilingual, viewer: 'en', drafts: [d('guide', 'es')] });
    expect(choice).toEqual({ locale: 'es', draft: d('guide', 'es') });
  });

  it('a locale asked for wins, with its draft or its original', () => {
    const drafts = [d('guide', 'es')];
    expect(choosePresetOpen({ summary: bilingual, requested: 'en', viewer: 'es', drafts })).toEqual({ locale: 'en', draft: null });
    expect(choosePresetOpen({ summary: bilingual, requested: 'ES', viewer: 'en', drafts }).draft?.key).toBe('guide::es');
  });

  it("keeps the locale of the preset on screen and ignores other presets' drafts", () => {
    expect(choosePresetOpen({ summary: bilingual, current: 'es', viewer: 'en', drafts: [d('other', 'en')] })).toEqual({ locale: 'es', draft: null });
    expect(choosePresetOpen({ summary: spanish, viewer: 'en', drafts: [d('emp', 'es')] }).draft?.key).toBe('emp::es');
  });
});

// #198: a book in Traditional and Simplified Chinese plus an English
// translation, read with an es/en interface.
describe('Chinese editions', () => {
  const hlm = { id: 'hlm', locale: 'zh-Hant', locales: ['zh-Hant', 'zh-Hans', 'en'], openLocale: 'zh-Hant' };
  const listedHansFirst = { ...hlm, locales: ['zh-Hans', 'zh-Hant', 'en'] };

  it('tells the two scripts apart', () => {
    expect(sameContentLocale('zh-Hans', 'zh-Hant')).toBe(false);
    expect(sameContentLocale('zh-TW', 'zh-Hant')).toBe(true);
    expect(resolvePresetLocale(listedHansFirst, 'zh-hant')).toBe('zh-Hant');
    expect(resolvePresetLocale(listedHansFirst, 'zh-TW')).toBe('zh-Hant');
    expect(resolvePresetLocale(listedHansFirst, 'zh')).toBe('zh-Hans');
  });

  it('opens the locale asked for, whatever the viewer reads', () => {
    expect(choosePresetOpen({ summary: listedHansFirst, requested: 'zh-Hant', viewer: 'es', drafts: [] }).locale).toBe('zh-Hant');
    expect(choosePresetOpen({ summary: listedHansFirst, requested: 'zh-TW', viewer: 'es', drafts: [] }).locale).toBe('zh-Hant');
    expect(choosePresetOpen({ summary: listedHansFirst, requested: 'zh', viewer: 'es', drafts: [] }).locale).toBe('zh-Hans');
    expect(choosePresetOpen({ summary: hlm, requested: 'en', viewer: 'es', drafts: [] }).locale).toBe('en');
  });

  it('opens its openLocale when nothing (or a language it lacks) is asked for', () => {
    expect(presetOpenLocale(hlm)).toBe('zh-Hant');
    expect(choosePresetOpen({ summary: hlm, viewer: 'es', drafts: [] })).toEqual({ locale: 'zh-Hant', draft: null });
    expect(choosePresetOpen({ summary: hlm, viewer: 'en', drafts: [] }).locale).toBe('zh-Hant');
    expect(choosePresetOpen({ summary: hlm, requested: 'es', viewer: 'es', drafts: [] }).locale).toBe('zh-Hant');
    // An openLocale the book does not carry is ignored.
    expect(presetOpenLocale({ ...hlm, openLocale: 'fr' })).toBeNull();
    // Without one, nothing changes for the es/en presets.
    expect(choosePresetOpen({ summary: bilingual, viewer: 'es', drafts: [] }).locale).toBe('es');
    expect(choosePresetOpen({ summary: bilingual, requested: 'fr', viewer: 'es', drafts: [] }).locale).toBe('fr');
  });

  it("never opens the other script's draft", () => {
    const drafts = [d('hlm', 'zh-Hans')];
    expect(choosePresetOpen({ summary: hlm, requested: 'zh-Hant', viewer: 'es', drafts })).toEqual({ locale: 'zh-Hant', draft: null });
    expect(choosePresetOpen({ summary: hlm, requested: 'zh-CN', viewer: 'es', drafts }).draft?.key).toBe('hlm::zh-Hans');
    expect(choosePresetOpen({ summary: hlm, requested: 'ZH-hans', viewer: 'es', drafts }).draft?.key).toBe('hlm::zh-Hans');
  });

  it('marks the row tag the active locale is served as', () => {
    expect(activeLocaleTag(hlm.locales, 'zh-Hant')).toBe('zh-Hant');
    expect(activeLocaleTag(hlm.locales, 'zh-Hans')).toBe('zh-Hans');
    expect(activeLocaleTag(hlm.locales, 'en-GB')).toBe('en');
    expect(activeLocaleTag(hlm.locales, null)).toBeNull();
  });
});

describe('bundleContentLocales', () => {
  it('lists the locales of a multi-language bundle and the one it is written in', () => {
    const chapters = (l: string) => [{ title: l, file: `${l}.md` }];
    expect(bundleContentLocales({ locale: 'zh-Hant', locales: ['zh-Hant', 'zh-Hans', 'en'], chapters: { en: chapters('en'), 'zh-Hans': chapters('zh-Hans'), 'zh-Hant': chapters('zh-Hant') } }))
      .toEqual({ locales: ['zh-Hant', 'zh-Hans', 'en'], own: 'zh-Hant' });
    expect(bundleContentLocales({ locale: 'es', chapters: { es: chapters('es'), en: chapters('en') } })).toEqual({ locales: ['es', 'en'], own: 'es' });
    // Shared chapters, wording per locale.
    expect(bundleContentLocales({ locale: 'en', chapters: chapters('x'), localized: { es: {} } })).toEqual({ locales: ['en', 'es'], own: 'en' });
    // One language, or nothing to read.
    expect(bundleContentLocales({ locale: 'es', chapters: chapters('es') })).toEqual({ locales: [], own: 'es' });
    expect(bundleContentLocales(null)).toEqual({ locales: [], own: null });
  });
});
