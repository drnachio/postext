import { describe, expect, it } from 'vitest';
import { activeLocaleTag, bundleContentLocales, choosePresetOpen, isEditionOnScreen, linkNamesBookOnScreen, presetLocaleFor, presetOpenLocale, presetReaderLocale, resolvePresetLocale, sameContentLocale } from './locale';

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

  it('serves the other script when the book has only that one', () => {
    const simplified = { id: 'sgz', locale: 'en', locales: ['en', 'zh-Hans'] };
    expect(resolvePresetLocale(simplified, 'zh-TW')).toBe('zh-Hans');
    expect(choosePresetOpen({ summary: simplified, requested: 'zh-Hant', viewer: 'es', drafts: [] }).locale).toBe('zh-Hans');
  });

  it('knows which edition a link asks for, and whether it is on screen (review of #198)', () => {
    expect(presetLocaleFor(hlm, 'zh-TW')).toBe('zh-Hant');
    expect(presetLocaleFor(hlm, 'zh-SG')).toBe('zh-Hans');
    expect(presetLocaleFor(hlm, 'es')).toBe('zh-Hant');
    expect(presetLocaleFor(bilingual, 'fr')).toBe('fr');
    expect(isEditionOnScreen(hlm, 'zh-TW', 'zh-Hant')).toBe(true);
    expect(isEditionOnScreen(hlm, 'es', 'zh-Hant')).toBe(true);
    expect(isEditionOnScreen(hlm, 'zh-Hans', 'zh-Hant')).toBe(false);
    expect(isEditionOnScreen(hlm, undefined, 'zh-Hans')).toBe(true);
    expect(isEditionOnScreen(hlm, 'zh-Hant', null)).toBe(false);
    // Regional editions listed apart still switch.
    expect(isEditionOnScreen({ locales: ['pt-PT', 'pt-BR'] }, 'pt-BR', 'pt-PT')).toBe(false);
    // Nothing listed: the bundle decided, compared by content language.
    expect(isEditionOnScreen(undefined, 'zh-TW', 'zh-Hant')).toBe(true);
    expect(isEditionOnScreen({}, 'zh-CN', 'zh-Hant')).toBe(false);

    const book = { preset: 'hlm', project: null, lang: 'zh-Hant' };
    const summaries = [hlm];
    expect(linkNamesBookOnScreen({ preset: 'hlm', project: null, lang: 'zh-TW' }, book, summaries)).toBe(true);
    expect(linkNamesBookOnScreen({ preset: 'hlm', project: null, lang: 'zh-hant' }, book, summaries)).toBe(true);
    expect(linkNamesBookOnScreen({ preset: 'hlm', project: null, lang: null }, book, summaries)).toBe(true);
    expect(linkNamesBookOnScreen({ preset: 'hlm', project: null, lang: 'zh' }, book, summaries)).toBe(false);
    expect(linkNamesBookOnScreen({ preset: 'other', project: null, lang: 'zh-TW' }, book, summaries)).toBe(false);
    expect(linkNamesBookOnScreen({ preset: 'hlm', project: null, lang: 'zh-TW' }, { preset: null, project: 'p1', lang: null }, summaries)).toBe(false);
    expect(linkNamesBookOnScreen({ preset: null, project: 'p1', lang: null }, { preset: null, project: 'p1', lang: null }, summaries)).toBe(true);
  });

  it('marks the row tag the active locale is served as', () => {
    expect(activeLocaleTag(hlm.locales, 'zh-Hant')).toBe('zh-Hant');
    expect(activeLocaleTag(hlm.locales, 'zh-Hans')).toBe('zh-Hans');
    expect(activeLocaleTag(hlm.locales, 'en-GB')).toBe('en');
    expect(activeLocaleTag(hlm.locales, null)).toBeNull();
  });
});

describe('a Chinese interface', () => {
  const guide = { id: 'postext-guide', locales: ['es', 'en', 'zh-Hans'] };
  const showcase = { id: 'deep-sky', locale: 'es', locales: ['es', 'en'] };
  const traditional = { id: 'hlm', locale: 'zh-Hant', locales: ['zh-Hant', 'en'] };

  it('opens a book in Chinese when it has a Chinese edition', () => {
    expect(choosePresetOpen({ summary: guide, viewer: 'zh-Hans', drafts: [] }).locale).toBe('zh-Hans');
    expect(choosePresetOpen({ summary: guide, viewer: 'zh', drafts: [] }).locale).toBe('zh-Hans');
    // Traditional only: the Chinese of the other script before English.
    expect(presetReaderLocale(traditional, 'zh-Hans')).toBe('zh-Hans');
    expect(choosePresetOpen({ summary: traditional, viewer: 'zh-Hans', drafts: [] }).locale).toBe('zh-Hant');
  });

  it('reads a book without Chinese in English, then in its own language', () => {
    expect(presetReaderLocale(showcase, 'zh-Hans')).toBe('en');
    expect(choosePresetOpen({ summary: showcase, viewer: 'zh-Hans', drafts: [] })).toEqual({ locale: 'en', draft: null });
    // Its English draft opens; a Spanish one only when it is the only draft.
    expect(choosePresetOpen({ summary: showcase, viewer: 'zh-Hans', drafts: [d('deep-sky', 'en')] }).draft?.key).toBe('deep-sky::en');
    expect(choosePresetOpen({ summary: showcase, viewer: 'zh-Hans', drafts: [d('deep-sky', 'es')] }).locale).toBe('es');
    // No English edition: the bundle decides (its own locale).
    expect(presetReaderLocale({ locale: 'fr', locales: ['fr', 'de'] }, 'zh-Hans')).toBe('zh-Hans');
    expect(choosePresetOpen({ summary: { id: 'x', locale: 'es' }, viewer: 'zh-Hans', drafts: [] }).locale).toBe('es');
    expect(presetReaderLocale({}, 'zh-Hans')).toBe('zh-Hans');
  });

  it('changes nothing for English and Spanish viewers', () => {
    const french = { locale: 'fr', locales: ['fr', 'en'] };
    expect(presetReaderLocale(french, 'es')).toBe('es');
    expect(presetReaderLocale(french, 'en')).toBe('en');
    expect(presetReaderLocale(showcase, 'es')).toBe('es');
  });
});

describe('Japanese editions', () => {
  // A book only in Japanese (the こころ showcase) and one in Japanese and English.
  const kokoro = { id: 'kokoro', locale: 'ja', locales: ['ja'], openLocale: 'ja' };
  const both = { id: 'jp', locale: 'ja', locales: ['ja', 'en'] };

  it('opens a Japanese-only book in Japanese for every viewer', () => {
    for (const viewer of ['en', 'es', 'ca', 'zh-Hans', 'ar']) {
      expect(choosePresetOpen({ summary: kokoro, viewer, drafts: [] }).locale, viewer).toBe('ja');
    }
    expect(presetLocaleFor(kokoro, 'en')).toBe('ja');
  });

  it('serves a lang=ja link by language, region aside, and never as Chinese', () => {
    expect(resolvePresetLocale(both, 'ja-JP')).toBe('ja');
    expect(presetLocaleFor(both, 'JA')).toBe('ja');
    expect(choosePresetOpen({ summary: both, requested: 'ja-JP', viewer: 'es', drafts: [d('jp', 'ja')] }).draft?.key).toBe('jp::ja');
    expect(resolvePresetLocale(both, 'zh-Hant')).toBeNull();
    expect(sameContentLocale('ja', 'ja-JP')).toBe(true);
    expect(sameContentLocale('ja', 'zh-Hant')).toBe(false);
    // A Chinese viewer of a book in Japanese and English reads the English.
    expect(presetReaderLocale(both, 'zh-Hans')).toBe('en');
    expect(activeLocaleTag(both.locales, 'ja-JP')).toBe('ja');
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
