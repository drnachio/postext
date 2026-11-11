import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, PDFStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig, PrintConfig, Resource } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';

// TIFF and Photoshop originals print from their own pixels: a CMYK TIFF
// stays on its plates, a grey one on black.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fogra39 = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
const fixture = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../../postext/src/__tests__/raster/fixtures/${name}`, import.meta.url)));
const pt = (value: number) => ({ value, unit: 'pt' as const });

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

const config: PostextConfig = {
  page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
  bodyText: { fontFamily: 'Lora' },
  headings: { fontFamily: 'Lora' },
  header: { elements: [] },
  footer: { elements: [] },
};

/** The picture's colour space and samples when the preview `pic.png` is
 *  backed by the original `bytes` (as a host's resolver hands it over). */
async function picture(bytes: Uint8Array, print?: PrintConfig, colorSpace?: 'rgb' | 'grayscale' | 'cmyk') {
  const resources: Resource[] = [{
    id: 'pic', typeId: 'figure', kind: 'bitmap', createdAt: 0, updatedAt: 0,
    bitmap: { fileId: 'pic.png', format: 'png', width: 20, height: 10, printFileId: 'pic.orig', printFormat: 'tiff' },
    placement: { position: 'here' },
  }];
  const doc = buildDocument({ markdown: 'A picture.\n\n::resource{id="pic"}', resources }, config);
  const pdf = await PDFDocument.load(await renderToPdf(doc, {
    fontProvider: async () => new Uint8Array(fontBytes),
    outputProfile: fogra39,
    accessible: false,
    resourceBytes: (id) => (id === 'pic.png' ? bytes : undefined),
    ...(print ? { print } : {}),
    ...(colorSpace ? { colorSpace } : {}),
  }));
  let found: { space: string; samples: Uint8Array } | undefined;
  pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (found || !(obj instanceof PDFStream) || obj.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image') return;
    if (obj.dict.lookup(PDFName.of('Width'))?.toString() !== '20') return;
    const cs = obj.dict.lookup(PDFName.of('ColorSpace'));
    found = { space: cs instanceof PDFArray ? cs.lookup(0)!.toString() : String(cs), samples: obj instanceof PDFRawStream ? decodePDFRawStream(obj).decode() : new Uint8Array() };
  });
  return found!;
}

describe('TIFF and Photoshop originals', () => {
  it('print a CMYK TIFF on its own plates, ink for ink', async () => {
    const { space, samples } = await picture(fixture('cmyk-planar-lzw.tif'), { standard: 'pdfx4' });
    expect(space).toBe('/DeviceCMYK');
    expect([...samples.subarray(0, 4)]).toEqual([0, 0, 40, 200]);
  });

  it('print a grey TIFF on black', async () => {
    const { space, samples } = await picture(fixture('gray16-lzw.tif'), { standard: 'pdfx1a' });
    expect(space).toBe('/DeviceGray');
    expect(samples.length).toBe(200);
  });

  it('separate an RGB TIFF and a Photoshop document', async () => {
    expect((await picture(fixture('rgb-lzw.tif'), { standard: 'pdfx4' })).space).toBe('/DeviceCMYK');
    expect((await picture(fixture('rgb.psd'), { standard: 'pdfx4' })).space).toBe('/DeviceCMYK');
  });

  it('show as the screen does in an RGB PDF', async () => {
    expect((await picture(fixture('cmyk.tif'))).space).toBe('/DeviceRGB');
    expect((await picture(fixture('rgb.psd'))).space).toBe('/DeviceRGB');
  });

  it('go on the job plates in a two-ink job', async () => {
    const { space } = await picture(fixture('rgb.tif'), { standard: 'pdfx4', plates: { inks: ['Black', 'Cyan'], images: ['Black', 'Cyan'] } });
    expect(space).toBe('/DeviceN');
  });
});
