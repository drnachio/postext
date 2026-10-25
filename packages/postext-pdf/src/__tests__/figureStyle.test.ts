import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { PDFDocument } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { FontCache } from '../fontCache.js';
import { renderToPdf } from '../pdf-backend/index.js';

// A style's figures (#1237): a feature family (`Source Serif 4@onum+pnum`)
// is the base family's file embedded with the features. Source Serif 4
// sets tabular lining figures by default (539 units each); `pnum` gives
// them their own widths.

const SOURCE_SERIF = readFileSync(new URL('../../../../apps/web/public/presets/openstax-fisica/fonts/SourceSerif4-Regular.ttf', import.meta.url));

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

describe('figure styles in the PDF (#1237)', () => {
  it('embed the base family\'s file with the features, apart from the plain family', async () => {
    const asked: string[] = [];
    const pdf = await PDFDocument.create();
    pdf.registerFontkit(fontkit);
    const cache = new FontCache(pdf, async (family) => {
      asked.push(family);
      return new Uint8Array(SOURCE_SERIF);
    });
    await cache.preloadFontStrings(['16px "Source Serif 4"', '16px "Source Serif 4@onum+pnum"']);
    expect(new Set(asked)).toEqual(new Set(['Source Serif 4']));
    const plain = cache.get('16px "Source Serif 4"')!;
    const figures = cache.get('16px "Source Serif 4@onum+pnum"')!;
    expect(figures).not.toBe(plain);
    expect(plain.widthOfTextAtSize('1111', 1000)).toBe(4 * 539);
    // Old-style proportional ones: a narrower one, the shapes of onum.
    expect(figures.widthOfTextAtSize('1111', 1000)).toBeLessThan(4 * 539);
    const face = fontkit.create(SOURCE_SERIF);
    const ids = (features: Record<string, boolean>) => face.layout('2024', features).glyphs.map((g) => g.id);
    const embedder = (figures as unknown as { embedder: { fontFeatures?: unknown; font: { layout(t: string, f?: unknown): { glyphs: { id: number }[] } } } }).embedder;
    expect(embedder.fontFeatures).toEqual(['onum', 'pnum']);
    expect(embedder.font.layout('2024', embedder.fontFeatures).glyphs.map((g) => g.id)).toEqual(ids({ onum: true, pnum: true }));
    expect(ids({ onum: true, pnum: true })).not.toEqual(ids({}));
  });

  it('a document with old-style body figures asks the provider for the base family only', async () => {
    const asked = new Set<string>();
    const config: PostextConfig = {
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      bodyText: { fontFamily: 'Source Serif 4', figureStyle: 'oldstyle', hyphenation: { enabled: false } },
      headings: { fontFamily: 'Source Serif 4' },
      tableStyle: { figureStyle: 'lining-tabular' },
    };
    const doc = buildDocument({ markdown: '# 1492\n\nIn 1984 and 2024.' }, config);
    const bytes = await renderToPdf(doc, {
      accessible: false,
      fontProvider: async (family) => {
        asked.add(family);
        return new Uint8Array(SOURCE_SERIF);
      },
    });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect([...asked]).toEqual(['Source Serif 4']);
  }, 60_000);

  it('a face whose file lacks a feature keeps the font\'s own figures, and nothing is reported', async () => {
    // Lora has `pnum` and `tnum`, no `onum`.
    const lora = readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
    const config: PostextConfig = {
      layout: { layoutType: 'single' },
      header: { elements: [] },
      footer: { elements: [] },
      bodyText: { fontFamily: 'Lora', figureStyle: 'oldstyle-tabular', hyphenation: { enabled: false } },
      headings: { fontFamily: 'Lora' },
    };
    const doc = buildDocument({ markdown: 'In 1984 and 2024.' }, config);
    const warnings: { kind: string }[] = [];
    const bytes = await renderToPdf(doc, { accessible: false, fontProvider: async () => new Uint8Array(lora), onWarning: (w) => warnings.push(w as never) });
    expect(bytes.byteLength).toBeGreaterThan(1000);
    expect(warnings).toEqual([]);
  }, 60_000);
});
