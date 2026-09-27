import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, type PDFRef } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig, Resource } from 'postext';
import { renderToPdf, type PdfFontProvider } from '../pdf-backend';
import { FontCache } from '../fontCache';
import { parseFontString } from '../fontString';

// EF-121. `renderToPdf` embedded one font program per requested (family,
// weight, style), even when the provider answered two requests with the
// same file, and pdf-lib wrote every embedded font, even one no page drew
// with. A face is now embedded once per distinct file, and only the fonts
// a page uses are written.

const lora = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const frauncesBold = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Fraunces-Bold.ttf', import.meta.url));
const face = fontkit.create(lora);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    return { width: (face.layout(s).advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config: PostextConfig = {
  page: { width: pt(300), height: pt(420), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
  layout: { layoutType: 'single' },
  header: { elements: [] },
  footer: { elements: [] },
  bodyText: { fontFamily: 'Lora' },
};

interface Embedded {
  /** Type0 fonts in the file. */
  fonts: number;
  /** Embedded font programs (FontFile2 / FontFile3 streams). */
  programs: number;
  /** Fonts no page's resources name. */
  unused: number;
}

async function embedded(bytes: Uint8Array): Promise<Embedded> {
  const pdf = await PDFDocument.load(bytes);
  const refs: string[] = [];
  let programs = 0;
  for (const [ref, obj] of pdf.context.enumerateIndirectObjects()) {
    const dict = obj instanceof PDFDict ? obj : obj instanceof PDFRawStream ? obj.dict : undefined;
    if (!dict) continue;
    if (dict.get(PDFName.of('Type')) === PDFName.of('Font') && dict.get(PDFName.of('Subtype')) === PDFName.of('Type0')) refs.push(ref.toString());
    if (dict.get(PDFName.of('Type')) === PDFName.of('FontDescriptor')) {
      programs += ['FontFile', 'FontFile2', 'FontFile3'].filter((k) => dict.has(PDFName.of(k))).length;
    }
  }
  const used = new Set<string>();
  for (const page of pdf.getPages()) {
    const fonts = page.node.Resources()?.lookupMaybe(PDFName.of('Font'), PDFDict);
    for (const [, ref] of fonts?.entries() ?? []) used.add((ref as PDFRef).toString());
  }
  return { fonts: refs.length, programs, unused: refs.filter((r) => !used.has(r)).length };
}

describe('font programs in the PDF (EF-121)', () => {
  it('embeds one font for faces the provider answers with the same file', async () => {
    const doc = buildDocument({ markdown: 'Some *italic*, **bold** and ***both*** words.' }, config);
    const asked: string[] = [];
    // A provider that stands one file in for every face, a fresh copy each time.
    const provider: PdfFontProvider = async (family, weight, style) => {
      asked.push(`${family} ${weight} ${style}`);
      return new Uint8Array(lora);
    };
    const facts = await embedded(await renderToPdf(doc, { fontProvider: provider }));
    expect(asked).toHaveLength(4);
    expect(facts).toEqual({ fonts: 1, programs: 1, unused: 0 });
  }, 60_000);

  it('keeps a font per distinct file', async () => {
    const doc = buildDocument({ markdown: 'Some *italic*, **bold** and ***both*** words.' }, config);
    const provider: PdfFontProvider = async (_family, weight) => new Uint8Array(weight >= 600 ? frauncesBold : lora);
    expect(await embedded(await renderToPdf(doc, { fontProvider: provider }))).toEqual({ fonts: 2, programs: 2, unused: 0 });
  }, 60_000);

  it('writes no font that no page draws with', async () => {
    const doc = buildDocument({ markdown: 'Some *italic*, **bold** and ***both*** words.' }, config);
    const pdfDoc = await PDFDocument.create();
    pdfDoc.registerFontkit(fontkit);
    const cache = new FontCache(pdfDoc, async (_family, weight) => new Uint8Array(weight >= 600 ? frauncesBold : lora));
    await cache.preloadFontStrings([doc.blocks[0]!.fontString, doc.blocks[0]!.boldFontString]);
    const page = pdfDoc.addPage();
    // Only the regular face is drawn.
    page.drawText('Text', { font: cache.get(doc.blocks[0]!.fontString)!, size: 12 });
    cache.dropUnusedFonts();
    expect(await embedded(await pdfDoc.save())).toEqual({ fonts: 1, programs: 1, unused: 0 });
  }, 60_000);

  it('drops the font of a figure drawn as a picture', async () => {
    // The figure's text asks for its face before the drawing is known to
    // be outside the vector subset (a filter); it is then rasterised, and
    // nothing is set in that face.
    const svg = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="200" height="100" viewBox="0 0 200 100">'
      + '<filter id="f"><feGaussianBlur stdDeviation="2"/></filter>'
      + '<rect width="200" height="100" fill="#8ab" filter="url(#f)"/>'
      + '<text x="10" y="50" font-family="Figure Face" font-size="20">Label</text></svg>',
    );
    const png = Uint8Array.from(atob('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=='), (c) => c.charCodeAt(0));
    const resources: Resource[] = [{
      id: 'fig', typeId: 'figure', kind: 'svg', createdAt: 0, updatedAt: 0,
      svg: { fileId: 'fig.svg', width: 200, height: 100 },
      placement: { position: 'here' },
    }];
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="fig"}', resources }, config);
    const asked: string[] = [];
    const provider: PdfFontProvider = async (family) => {
      asked.push(family);
      return new Uint8Array(family === 'Figure Face' ? frauncesBold : lora);
    };
    const facts = await embedded(await renderToPdf(doc, {
      fontProvider: provider,
      resourceBytes: (id) => (id === 'fig.svg' ? svg : undefined),
      rasterizeSvg: async () => png,
    }));
    expect(asked).toContain('Figure Face');
    expect(facts).toEqual({ fonts: 1, programs: 1, unused: 0 });
  }, 60_000);
});
