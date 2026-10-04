import { describe, it, expect, afterEach } from 'vitest';
import type { CustomFontFamily, DesignTextElement } from 'postext';
import { DEFAULT_FOOTER_SLOT, DEFAULT_HEADER_SLOT, DEFAULT_TEXT_ELEMENT, parseMarkdown } from 'postext';
import {
  customFontsSignature,
  getConfigFontFamilies,
  setCustomFonts,
  collectFontUsage,
  hasLatinEmphasis,
  isRemovedCustomFontFamily,
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

describe('isRemovedCustomFontFamily', () => {
  afterEach(() => setCustomFonts(undefined, { newBook: true }));
  const notoSC = family('Noto Serif SC', [[400, 'normal', 'f1']]);
  const garamond = family('EB Garamond', [[400, 'normal', 'f2']]);

  it('reports a family the author deleted from the book', () => {
    setCustomFonts([notoSC, garamond]);
    setCustomFonts([garamond]);
    expect(isRemovedCustomFontFamily('Noto Serif SC')).toBe(true);
    expect(isRemovedCustomFontFamily('EB Garamond')).toBe(false);
  });

  it('forgets the families another book bundled: the next book may ask Google Fonts for them', () => {
    // 紅樓夢 bundles Noto Serif SC and EB Garamond; the guide and a blank
    // book name the same families, served by Google Fonts.
    setCustomFonts([notoSC, garamond], { newBook: true });
    setCustomFonts([], { newBook: true });
    expect(isRemovedCustomFontFamily('Noto Serif SC')).toBe(false);
    expect(isRemovedCustomFontFamily('EB Garamond')).toBe(false);
    // Deleting a family in the new book is reported again.
    setCustomFonts([garamond]);
    setCustomFonts([]);
    expect(isRemovedCustomFontFamily('EB Garamond')).toBe(true);
    expect(isRemovedCustomFontFamily('Noto Serif SC')).toBe(false);
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

  it('collects the paragraph style fonts', () => {
    const families = getConfigFontFamilies({ paragraphStyles: [{ id: 'dir', fontFamily: 'Stage Serif', italic: true }, { id: 'plain' }] });
    expect(families).toContain('Stage Serif');
  });

  it('collects the chip style fonts', () => {
    const families = getConfigFontFamilies({ chipStyles: [{ id: 'key', fontFamily: 'Key Mono' }, { id: 'tag' }] });
    expect(families).toContain('Key Mono');
  });

  // The design-slot elements (running heads, footers, openers, part and
  // contents designs) are laid out by the worker too: a family named only
  // there must reach it, or that text is measured with a fallback font.
  const text = (content: string, fontFamily?: string): DesignTextElement => ({
    kind: 'text',
    id: content,
    placement: { anchor: { to: 'container', edge: 'top' } },
    content,
    fontSize: { value: 8, unit: 'pt' },
    overflow: 'ellipsis-end',
    ...(fontFamily ? { fontFamily } : {}),
  });

  it('collects the fonts of design-slot elements, wherever the slot is', () => {
    const families = getConfigFontFamilies({
      bodyText: { fontFamily: 'Body Serif' },
      headings: {
        fontFamily: 'Head Sans',
        levels: [{ level: 1, advancedDesign: { enabled: true, slot: { elements: [text('{titleText}', 'Opener Display')] } } }],
      },
      header: { elements: [text('{title}', 'Running Head Sans')] },
      footer: { elements: [text('{pageNumber}', 'Folio Sans')] },
      headingStyles: [{
        id: 'preface',
        name: 'Preface',
        header: { elements: [text('{titleText}', 'Section Head Sans')] },
        footer: { elements: [text('{pageNumber}', 'Section Folio Sans')] },
      }],
      parts: { design: { elements: [text('{titleText}', 'Part Display')] } },
      toc: { parts: { design: { elements: [text('{titleText}', 'Contents Part Sans')] } } },
    });
    for (const family of [
      'Opener Display', 'Running Head Sans', 'Folio Sans', 'Section Head Sans', 'Section Folio Sans',
      'Part Display', 'Contents Part Sans',
    ]) {
      expect(families).toContain(family);
    }
    expect(new Set(families).size).toBe(families.length);
  });

  it('collects the families the engine falls back to in design slots', () => {
    // No header / footer: the built-in running head and folio are drawn.
    const defaults = getConfigFontFamilies({ bodyText: { fontFamily: 'Body Serif' } });
    for (const el of [...DEFAULT_HEADER_SLOT.elements, ...DEFAULT_FOOTER_SLOT.elements]) {
      if (el.kind === 'text') expect(defaults).toContain(el.fontFamily);
    }
    // A text element that names no family is set in the element default.
    const unnamed = getConfigFontFamilies({ bodyText: { fontFamily: 'Body Serif' }, header: { elements: [text('{title}')] } });
    expect(unnamed).toContain(DEFAULT_TEXT_ELEMENT.fontFamily);
  });

  it('skips the fonts of a switched-off heading design', () => {
    const families = getConfigFontFamilies({
      headings: {
        levels: [{ level: 1, advancedDesign: { enabled: false, slot: { elements: [text('{titleText}', 'Unused Display')] } } }],
      },
    });
    expect(families).not.toContain('Unused Display');
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

  it('reads the italic flag of paragraph styles and callout bodies', () => {
    const config = {
      paragraphStyles: [{ id: 'dir', fontFamily: 'Stage', fontWeight: 300, italic: true }],
      calloutStyles: [{ id: 'aside', body: { fontFamily: 'Aside', italic: true } }],
    } as unknown as import('postext').PostextConfig;
    const usage = collectFontUsage(config);
    expect(usage.get('Stage')).toEqual([{ weight: 300, style: 'italic' }]);
    expect(usage.get('Aside')).toEqual([{ weight: 400, style: 'italic' }]);
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

  it('asks no italics of the body family where emphasis is set as dots and no Latin is emphasised', () => {
    const none = { latinEmphasis: false };
    const body = (extra: object, doc?: { latinEmphasis?: boolean }) => collectFontUsage({ bodyText: { fontFamily: 'Noto Serif TC' }, ...extra } as unknown as import('postext').PostextConfig, doc).get('Noto Serif TC');
    const italics = (extra: object, doc?: { latinEmphasis?: boolean }) => body(extra, doc)!.filter((v) => v.style === 'italic');
    // A Chinese document whose `*…*` holds Chinese text only: dots. Bold is asked.
    expect(italics({ locale: 'zh-Hant' }, none)).toEqual([]);
    expect(body({ locale: 'zh-Hant' }, none)).toContainEqual({ weight: 700, style: 'normal' });
    expect(italics({ locale: 'en', cjk: { emphasis: 'dots' } }, none)).toEqual([]);
    // Latin in `*…*` keeps its italics, and a text not known may hold some.
    expect(italics({ locale: 'zh-Hant' }, { latinEmphasis: true })).toHaveLength(2);
    expect(italics({ locale: 'zh-Hant' })).toHaveLength(2);
    // Italic emphasis asks for both italics, as in any other document.
    expect(italics({ locale: 'zh-Hans', cjk: { emphasis: 'italic' } }, none)).toHaveLength(2);
    expect(italics({ locale: 'en' }, none)).toHaveLength(2);
  });

  it('asks no italics of the body family where emphasis is not set in italics', () => {
    const italics = (extra: object) => collectFontUsage({ bodyText: { fontFamily: 'Amiri', ...extra }, locale: 'ar' } as unknown as import('postext').PostextConfig).get('Amiri')!.filter((v) => v.style === 'italic');
    // Arabic sets `*…*` in bold by default, and so does an explicit `bold`.
    expect(italics({})).toEqual([]);
    expect(italics({ emphasis: 'bold' })).toEqual([]);
    expect(italics({ emphasis: 'overline' })).toEqual([]);
    // Asked for italics, it needs them.
    expect(italics({ emphasis: 'italic' })).toHaveLength(2);
  });

  it('reports the missing italics of a Latin body face that emphasises Latin in a Chinese document', () => {
    // `*…*` sets dots under 强调 and keeps *emphasis* italic, in EB Garamond.
    const config = { locale: 'zh-Hant', bodyText: { fontFamily: '"EB Garamond", "Noto Serif TC"' } } as unknown as import('postext').PostextConfig;
    const garamond = family('EB Garamond', [[400, 'normal'], [700, 'normal']]);
    const latin = hasLatinEmphasis(parseMarkdown('這是*强调*與 *emphasis* 之別'));
    expect(latin).toBe(true);
    expect(missingUsedVariants(garamond, config, { latinEmphasis: latin })).toEqual([
      { weight: 400, style: 'italic' },
      { weight: 700, style: 'italic' },
    ]);
    expect(missingUsedVariants(garamond, config)).toHaveLength(2);
    // Chinese text alone in emphasis, a Latin word outside it, a heading's
    // own italics, a formula: none of them asks the body face for italics.
    const chinese = hasLatinEmphasis(parseMarkdown('# *Title* 題\n\n這是*强调*，*「紅樓夢」*與 emphasis 之別 *$x$*'));
    expect(chinese).toBe(false);
    expect(missingUsedVariants(garamond, config, { latinEmphasis: chinese })).toEqual([]);
  });

  it('asks bold and the other slant of a design text set with inline marks', () => {
    const config = {
      header: {
        elements: [
          { kind: 'text', id: 'a', content: 'x', fontFamily: 'Marks', fontWeight: 300, italic: true, inlineMarks: true },
          { kind: 'text', id: 'b', content: 'y', fontFamily: 'Plain', fontWeight: 300 },
        ],
      },
    } as unknown as import('postext').PostextConfig;
    const usage = collectFontUsage(config);
    expect(usage.get('Marks')).toEqual(expect.arrayContaining([
      { weight: 700, style: 'italic' },
      { weight: 300, style: 'normal' },
    ]));
    expect(usage.get('Plain')).toEqual([{ weight: 300, style: 'normal' }]);
  });
});
