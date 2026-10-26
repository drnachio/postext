// The language the Sandbox measures a document's text in (#770): the one
// the layout measured it in, so a mark of the Sandbox's own stands where
// the page paints the text.

import { describe, expect, it } from 'vitest';
import type { PostextConfig, VDTDocument } from 'postext';
import { createBlankBookConfig } from '../../context/defaultConfig.js';
import { createPostextGuideConfig } from '../../context/guideConfig.js';
import { BUILTIN_PRESET_LOCALES } from '../../presets/builtin.js';
import { installLanguageCanvas, LanguageContext } from './languageCanvasStub.js';
import { configShapingLanguage, documentShapingLanguage, measureInLanguage } from './measureLanguage.js';

installLanguageCanvas();

const docOf = (config: PostextConfig): VDTDocument => ({ config }) as unknown as VDTDocument;

describe('documentShapingLanguage', () => {
  it('is the document\'s language, the default, and when it asks for its own', () => {
    expect(documentShapingLanguage(docOf({ locale: 'zh-Hans', bodyText: { shapingLanguage: 'document' } }))).toBe('zh-Hans');
    expect(documentShapingLanguage(docOf({ locale: 'ca', bodyText: { shapingLanguage: 'document' } }))).toBe('ca');
    expect(documentShapingLanguage(docOf({ locale: 'zh-Hans' }))).toBe('zh-Hans');
    expect(documentShapingLanguage(docOf({ locale: 'ca', bodyText: { fontFamily: 'Literata' } }))).toBe('ca');
  });

  it('is undefined, the host\'s, for a document shaped in the host\'s language', () => {
    expect(documentShapingLanguage(docOf({ locale: 'zh-Hans', bodyText: { shapingLanguage: 'host' } }))).toBeUndefined();
    // A document cut down to its pages and blocks, as the tests make them.
    expect(documentShapingLanguage({} as unknown as VDTDocument)).toBeUndefined();
  });
});

describe('configShapingLanguage', () => {
  it('reads a written configuration as its layout will', () => {
    expect(configShapingLanguage({ locale: 'zh-Hans', bodyText: { shapingLanguage: 'document' } }, 'en')).toBe('zh-Hans');
    expect(configShapingLanguage({ bodyText: { shapingLanguage: 'document', hyphenation: { locale: 'ca' } } }, 'en')).toBe('ca');
    expect(configShapingLanguage({ locale: 'zh-Hans', bodyText: { shapingLanguage: 'host' } }, 'en')).toBeUndefined();
    // A configuration that names neither is shaped in its own (#770).
    expect(configShapingLanguage({ locale: 'zh-Hans' }, 'en')).toBe('zh-Hans');
    expect(configShapingLanguage({ bodyText: { hyphenation: { locale: 'ca' } } }, 'en')).toBe('ca');
  });

  it('reads a document that names no language in the interface\'s', () => {
    expect(configShapingLanguage({ bodyText: { shapingLanguage: 'document' } }, 'es')).toBe('es');
    expect(configShapingLanguage({ bodyText: { shapingLanguage: 'document' } }, 'zh')).toBe('zh-Hans');
    expect(configShapingLanguage({}, 'es')).toBe('es');
    expect(configShapingLanguage({ bodyText: { shapingLanguage: 'host' } }, 'es')).toBeUndefined();
  });
});

describe('a new book and the built-in guide (#770)', () => {
  // Neither is stored under an older number, and neither names the
  // setting: both are shaped in their own language, the default from
  // postext 1.30. A stored book keeps the host's through the pin of
  // `configVersion` 14 (`pinLegacyShapingLanguage`).
  it('a blank book is shaped in the language of the interface that starts it', () => {
    for (const [interfaceLocale, tag] of [['en', 'en-US'], ['es', 'es'], ['ca', 'ca'], ['zh-Hans', 'zh-Hans'], ['ar', 'ar'], ['ja', 'ja'], ['pt-BR', 'pt-BR']] as const) {
      const config = createBlankBookConfig(interfaceLocale);
      expect(config.bodyText?.shapingLanguage, interfaceLocale).toBeUndefined();
      expect(configShapingLanguage(config, interfaceLocale), interfaceLocale).toBe(tag);
    }
  });

  it('every edition of the guide is shaped in its own language, whatever the interface', () => {
    const tags: Record<string, string> = { es: 'es', ca: 'ca', en: 'en-US', ar: 'ar', 'zh-Hans': 'zh-Hans', ja: 'ja', 'pt-BR': 'pt-BR', fr: 'fr', de: 'de', it: 'it' };
    expect([...BUILTIN_PRESET_LOCALES].sort()).toEqual(Object.keys(tags).sort());
    for (const edition of BUILTIN_PRESET_LOCALES) {
      const config = createPostextGuideConfig(edition);
      expect(config.bodyText?.shapingLanguage, edition).toBeUndefined();
      for (const interfaceLocale of ['en', 'es', 'ja']) expect(configShapingLanguage(config, interfaceLocale), edition).toBe(tags[edition]);
      expect(documentShapingLanguage(docOf(config)), edition).toBe(tags[edition]);
    }
  });
});

describe('measureInLanguage', () => {
  it('measures a number in the language asked for', () => {
    // Four digits at 10 px: 4.71 px each in Chinese, 5.5 px in English.
    expect(measureInLanguage('zh-Hans', '2026', '10px Song')).toBeCloseTo(18.84, 6);
    expect(measureInLanguage(undefined, '2026', '10px Song')).toBeCloseTo(22, 6);
    expect(measureInLanguage('', '2026', '10px Song')).toBeCloseTo(22, 6);
  });

  it('leaves the context of the host\'s language as it comes', () => {
    LanguageContext.measuredIn.length = 0;
    LanguageContext.host = 'zh';
    try {
      expect(measureInLanguage(undefined, '1984', '10px Song')).toBeCloseTo(18.84, 6);
      expect(LanguageContext.measuredIn).toEqual(['host']);
    } finally {
      LanguageContext.host = 'en';
    }
  });

  it('gives a context one language and never another', () => {
    // Chrome 154: a context set back to `inherit` after a text of several
    // words was measured in a language keeps answering in that language.
    const before = LanguageContext.made.length;
    measureInLanguage('ca', '7 7', '10px Song');
    measureInLanguage(undefined, '7 7', '10px Song');
    measureInLanguage('ca', '77', '10px Song');
    measureInLanguage('tr', '77', '10px Song');
    measureInLanguage(undefined, '77', '10px Song');
    const made = LanguageContext.made.slice(before);
    // The host's context was made by the tests above.
    expect(made.map((c) => c.given)).toEqual([['ca'], ['tr']]);
    expect(LanguageContext.made.filter((c) => c.given.length === 0)).toHaveLength(1);
  });
});
