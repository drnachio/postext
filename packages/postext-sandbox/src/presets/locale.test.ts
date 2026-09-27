import { describe, expect, it } from 'vitest';
import { choosePresetOpen, resolvePresetLocale } from './locale';

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
