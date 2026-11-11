import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { parseIccProfile, resolvePrintConfig, type DecodedRaster, type PrintConfig } from 'postext';
import { createPrintColorMode } from '../print/colorMode.js';
import { embedPrintDecoded, embedPrintRaster } from '../print/images.js';
import { convertCmykPixels, foreignCmyk } from '../print/imageProfiles.js';

// CMYK pictures separated for another press (front A): converted from
// their own profile for the output's, or tagged with it for the RIP.

const icc = (name: string) => new Uint8Array(fs.readFileSync(new URL(`../../../../apps/web/public/icc/${name}.icc`, import.meta.url)));
const FOGRA39 = icc('fogra39');
const SNAP = icc('snap2007');
const condition = { registryName: 'http://www.color.org', condition: 'FOGRA39', name: 'Coated FOGRA39' };
// Pictures read through their own profiles and CMYK of another press
// converted (both off by default), unless a test says otherwise.
const modeOf = (print: PrintConfig = { standard: 'pdfx4' }) =>
  createPrintColorMode(parseIccProfile(FOGRA39), resolvePrintConfig({ ...print, imageColor: { embeddedProfile: 'use', cmykProfile: 'convert', ...print.imageColor } }), condition);
/** The book's own defaults, untouched. */
const defaultModeOf = (print: PrintConfig) => createPrintColorMode(parseIccProfile(FOGRA39), resolvePrintConfig(print), condition);

/** A 3-pixel CMYK picture: paper, solid black, a cyan-magenta blue. */
const raster = (profile?: Uint8Array): DecodedRaster => ({
  width: 3, height: 1, color: 'cmyk',
  data: new Uint8Array([0, 0, 0, 0, 0, 0, 0, 255, 255, 180, 0, 0]),
  ...(profile ? { icc: profile } : {}),
});

async function written(image: { ref: unknown }, pdf: PDFDocument): Promise<{ space: string; samples: Uint8Array; filter?: string }> {
  const bytes = await pdf.save();
  const back = await PDFDocument.load(bytes);
  let found: { space: string; samples: Uint8Array; filter?: string } | undefined;
  back.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (found || !(obj instanceof PDFRawStream) || obj.dict.lookup(PDFName.of('Subtype'))?.toString() !== '/Image') return;
    const cs = obj.dict.lookup(PDFName.of('ColorSpace'));
    const filter = obj.dict.lookup(PDFName.of('Filter'))?.toString();
    found = { space: cs instanceof PDFArray ? cs.lookup(0)!.toString() : String(cs), samples: filter === '/DCTDecode' ? new Uint8Array() : decodePDFRawStream(obj).decode(), ...(filter ? { filter } : {}) };
  });
  void image;
  return found!;
}

describe('a CMYK picture of another press', () => {
  it('is foreign only when its profile is not the output\'s and conversion is on', () => {
    const mode = modeOf();
    expect(foreignCmyk(parseIccProfile(SNAP), mode)).toBe(true);
    expect(foreignCmyk(parseIccProfile(FOGRA39), mode)).toBe(false);
    expect(foreignCmyk(parseIccProfile(SNAP), modeOf({ standard: 'pdfx4', imageColor: { cmykProfile: 'keep' } }))).toBe(false);
  });

  it('keeps paper as paper and separates its colours again for the output', () => {
    const out = convertCmykPixels(raster().data, modeOf(), parseIccProfile(SNAP));
    expect([...out.subarray(0, 4)]).toEqual([0, 0, 0, 0]);
    // Black alone stays black alone; the blue is another ink mix.
    expect([...out.subarray(4, 7)]).toEqual([0, 0, 0]);
    expect(out[7]!).toBeGreaterThan(120);
    expect([...out.subarray(8, 12)]).not.toEqual([255, 180, 0, 0]);
  });

  it('is converted from a TIFF or Photoshop picture\'s pixels, kept as it is when asked, tagged in PDF/X-4 when pictures are kept', async () => {
    const pdf = await PDFDocument.create();
    const converted = await written(embedPrintDecoded(pdf, raster(SNAP), modeOf()), pdf);
    expect(converted.space).toBe('/DeviceCMYK');
    expect([...converted.samples.subarray(8, 12)]).not.toEqual([255, 180, 0, 0]);

    const pdf2 = await PDFDocument.create();
    const kept = await written(embedPrintDecoded(pdf2, raster(SNAP), modeOf({ standard: 'pdfx4', imageColor: { cmykProfile: 'keep' } })), pdf2);
    expect([...kept.samples]).toEqual([...raster().data]);

    const pdf3 = await PDFDocument.create();
    const tagged = await written(embedPrintDecoded(pdf3, raster(SNAP), modeOf({ standard: 'pdfx4', convertImages: false })), pdf3);
    expect(tagged.space).toBe('/ICCBased');
    expect([...tagged.samples]).toEqual([...raster().data]);
  });

  it('is a JPEG tagged with its own profile in PDF/X-4, and passed through in PDF/X-1a', async () => {
    // SOI, the profile in APP2 segments, a SOF0 of four components, SOS.
    const seg = (seq: number, count: number, data: Uint8Array) => {
      const body = [...'ICC_PROFILE'].map((c) => c.charCodeAt(0)).concat([0, seq, count], [...data]);
      return [0xff, 0xe2, ((body.length + 2) >> 8) & 255, (body.length + 2) & 255, ...body];
    };
    const chunks: number[] = [];
    const parts = Math.ceil(SNAP.length / 60000);
    for (let i = 0; i < parts; i++) chunks.push(...seg(i + 1, parts, SNAP.subarray(i * 60000, (i + 1) * 60000)));
    const sof = [0xff, 0xc0, 0, 20, 8, 0, 2, 0, 3, 4, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 4, 0x11, 0];
    const jpeg = new Uint8Array([0xff, 0xd8, ...chunks, ...sof, 0xff, 0xda, 0, 2, 0xff, 0xd9]);
    const pdf = await PDFDocument.create();
    const x4 = await written(await embedPrintRaster(pdf, jpeg, 'jpeg', modeOf()), pdf);
    expect(x4.space).toBe('/ICCBased');
    expect(x4.filter).toBe('/DCTDecode');
    const pdf2 = await PDFDocument.create();
    const x1a = await written(await embedPrintRaster(pdf2, jpeg, 'jpeg', modeOf({ standard: 'pdfx1a' })), pdf2);
    expect(x1a.space).toBe('/DeviceCMYK');
  });

  it('is kept as it is by default', async () => {
    expect(foreignCmyk(parseIccProfile(SNAP), defaultModeOf({ standard: 'pdfx4' }))).toBe(false);
  });
});
