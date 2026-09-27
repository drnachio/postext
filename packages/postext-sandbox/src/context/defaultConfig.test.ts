import { describe, expect, it } from 'vitest';
import { defaultResourceTypes } from 'postext';
import { withDefaultResourceTypes } from './defaultConfig';

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
