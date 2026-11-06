import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFDict, PDFDocument, PDFName, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend/index.js';
import { cffTableOf, isCidKeyedCff } from '../fontCache/cffProgram.js';

// #1436: a CFF OpenType face embedded whole is declared as CFF
// (CIDFontType0, FontFile3 / CIDFontType0C with the bare CFF program),
// not as TrueType (CIDFontType2, FontFile2 with the whole .otf).

const tinyCff = new Uint8Array(fs.readFileSync(new URL('./fixtures/tiny-cff.otf', import.meta.url)));
const lora = new Uint8Array(fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url)));

class StubCtx {
  font = '';
  measureText(s: string): { width: number } { return { width: s.length * 7 }; }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx { return new StubCtx(); }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const config = (fontFamily: string): PostextConfig => ({
  page: { width: pt(300), height: pt(200), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  bodyText: { fontFamily },
});

interface Declared { subtype: string; cidToGidMap: boolean; file: string; fileSubtype?: string; program: Uint8Array }

/** How each embedded CID font of a PDF is declared. */
async function declaredFonts(bytes: Uint8Array): Promise<Declared[]> {
  const doc = await PDFDocument.load(bytes);
  const out: Declared[] = [];
  for (const [, obj] of doc.context.enumerateIndirectObjects()) {
    if (!(obj instanceof PDFDict)) continue;
    const subtype = obj.get(PDFName.of('Subtype'))?.toString();
    if (subtype !== '/CIDFontType0' && subtype !== '/CIDFontType2') continue;
    const descriptor = obj.lookup(PDFName.of('FontDescriptor'), PDFDict);
    const key = ['FontFile3', 'FontFile2'].find((k) => descriptor.has(PDFName.of(k)))!;
    const stream = descriptor.lookup(PDFName.of(key)) as PDFRawStream;
    out.push({
      subtype,
      cidToGidMap: obj.has(PDFName.of('CIDToGIDMap')),
      file: key,
      fileSubtype: stream.dict.get(PDFName.of('Subtype'))?.toString(),
      program: decodePDFRawStream(stream).decode(),
    });
  }
  return out;
}

/** A minimal CFF program whose Top DICT holds the given bytes. */
function cffWithTopDict(top: number[]): Uint8Array {
  return new Uint8Array([
    1, 0, 4, 1, // header: version 1.0, header size 4, offSize 1
    0, 1, 1, 1, 2, 0x41, // Name INDEX: one name, "A"
    0, 1, 1, 1, top.length + 1, ...top, // Top DICT INDEX: one dict
  ]);
}

describe('CFF OpenType faces are declared as CFF (#1436)', () => {
  it('writes CIDFontType0 with the bare CFF program in FontFile3', async () => {
    const doc = buildDocument({ markdown: 'Tiny cab' }, config('Tiny CFF'));
    const pdf = await renderToPdf(doc, { fontProvider: async () => tinyCff });
    const fonts = await declaredFonts(pdf);
    expect(fonts).toHaveLength(1);
    const [font] = fonts;
    expect(font).toMatchObject({ subtype: '/CIDFontType0', cidToGidMap: false, file: 'FontFile3', fileSubtype: '/CIDFontType0C' });
    expect([...font!.program]).toEqual([...cffTableOf(tinyCff)!]);
  });

  it('leaves TrueType faces as they were', async () => {
    const doc = buildDocument({ markdown: 'Plain text' }, config('Lora'));
    const pdf = await renderToPdf(doc, { fontProvider: async () => lora });
    const fonts = await declaredFonts(pdf);
    expect(fonts.map(({ subtype, cidToGidMap, file }) => ({ subtype, cidToGidMap, file }))).toEqual([
      { subtype: '/CIDFontType2', cidToGidMap: true, file: 'FontFile2' },
    ]);
  });

  it('finds the CFF table only in a CFF OpenType file', () => {
    expect(cffTableOf(tinyCff)?.[0]).toBe(1);
    expect(cffTableOf(lora)).toBeUndefined();
    expect(cffTableOf(new Uint8Array(4))).toBeUndefined();
  });

  it('tells a CID-keyed program (ROS in its Top DICT) from a name-keyed one', () => {
    expect(isCidKeyedCff(cffTableOf(tinyCff)!)).toBe(false);
    // 391 392 0 ROS: operands as 2-byte integers, then 12 30.
    expect(isCidKeyedCff(cffWithTopDict([28, 1, 135, 28, 1, 136, 139, 12, 30]))).toBe(true);
    // A real operand (30 …f) before FullName (12 2): name-keyed.
    expect(isCidKeyedCff(cffWithTopDict([30, 0x1a, 0x2f, 12, 2]))).toBe(false);
    expect(isCidKeyedCff(new Uint8Array([2, 0, 4, 1]))).toBeUndefined();
  });
});
