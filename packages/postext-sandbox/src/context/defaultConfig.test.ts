import { describe, expect, it } from 'vitest';
import { defaultResourceTypes } from 'postext';
import { createBlankBookConfig, createDefaultConfig, relocalizedResourceTypes, withDefaultResourceTypes } from './defaultConfig';

describe('createBlankBookConfig', () => {
  it('is the pristine config in English and Spanish', () => {
    expect(createBlankBookConfig('es')).toEqual(createDefaultConfig('es'));
    expect(createBlankBookConfig('en').locale).toBeUndefined();
  });

  it('sets a new book up for Chinese in the Chinese interface', () => {
    const config = createBlankBookConfig('zh-Hans');
    expect(config.locale).toBe('zh-Hans');
    expect(config.bodyText?.fontFamily).toBe('Noto Serif SC');
    expect(config.resourceTypes?.map((t) => t.captionPrefix)).toEqual(['图', '表', '视频']);
    expect(withDefaultResourceTypes(config, 'zh-Hans')).toBe(config);
  });

  it('sets a new book up for Arabic in the Arabic interface', () => {
    const config = createBlankBookConfig('ar');
    expect(config.locale).toBe('ar');
    expect(config.direction).toBeUndefined();
    expect(config.bodyText?.fontFamily).toBe('Amiri');
    expect(config.resourceTypes?.map((t) => t.captionPrefix)).toEqual(['شكل', 'جدول', 'فيديو']);
    expect(config.headings?.levels?.find((l) => l.level === 1)?.numberingTemplate).toBe('الفصل {1:ordinal}');
    expect(withDefaultResourceTypes(config, 'ar')).toBe(config);
  });

  it('sets a new book up for Japanese, vertical, in the Japanese interface', () => {
    const config = createBlankBookConfig('ja');
    expect(config.locale).toBe('ja');
    expect(config.layout?.writingMode).toBe('vertical-rl');
    expect(config.bodyText?.fontFamily).toBe('Noto Serif JP');
    expect(config.resourceTypes).toEqual(defaultResourceTypes('ja'));
    expect(withDefaultResourceTypes(config, 'ja')).toBe(config);
  });
});

describe('withDefaultResourceTypes', () => {
  it('keeps the types a config already has', () => {
    const config = { resourceTypes: defaultResourceTypes('de') };
    expect(withDefaultResourceTypes(config, 'es')).toBe(config);
  });

  it('localises missing types to the document language, else the app language', () => {
    expect(withDefaultResourceTypes({}, 'es').resourceTypes![0]!.name).toBe('Figura');
    expect(withDefaultResourceTypes({ locale: 'de' }, 'es').resourceTypes![0]!.name).toBe('Abbildung');
    expect(withDefaultResourceTypes({ bodyText: { hyphenation: { locale: 'nl' } } }, 'en').resourceTypes![0]!.name).toBe('Figuur');
  });
});

// #198: the Document language of a new book moves from the interface's to
// another one; untouched built-in types follow it, renamed ones stay.
describe('relocalizedResourceTypes', () => {
  it('replaces the built-in types of the previous language', () => {
    const spanish = defaultResourceTypes('es');
    const next = relocalizedResourceTypes(spanish, ['es', 'es'], 'en-us');
    expect(next?.map((t) => t.captionPrefix)).toEqual(['Figure', 'Table', 'Video']);
    // Key order does not matter (a stored config came through JSON).
    const reordered = spanish.map((t) => Object.fromEntries(Object.entries(t).reverse())) as typeof spanish;
    expect(relocalizedResourceTypes(reordered, ['es'], 'fr')?.map((t) => t.name)).toEqual(['Figure', 'Tableau', 'Vidéo']);
    // The interface language counts too (a new book's seed).
    expect(relocalizedResourceTypes(spanish, ['en', 'es'], 'de')?.[0]?.name).toBe('Abbildung');
  });

  it('keeps customised types, and does nothing when they already match', () => {
    const renamed = defaultResourceTypes('es').map((t) => (t.id === 'figure' ? { ...t, name: 'Lámina' } : t));
    expect(relocalizedResourceTypes(renamed, ['es'], 'en')).toBeNull();
    const extra = [...defaultResourceTypes('es'), { ...defaultResourceTypes('es')[0]!, id: 'map', name: 'Mapa' }];
    expect(relocalizedResourceTypes(extra, ['es'], 'en')).toBeNull();
    expect(relocalizedResourceTypes(defaultResourceTypes('en'), ['en'], 'en-us')).toBeNull();
    expect(relocalizedResourceTypes(undefined, ['es'], 'en')).toBeNull();
  });

  // #179: Chinese built-in types, and back from Chinese to the interface's.
  it('follows a Chinese document language and back', () => {
    const zh = relocalizedResourceTypes(defaultResourceTypes('es'), ['es'], 'zh-Hant')!;
    expect(zh.map((t) => t.name)).toEqual(['圖', '表', '影片']);
    expect(zh[0]!.numberingTemplate).toBe('{h1}-{n}');
    expect(relocalizedResourceTypes(defaultResourceTypes('zh-Hans'), ['zh-Hans', 'en'], 'en')!.map((t) => t.name)).toEqual(['Figure', 'Table', 'Video']);
    // The same strings in another region: nothing to change.
    expect(relocalizedResourceTypes(defaultResourceTypes('es'), ['es'], 'es-MX')).toBeNull();
    const custom = defaultResourceTypes('es').map((t, i) => (i === 0 ? { ...t, name: 'Lámina' } : t));
    expect(relocalizedResourceTypes(custom, ['es'], 'zh-Hans')).toBeNull();
  });
});

describe('resource types saved before videos (#454)', () => {
  it('still read as the built-in ones, and relocalise with the video type added', () => {
    const legacy = defaultResourceTypes('es').filter((t) => t.id !== 'video');
    expect(relocalizedResourceTypes(legacy, ['es'], 'en')?.map((t) => t.name)).toEqual(['Figure', 'Table', 'Video']);
  });
});
