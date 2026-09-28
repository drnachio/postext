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
});
