import { describe, expect, it } from 'vitest';
import { buildDocument, collectConfigWarnings, type PostextConfig } from 'postext';
import { applyDesign, designFileIds, extractDesign } from './designTemplate.js';
import { BUILTIN_TEMPLATES } from './builtinTemplates.js';
import { DEFAULT_LABELS } from '../../types/defaultLabels.js';

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 6 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas ??= class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const font = (name: string, fileId: string) => ({ name, variants: [{ weight: 400, style: 'normal' as const, fileId, format: 'ttf' as const }] });

const book: PostextConfig = {
  locale: 'es',
  page: { sizePreset: '21x28' },
  layout: { layoutType: 'double' },
  bodyText: { fontFamily: 'House Serif', fontSize: pt(10), color: { hex: '#123456', model: 'hex', paletteId: 'brand' } },
  headings: { fontFamily: 'Inter' },
  colorPalette: [{ id: 'brand', name: 'Brand', value: { hex: '#123456', model: 'hex' } }],
  header: { elements: [] },
  print: { standard: 'pdfx4', customProfile: { name: 'Printer', fileId: 'icc-1' } },
  customFonts: [font('House Serif', 'f-1'), font('Unused Sans', 'f-2')],
  resourceTypes: [],
};

describe('extractDesign', () => {
  it('keeps the design parts, drops what belongs to the book, and only the fonts it uses', () => {
    const d = extractDesign(book);
    expect(d.config.locale).toBeUndefined();
    expect(d.config.resourceTypes).toBeUndefined();
    expect(d.config.page?.sizePreset).toBe('21x28');
    expect(d.config.bodyText?.fontFamily).toBe('House Serif');
    expect(d.config.customFonts?.map((f) => f.name)).toEqual(['House Serif']);
    expect(designFileIds(d.config)).toEqual({ fontIds: ['f-1'], blobIds: ['icc-1'] });
  });

  it('saves only the parts asked for', () => {
    const d = extractDesign(book, ['colors']);
    expect(Object.keys(d.config)).toEqual(['colorPalette']);
  });
});

describe('applyDesign', () => {
  const template = extractDesign({
    page: { sizePreset: '12x19' },
    bodyText: { fontFamily: 'Lora', color: { hex: '#aa0000', model: 'hex', paletteId: 'accent' } },
    colorPalette: [{ id: 'accent', name: 'Accent', value: { hex: '#aa0000', model: 'hex' } }],
  });

  it('replaces the applied parts: unset keys go back to their defaults', () => {
    const next = applyDesign(book, template, ['page', 'typography']);
    expect(next.page?.sizePreset).toBe('12x19');
    expect(next.layout).toBeUndefined();
    expect(next.bodyText?.fontFamily).toBe('Lora');
    expect(next.headings).toBeUndefined();
    // Not applied: kept.
    expect(next.locale).toBe('es');
    expect(next.print?.standard).toBe('pdfx4');
    expect(next.customFonts?.map((f) => f.name)).toEqual(['House Serif', 'Unused Sans']);
  });

  it('brings the palette entries an applied part links to when the colours stay', () => {
    const next = applyDesign(book, template, ['typography']);
    expect(next.colorPalette?.map((e) => e.id)).toEqual(['brand', 'accent']);
    const withColours = applyDesign(book, template, ['typography', 'colors']);
    expect(withColours.colorPalette?.map((e) => e.id)).toEqual(['accent']);
  });

  it('ignores parts the template does not hold', () => {
    const next = applyDesign(book, extractDesign(book, ['colors']), ['page', 'colors']);
    expect(next.page?.sizePreset).toBe('21x28');
  });
});

describe('built-in templates', () => {
  it.each(BUILTIN_TEMPLATES.map((t) => [t.id, t] as const))('%s lays out a book without config warnings, and has its words', (_id, t) => {
    expect(collectConfigWarnings(t.config)).toEqual([]);
    const doc = buildDocument({ markdown: '# Title\n\nSome text set in this design.' }, applyDesign({}, { parts: t.parts, config: t.config }, t.parts));
    expect(doc.pages.length).toBeGreaterThan(0);
    expect(DEFAULT_LABELS[t.nameKey]).toBeTruthy();
    expect(DEFAULT_LABELS[t.descriptionKey]).toBeTruthy();
  });
});
