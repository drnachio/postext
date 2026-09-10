import { describe, it, expect, afterEach } from 'vitest';
import type { CustomFontFamily } from 'postext';
import { customFontsSignature, setCustomFonts } from './fontLoader';

const family = (name: string, variants: Array<[number, 'normal' | 'italic', string]>): CustomFontFamily => ({
  name,
  variants: variants.map(([weight, style, fileId]) => ({ weight, style, fileId, format: 'otf' })),
});

describe('customFontsSignature', () => {
  afterEach(() => setCustomFonts(undefined));

  it('is empty for an empty registry and an absent list', () => {
    expect(customFontsSignature()).toBe('');
    expect(customFontsSignature(undefined)).toBe('');
  });

  it('matches the registry to the list it was seeded from, regardless of order', () => {
    const optima = family('Optima', [[400, 'normal', 'f1'], [700, 'normal', 'f2']]);
    const din = family('DIN Pro', [[400, 'normal', 'f3']]);
    setCustomFonts([optima, din]);
    expect(customFontsSignature()).toBe(customFontsSignature([optima, din]));
    expect(customFontsSignature()).toBe(customFontsSignature([din, optima]));
  });

  it('differs when a family is added, removed, or re-uploaded', () => {
    const optima = family('Optima', [[400, 'normal', 'f1']]);
    setCustomFonts([optima]);
    expect(customFontsSignature([])).not.toBe(customFontsSignature());
    expect(customFontsSignature([optima, family('DIN Pro', [[400, 'normal', 'f3']])])).not.toBe(customFontsSignature());
    expect(customFontsSignature([family('Optima', [[400, 'normal', 'f1-new']])])).not.toBe(customFontsSignature());
  });
});
