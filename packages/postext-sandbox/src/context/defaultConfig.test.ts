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

describe('relocalizedResourceTypes', () => {
  it('swaps untouched built-in types for the new language', () => {
    const spanish = { resourceTypes: defaultResourceTypes('es') };
    const zh = relocalizedResourceTypes(spanish, 'zh-Hant', 'es')!;
    expect(zh.map((t) => t.name)).toEqual(['圖', '表']);
    expect(zh[0]!.numberingTemplate).toBe('{h1}-{n}');
    // Back from Chinese to unset: the app language again.
    expect(relocalizedResourceTypes({ locale: 'zh-Hans', resourceTypes: defaultResourceTypes('zh-Hans') }, undefined, 'en')!.map((t) => t.name)).toEqual(['Figure', 'Table']);
  });

  it('keeps customised types and changes nothing when the strings are equal', () => {
    const custom = { resourceTypes: defaultResourceTypes('es').map((t, i) => (i === 0 ? { ...t, name: 'Lámina' } : t)) };
    expect(relocalizedResourceTypes(custom, 'zh-Hans', 'es')).toBeUndefined();
    expect(relocalizedResourceTypes({ resourceTypes: defaultResourceTypes('es') }, 'es-MX', 'es')).toBeUndefined();
    expect(relocalizedResourceTypes({}, 'zh-Hans', 'es')).toBeUndefined();
  });
});
