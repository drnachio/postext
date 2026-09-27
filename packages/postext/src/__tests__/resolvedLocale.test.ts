import { describe, it, expect } from 'vitest';
import { resolveAllConfig, resolvedLocale } from '../pipeline/config';
import { buildDocument } from '../pipeline';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 5 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

// The document language spelled-out heading numbers and the outline use:
// `locale`, else the hyphenation locale — a blank or padded tag reads as
// `documentLocale` reads it (blank = unset, padding trimmed).
describe('resolvedLocale', () => {
  it('falls back past a blank locale and trims a padded one', () => {
    expect(resolvedLocale(resolveAllConfig({ locale: '  ', bodyText: { hyphenation: { locale: 'es' } } }))).toBe('es');
    expect(resolvedLocale(resolveAllConfig({ locale: ' es ' }))).toBe('es');
    expect(resolvedLocale(resolveAllConfig({ locale: 'pt-BR' }))).toBe('pt-BR');
    expect(resolvedLocale(resolveAllConfig({}))).toBe('en-us');
  });
});

// Every place that reads the document language treats a blank tag as
// unset — a host may pass an unset select as `''` — so one document never
// mixes languages.
describe('a blank locale everywhere the document language is read', () => {
  const blank = { locale: '', bodyText: { hyphenation: { locale: 'es' } } } as const;

  it('dates the metadata in the hyphenation language', () => {
    const markdown = '---\npublishDate: 2026-04-15\n---\n\nTexto.';
    const unset = buildDocument({ markdown }, { bodyText: { hyphenation: { locale: 'es' } } });
    expect(unset.metadata.publishDate).toBe('15 de abril de 2026');
    expect(buildDocument({ markdown }, { ...blank }).metadata.publishDate).toBe('15 de abril de 2026');
    expect(buildDocument({ markdown }, { locale: '  ', bodyText: { hyphenation: { locale: 'es' } } }).metadata.publishDate)
      .toBe('15 de abril de 2026');
  });

  it('words a split box’s continuation strings like a split table’s', () => {
    for (const hyphenation of ['es', 'fr']) {
      const resolved = resolveAllConfig({ locale: '', bodyText: { hyphenation: { locale: hyphenation } }, calloutStyles: [{ id: 'note' }] });
      const unset = resolveAllConfig({ bodyText: { hyphenation: { locale: hyphenation } }, calloutStyles: [{ id: 'note' }] });
      const box = resolved.calloutStyles[0]!;
      expect(box.continuesMarker).toBe(resolved.tableStyle.continuesMarker);
      expect(box.continuesMarker).toBe(unset.calloutStyles[0]!.continuesMarker);
      expect(box.continuedSuffix).toBe(unset.calloutStyles[0]!.continuedSuffix);
    }
  });
});
