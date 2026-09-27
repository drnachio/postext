import { describe, it, expect } from 'vitest';
import { LOCALE_OPTIONS, localeOptionsFor } from './constants';

describe('localeOptionsFor', () => {
  it('offers the bundled languages when the value is one of them', () => {
    expect(localeOptionsFor('es')).toBe(LOCALE_OPTIONS);
    expect(localeOptionsFor(undefined)).toBe(LOCALE_OPTIONS);
  });

  it('adds a tag the engine accepts but the list lacks, so the select shows it', () => {
    // A region tag, named after the language whose patterns it uses.
    expect(localeOptionsFor('es-ES').at(-1)).toEqual({ value: 'es-ES', label: 'Español (es-ES)' });
    expect(localeOptionsFor('en').at(-1)).toEqual({ value: 'en', label: 'English (en)' });
    // A language without patterns, as written.
    expect(localeOptionsFor('sv').at(-1)).toEqual({ value: 'sv', label: 'sv' });
    expect(localeOptionsFor('sv')).toHaveLength(LOCALE_OPTIONS.length + 1);
  });
});
