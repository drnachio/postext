import { describe, expect, it } from 'vitest';
import { chapterConfig, type PostextConfig } from 'postext';
import { extractDesign, templateAsChapterStyle } from './designTemplate.js';

// A template kept as a chapter style : what it changes over the
// book, for the chapters and sections that name the style.

const mm = (value: number) => ({ value, unit: 'mm' as const });
const pt = (value: number) => ({ value, unit: 'pt' as const });

const book: PostextConfig = {
  page: { width: mm(170), height: mm(240), margins: { top: mm(20), bottom: mm(20), left: mm(15), right: mm(15) } },
  layout: { layoutType: 'double' },
  bodyText: { fontFamily: 'Lora', fontSize: pt(10) },
  print: { standard: 'pdfx4' } as never,
};

const template: PostextConfig = {
  page: { width: mm(210), height: mm(297), margins: { top: mm(30), bottom: mm(25), left: mm(25), right: mm(25) } },
  layout: { layoutType: 'single' },
  bodyText: { fontFamily: 'Own Serif', fontSize: pt(11) },
  print: { standard: 'pdfx1a' } as never,
  customFonts: [{ name: 'Own Serif', variants: [{ weight: 400, style: 'normal', fileId: 'f1', format: 'woff2' }] }] as never,
};
const design = extractDesign(template);

describe('a template kept as a chapter style', () => {
  it('makes a new style of what the template changes, the book untouched', () => {
    const { config, id, created } = templateAsChapterStyle(book, design, ['page', 'typography'], { name: 'Anexo clínico' });
    expect(created).toBe(true);
    expect(id).toBe('anexo-clinico');
    expect(config.bodyText).toEqual(book.bodyText);
    expect(config.layout).toEqual(book.layout);
    const styled = chapterConfig(config, id);
    expect(styled.bodyText?.fontFamily).toBe('Own Serif');
    expect(styled.layout?.layoutType).toBe('single');
    expect(styled.page?.margins?.top).toEqual(mm(30));
  });

  it('leaves the book\'s page size and print settings to the book', () => {
    const { config, id } = templateAsChapterStyle(book, design, ['page', 'typography', 'print'], { name: 'A4' });
    const own = config.chapterStyles!.find((s) => s.id === id)!.config as Record<string, Record<string, unknown> | undefined>;
    expect(own.page?.width).toBeUndefined();
    expect(own.page?.height).toBeUndefined();
    expect(own.print).toBeUndefined();
    expect(chapterConfig(config, id).page?.width).toEqual(mm(170));
  });

  it('puts the template\'s own families in the book, not in the style', () => {
    const { config, id } = templateAsChapterStyle(book, design, ['typography'], { name: 'Casos' });
    expect(config.customFonts?.map((f) => f.name)).toEqual(['Own Serif']);
    expect(config.chapterStyles!.find((s) => s.id === id)!.config.customFonts).toBeUndefined();
  });

  it('updates a style the book has, keeping what the template does not touch', () => {
    const withStyle: PostextConfig = { ...book, chapterStyles: [{ id: 'casos', name: 'Casos', config: { layout: { layoutType: 'single' } } }] };
    const { config, id, created } = templateAsChapterStyle(withStyle, design, ['typography'], { id: 'casos' });
    expect(created).toBe(false);
    expect(config.chapterStyles).toHaveLength(1);
    const styled = chapterConfig(config, id);
    expect(styled.layout?.layoutType).toBe('single');
    expect(styled.bodyText?.fontFamily).toBe('Own Serif');
  });
});
