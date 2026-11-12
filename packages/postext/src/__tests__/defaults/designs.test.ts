import { describe, it, expect } from 'vitest';
import type { PostextConfig } from '../../index.js';
import {
  BOOK_OWN_KEYS,
  DESIGN_PARTS,
  DESIGN_PART_SLOTS,
  applyDesign,
  designFileIds,
  designMissingStyles,
  designPartOf,
  extractDesign,
  readDesignParts,
  revertDesign,
} from '../../index.js';

const font = (name: string) => ({ name, variants: [{ weight: 400, style: 'normal' as const, fileId: `font-${name}`, format: 'woff2' as const }] });

const BOOK: PostextConfig = {
  locale: 'es',
  page: { width: { value: 15, unit: 'cm' }, height: { value: 21, unit: 'cm' }, binding: 'right', cutLines: { enabled: true } } as PostextConfig['page'],
  layout: { columnCount: 2, writingMode: 'vertical-rl' } as PostextConfig['layout'],
  bodyText: { fontFamily: 'Lora', fontSize: { value: 11, unit: 'pt' } } as PostextConfig['bodyText'],
  paragraphStyles: [{ id: 'quote', name: 'Quote' }, { id: 'aside', name: 'Aside' }] as PostextConfig['paragraphStyles'],
  colorPalette: [{ id: 'main', name: 'Main', value: { model: 'hex', hex: '#112233' } }] as PostextConfig['colorPalette'],
  header: { enabled: true } as PostextConfig['header'],
  customFonts: [font('Lora'), font('Unused')] as PostextConfig['customFonts'],
  resourceTypes: [],
  chapterStyles: [{ id: 'appendix', name: 'Appendix', config: { layout: { columnCount: 1 }, header: { enabled: false } } }],
};

describe('design parts', () => {
  it('places every slot in one part, the shared keys split by field', () => {
    expect(designPartOf('page')).toBe('page');
    expect(designPartOf('page', 'binding')).toBe('writing');
    expect(designPartOf('page', 'cutLines')).toBe('output');
    expect(designPartOf('page', 'baselineGrid')).toBe('advanced');
    expect(designPartOf('layout', 'writingMode')).toBe('writing');
    expect(designPartOf('layout', 'columnCount')).toBe('page');
    for (const key of BOOK_OWN_KEYS) expect(designPartOf(key)).toBeUndefined();
    expect(new Set(DESIGN_PART_SLOTS.map((s) => s.part))).toEqual(new Set(DESIGN_PARTS));
  });

  it('reads parts from a list or a comma-separated string, in panel order', () => {
    expect(readDesignParts('text, page,nope')).toEqual(['page', 'text']);
    expect(readDesignParts(['colors', 7])).toEqual(['colors']);
    expect(readDesignParts(undefined)).toEqual([]);
  });
});

describe('extractDesign', () => {
  it('takes the chosen parts only, never the book’s own settings', () => {
    const d = extractDesign(BOOK, ['page']);
    expect(d.parts).toEqual(['page']);
    expect(d.config.locale).toBeUndefined();
    expect(d.config.resourceTypes).toBeUndefined();
    expect(d.config.page?.binding).toBeUndefined();
    expect((d.config.page as { cutLines?: unknown }).cutLines).toBeUndefined();
    expect(d.config.layout?.writingMode).toBeUndefined();
    expect(d.config.layout?.columnCount).toBe(2);
    expect(d.config.bodyText).toBeUndefined();
    expect(d.config.chapterStyles).toEqual([{ id: 'appendix', name: 'Appendix', config: { layout: { columnCount: 1 } } }]);
  });

  it('carries the font families the parts use, and only those', () => {
    const d = extractDesign(BOOK, ['text']);
    expect(d.config.customFonts?.map((f) => f.name)).toEqual(['Lora']);
    expect(designFileIds(d.config).fontIds).toEqual(['font-Lora']);
  });
});

describe('applyDesign', () => {
  const source: PostextConfig = {
    layout: { columnCount: 1 } as PostextConfig['layout'],
    paragraphStyles: [{ id: 'quote', name: 'Cita' }, { id: 'lead', name: 'Lead' }] as PostextConfig['paragraphStyles'],
    bodyText: { fontFamily: 'Garamond' } as PostextConfig['bodyText'],
    customFonts: [font('Garamond')] as PostextConfig['customFonts'],
    chapterStyles: [{ id: 'appendix', config: { bodyText: { fontFamily: 'Garamond' } } }],
  };
  const design = extractDesign(source, ['page', 'text']);

  it('replaces the parts, unset settings back to the defaults', () => {
    const out = applyDesign(BOOK, design);
    expect(out.layout?.columnCount).toBe(1);
    // The writing mode is another part's: it stays.
    expect(out.layout?.writingMode).toBe('vertical-rl');
    expect(out.page?.binding).toBe('right');
    // `page` is unset in the design: the page part goes back to the
    // defaults, the fields of other parts stay.
    expect(out.page?.width).toBeUndefined();
    expect((out.page as { cutLines?: unknown }).cutLines).toEqual({ enabled: true });
    expect(out.bodyText).toEqual({ fontFamily: 'Garamond' });
    expect(out.header).toEqual({ enabled: true });
    expect(out.locale).toBe('es');
  });

  it('merges named styles on their id and keeps the book’s others', () => {
    const out = applyDesign(BOOK, design);
    expect(out.paragraphStyles?.map((s) => [s.id, s.name])).toEqual([['quote', 'Cita'], ['aside', 'Aside'], ['lead', 'Lead']]);
    expect(out.customFonts?.map((f) => f.name)).toEqual(['Lora', 'Unused', 'Garamond']);
  });

  it('merges chapter styles on their id, the other parts of a style kept', () => {
    const out = applyDesign(BOOK, design);
    expect(out.chapterStyles).toEqual([{ id: 'appendix', name: 'Appendix', config: { header: { enabled: false }, bodyText: { fontFamily: 'Garamond' } } }]);
  });

  it('applies only the parts asked for', () => {
    const out = applyDesign(BOOK, design, ['text']);
    expect(out.layout).toEqual(BOOK.layout);
    expect(out.bodyText).toEqual({ fontFamily: 'Garamond' });
  });

  it('adds the palette entries the applied parts link to', () => {
    const linked = extractDesign({
      bodyText: { color: { hex: '#ff0000', paletteId: 'accent' } } as PostextConfig['bodyText'],
      colorPalette: [{ id: 'accent', name: 'Accent', value: { model: 'hex', hex: '#ff0000' } }] as PostextConfig['colorPalette'],
    }, ['text', 'colors']);
    const out = applyDesign(BOOK, linked, ['text']);
    expect(out.colorPalette?.map((e) => e.id)).toEqual(['main', 'accent']);
  });
});

describe('revertDesign', () => {
  it('puts back what the design changed and keeps every other edit', () => {
    const design = extractDesign({ bodyText: { fontFamily: 'Garamond' } as PostextConfig['bodyText'], layout: { columnCount: 3 } as PostextConfig['layout'] }, ['page', 'text']);
    const applied = applyDesign(BOOK, design);
    // Edits made while trying: one outside the design, one over a setting
    // the design set.
    const edited: PostextConfig = { ...applied, header: { enabled: false } as PostextConfig['header'], layout: { ...applied.layout, columnCount: 4 } as PostextConfig['layout'] };
    const out = revertDesign(edited, BOOK, applied);
    expect(out.bodyText).toEqual(BOOK.bodyText);
    expect(out.paragraphStyles).toEqual(BOOK.paragraphStyles);
    expect(out.header).toEqual({ enabled: false });
    expect(out.layout?.columnCount).toBe(4);
    expect(out.page).toEqual(BOOK.page);
  });
});

describe('designMissingStyles', () => {
  it('lists the style ids the text uses that the design lacks', () => {
    const before: PostextConfig = { paragraphStyles: [{ id: 'quote' }, { id: 'aside' }] as PostextConfig['paragraphStyles'] };
    const after: PostextConfig = { paragraphStyles: [{ id: 'quote' }] as PostextConfig['paragraphStyles'] };
    const text = ':::paragraphs{style="aside"}\nText.\n:::\n\n:::paragraphs{style="gone"}\nMore.\n:::\n';
    expect(designMissingStyles([text], before, after)).toEqual([{ kind: 'paragraph', id: 'aside' }]);
  });
});
