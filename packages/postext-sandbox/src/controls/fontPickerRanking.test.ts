import { describe, expect, it } from 'vitest';
import { ARABIC_FONTS, chineseSubsetsFor, rankFontsForScript, scriptSubsetsFor, type FontEntry } from './FontPicker';
import { configFontSampleText } from './fontLoader';

const entry = (family: string, ...subsets: string[]): FontEntry => ({ family, subsets });

describe('font picker ranking by script (#381)', () => {
  it('asks for the Arabic subset in an Arabic-script document', () => {
    expect(scriptSubsetsFor('ar')).toEqual(['arabic']);
    expect(scriptSubsetsFor('ar-MA')).toEqual(['arabic']);
    expect(scriptSubsetsFor('fa-IR')).toEqual(['arabic']);
    expect(scriptSubsetsFor('zh-Hant')).toEqual(chineseSubsetsFor('zh-Hant'));
    expect(scriptSubsetsFor('en')).toEqual([]);
    expect(scriptSubsetsFor(undefined)).toEqual([]);
  });

  it('puts the families with Arabic first, the book faces in their order', () => {
    // As the Fontsource catalogue lists them: by name.
    const fonts = [
      entry('Alexandria', 'arabic', 'latin'),
      entry('Amiri', 'arabic', 'latin', 'latin-ext'),
      entry('EB Garamond', 'latin'),
      entry('Lateef', 'arabic', 'latin'),
      entry('Noto Naskh Arabic', 'arabic', 'latin'),
      entry('Noto Serif SC', 'chinese-simplified', 'latin'),
      entry('Reem Kufi', 'arabic', 'latin'),
    ];
    const ranked = rankFontsForScript(fonts, ['arabic'], ARABIC_FONTS);
    expect(ranked.script.map((f) => f.family)).toEqual(['Amiri', 'Noto Naskh Arabic', 'Lateef', 'Reem Kufi', 'Alexandria']);
    expect(ranked.other.map((f) => f.family)).toEqual(['EB Garamond', 'Noto Serif SC']);
    // Without a preference the catalogue order stands.
    expect(rankFontsForScript(fonts, ['arabic']).script.map((f) => f.family)).toEqual(['Alexandria', 'Amiri', 'Lateef', 'Noto Naskh Arabic', 'Reem Kufi']);
  });

  it('loads an Arabic letter and digit with the faces of an Arabic document', () => {
    expect(configFontSampleText({ locale: 'ar' })).toBe(' ب١');
    expect(configFontSampleText({ bodyText: { hyphenation: { locale: 'ar-EG' } } })).toBe(' ب١');
    expect(configFontSampleText({ locale: 'en' })).toBe(' ');
    expect(configFontSampleText({})).toBe(' ');
  });
});
