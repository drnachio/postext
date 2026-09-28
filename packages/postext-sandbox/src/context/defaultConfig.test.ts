import { describe, expect, it } from 'vitest';
import { defaultResourceTypes } from 'postext';
import { relocalizedResourceTypes, withDefaultResourceTypes } from './defaultConfig';

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
    expect(next?.map((t) => t.captionPrefix)).toEqual(['Figure', 'Table']);
    // Key order does not matter (a stored config came through JSON).
    const reordered = spanish.map((t) => Object.fromEntries(Object.entries(t).reverse())) as typeof spanish;
    expect(relocalizedResourceTypes(reordered, ['es'], 'fr')?.map((t) => t.name)).toEqual(['Figure', 'Tableau']);
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
    expect(zh.map((t) => t.name)).toEqual(['圖', '表']);
    expect(zh[0]!.numberingTemplate).toBe('{h1}-{n}');
    expect(relocalizedResourceTypes(defaultResourceTypes('zh-Hans'), ['zh-Hans', 'en'], 'en')!.map((t) => t.name)).toEqual(['Figure', 'Table']);
    // The same strings in another region: nothing to change.
    expect(relocalizedResourceTypes(defaultResourceTypes('es'), ['es'], 'es-MX')).toBeNull();
    const custom = defaultResourceTypes('es').map((t, i) => (i === 0 ? { ...t, name: 'Lámina' } : t));
    expect(relocalizedResourceTypes(custom, ['es'], 'zh-Hans')).toBeNull();
  });
});
