import { describe, it, expect, afterEach } from 'vitest';
import type { CustomFontFamily } from 'postext';
import {
  customFontsSignature,
  getConfigFontFamilies,
  setCustomFonts,
  collectFontUsage,
  missingUsedVariants,
} from './fontLoader';

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

describe('getConfigFontFamilies', () => {
  it('collects the callout style fonts the layout worker must register', () => {
    const families = getConfigFontFamilies({
      bodyText: { fontFamily: 'Literata' },
      headings: { fontFamily: 'Inter' },
      calloutStyles: [
        {
          id: 'badge',
          titleStyle: { fontFamily: 'DIN Next LT Pro' },
          icon: { kind: 'glyph', glyph: '!', fontFamily: 'Symbols A' },
          marker: { kind: 'glyph', glyph: '→', fontFamily: 'Symbols B' },
          body: { fontFamily: 'Merriweather' },
        },
        // Inherits everything: nothing new to register.
        { id: 'note' },
      ],
    });
    for (const family of ['Literata', 'Inter', 'DIN Next LT Pro', 'Symbols A', 'Symbols B', 'Merriweather']) {
      expect(families).toContain(family);
    }
    expect(new Set(families).size).toBe(families.length);
  });

  it('collects the table style fonts, named styles included', () => {
    const families = getConfigFontFamilies({
      tableStyle: { headerFontFamily: 'Header Sans' },
      tableStyles: [{ id: 'option', bodyFontFamily: 'Cell Serif' }, { id: 'plain' }],
    });
    expect(families).toContain('Header Sans');
    expect(families).toContain('Cell Serif');
  });
});

describe('collectFontUsage / missingUsedVariants', () => {
  const family = (name: string, variants: Array<[number, 'normal' | 'italic']>) => ({
    name,
    variants: variants.map(([weight, style]) => ({ weight, style, fileId: `${name}-${weight}-${style}` })),
  }) as unknown as import('postext').CustomFontFamily;

  it('collects the weight and style of every config node naming a family', () => {
    const config = {
      bodyText: { fontFamily: 'Body' },
      calloutStyles: [{ id: 'badge', titleStyle: { fontFamily: 'Badge', fontWeight: 500 } }],
      headings: { fontFamily: 'Head', fontWeight: 700, levels: [{ level: 2, fontFamily: 'Head', fontWeight: 400, fontStyle: 'italic' }] },
    } as unknown as import('postext').PostextConfig;
    const usage = collectFontUsage(config);
    expect(usage.get('Badge')).toEqual([{ weight: 500, style: 'normal' }]);
    expect(usage.get('Head')).toEqual([{ weight: 700, style: 'normal' }, { weight: 400, style: 'italic' }]);
    // The body family needs bold and italic for markdown emphasis.
    expect(usage.get('Body')).toHaveLength(5);
  });

  it('reports only the requested variants a family has no file for', () => {
    const config = {
      bodyText: { fontFamily: 'Body' },
      calloutStyles: [{ id: 'badge', titleStyle: { fontFamily: 'Badge', fontWeight: 500 } }],
    } as unknown as import('postext').PostextConfig;
    expect(missingUsedVariants(family('Badge', [[300, 'normal'], [500, 'normal']]), config)).toEqual([]);
    expect(missingUsedVariants(family('Badge', [[400, 'normal']]), config)).toEqual([{ weight: 500, style: 'normal' }]);
    expect(missingUsedVariants(family('Body', [[400, 'normal']]), config)).toEqual([
      { weight: 700, style: 'normal' },
      { weight: 400, style: 'italic' },
      { weight: 700, style: 'italic' },
    ]);
    expect(missingUsedVariants(family('Unused', []), config)).toEqual([]);
  });
});
