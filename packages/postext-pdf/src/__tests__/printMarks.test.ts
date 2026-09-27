import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFNumber, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument, dimensionToPx } from 'postext';
import type { PdfColorSpace, PostextConfig } from 'postext';
import { renderToPdf } from '../pdf-backend';
import { parseFontString } from '../fontString';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

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

const mm = (value: number) => ({ value, unit: 'mm' as const });
const MM = 72 / 25.4;

type CutLines = NonNullable<NonNullable<PostextConfig['page']>['cutLines']>;

/** A 170 × 227 mm page (the EF-120 report), no running heads. */
function config(cutLines?: CutLines): PostextConfig {
  return {
    page: { sizePreset: 'custom', width: mm(170), height: mm(227), dpi: 150, ...(cutLines ? { cutLines } : {}) },
    header: { elements: [] },
    footer: { elements: [] },
  };
}

async function render(cutLines: CutLines | undefined, colorSpace?: PdfColorSpace) {
  const doc = buildDocument({ markdown: 'A paragraph of text.' }, config(cutLines));
  const bytes = await renderToPdf(doc, { fontProvider, ...(colorSpace ? { colorSpace } : {}) });
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  const contents = page.node.Contents();
  const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
  const content = streams
    .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
    .join('\n');
  const box = (name: string): number[] | undefined => {
    const arr = page.node.lookupMaybe(PDFName.of(name), PDFArray);
    return arr?.asArray().map((n) => (n as PDFNumber).asNumber());
  };
  return { pdf, page, content, box, doc };
}

/** Every `x1 y1 m x2 y2 l S` line of a content stream, in points. */
function strokedLines(content: string): Array<{ x1: number; y1: number; x2: number; y2: number; ops: string }> {
  const num = '(-?[\\d.]+)';
  const re = new RegExp(`((?:[^\\n]*\\n){0,4}?)${num} ${num} m\\s+${num} ${num} l\\s+S`, 'g');
  return [...content.matchAll(re)].map((m) => ({ ops: m[1]!, x1: +m[2]!, y1: +m[3]!, x2: +m[4]!, y2: +m[5]! }));
}

const close = (a: number[] | undefined, b: number[]) => {
  expect(a).toBeDefined();
  expect(a!.length).toBe(4);
  a!.forEach((v, i) => expect(v).toBeCloseTo(b[i]!, 3));
};

// EF-125. With cut lines on, the MediaBox is the whole sheet, marks
// included; a print workflow needs the trimmed page (TrimBox) and the art
// that runs past it (BleedBox) on every page.
describe('print boxes (EF-125)', () => {
  it('sets TrimBox to the trimmed page and BleedBox to the trim plus the bleed', async () => {
    const { pdf, box } = await render({ enabled: true, bleed: mm(5) });
    // Sheet: 170 + 2 × (5 + 3 + 5) mm = 196 mm wide, 253 mm tall.
    const [, , w, h] = box('MediaBox')!;
    expect(w! / MM).toBeCloseTo(196, 3);
    expect(h! / MM).toBeCloseTo(253, 3);
    close(box('TrimBox'), [13 * MM, 13 * MM, 183 * MM, 240 * MM]);
    close(box('BleedBox'), [8 * MM, 8 * MM, 188 * MM, 245 * MM]);
    for (const page of pdf.getPages()) {
      expect(page.getTrimBox().width / MM).toBeCloseTo(170, 3);
      expect(page.getBleedBox().width / MM).toBeCloseTo(180, 3);
    }
  });

  it('adds no boxes when cut lines are off (the page is the trim)', async () => {
    const { box } = await render(undefined);
    expect(box('TrimBox')).toBeUndefined();
    expect(box('BleedBox')).toBeUndefined();
  });
});

// EF-120. The marks started markOffset outside the trim even when the bleed
// was wider, so their inner ends lay over art running into the bleed.
describe('crop marks in the PDF (EF-120)', () => {
  it('keeps every mark outside the BleedBox', async () => {
    const { content } = await render({ enabled: true, bleed: mm(5) });
    // The trim plus 5 mm of bleed, 8 mm inside the 196 × 253 mm sheet.
    const [bx0, by0, bx1, by1] = [8 * MM, 8 * MM, 188 * MM, 245 * MM];
    const lines = strokedLines(content);
    expect(lines).toHaveLength(8);
    const eps = 1e-3;
    for (const l of lines) {
      for (const [x, y] of [[l.x1, l.y1], [l.x2, l.y2]] as const) {
        const inside = x > bx0! + eps && x < bx1! - eps && y > by0! + eps && y < by1! - eps;
        expect(inside).toBe(false);
      }
      // 5 mm long, from the bleed edge outwards.
      expect(Math.hypot(l.x2 - l.x1, l.y2 - l.y1) / MM).toBeCloseTo(5, 3);
    }
  });

  it('draws the marks 3 to 8 mm outside the trim with the defaults, as before', async () => {
    const { content, doc } = await render({ enabled: true });
    const trim = (doc.trimOffset * 72) / 150 / MM;
    expect(trim).toBeCloseTo(dimensionToPx(mm(11), 150) * 72 / 150 / MM, 6);
    const lines = strokedLines(content);
    expect(lines).toHaveLength(8);
    // The top-left horizontal mark runs from 8 mm to 3 mm off the sheet's left edge.
    const xs = lines.flatMap((l) => (Math.abs(l.y1 - l.y2) < 1e-6 ? [l.x1, l.x2] : [])).map((v) => v / MM).sort((a, b) => a - b);
    expect(xs[0]).toBeCloseTo(trim - 8, 3);
    expect(xs[1]).toBeCloseTo(trim - 8, 3);
    expect(xs[2]).toBeCloseTo(trim - 3, 3);
  });

  it('sets the marks round the TrimBox it writes, both read from doc.trimOffset', async () => {
    const built = buildDocument({ markdown: 'A paragraph of text.' }, config({ enabled: true }));
    // A trim offset the cut-line settings alone would not give.
    const doc = { ...built, trimOffset: built.trimOffset + dimensionToPx(mm(4), 150) };
    const pdf = await PDFDocument.load(await renderToPdf(doc, { fontProvider }));
    const page = pdf.getPage(0);
    const contents = page.node.Contents();
    const streams = contents instanceof PDFArray ? contents.asArray().map((r) => pdf.context.lookup(r)) : [contents];
    const content = streams
      .map((s) => (s instanceof PDFRawStream ? Buffer.from(decodePDFRawStream(s).decode()).toString('latin1') : ''))
      .join('\n');
    const trimLeft = page.getTrimBox().x / MM;
    expect(trimLeft).toBeCloseTo(15, 3);
    const xs = strokedLines(content)
      .flatMap((l) => (Math.abs(l.y1 - l.y2) < 1e-6 ? [l.x1, l.x2] : []))
      .map((v) => v / MM)
      .sort((a, b) => a - b);
    // The left marks run 3 to 8 mm outside the TrimBox.
    expect(xs[0]).toBeCloseTo(trimLeft - 8, 3);
    expect(xs[2]).toBeCloseTo(trimLeft - 3, 3);
  });
});

// EF-125. A CMYK file printed the marks '0 0 0 1 K', on the black plate
// alone; crop marks belong on every plate, in registration colour.
describe('crop mark colour (EF-125)', () => {
  it('paints the marks in the /All separation in CMYK output', async () => {
    const { content, page, pdf } = await render({ enabled: true, bleed: mm(5) }, 'cmyk');
    const lines = strokedLines(content);
    expect(lines).toHaveLength(8);
    for (const l of lines) {
      expect(l.ops).toMatch(/\/(\S+) CS\s+1 SCN/);
      expect(l.ops).not.toMatch(/\bK\b/);
    }
    const name = /\/(\S+) CS\s+1 SCN/.exec(lines[0]!.ops)![1]!;
    const resources = page.node.Resources()!;
    const spaces = resources.lookup(PDFName.of('ColorSpace'), PDFDict);
    const space = spaces.lookup(PDFName.of(name), PDFArray);
    const [family, colorant, alternate, fn] = space.asArray().map((o) => pdf.context.lookup(o));
    expect(String(family)).toBe('/Separation');
    expect(String(colorant)).toBe('/All');
    expect(String(alternate)).toBe('/DeviceCMYK');
    const c1 = (fn as PDFDict).lookup(PDFName.of('C1'), PDFArray).asArray().map((n) => (n as PDFNumber).asNumber());
    expect(c1).toEqual([1, 1, 1, 1]);
  });

  it('keeps the configured colour in RGB and grayscale output', async () => {
    for (const [space, ink] of [['rgb', /0 0 0 RG/], ['grayscale', /0 G/]] as const) {
      const { content } = await render({ enabled: true, color: { hex: '#000000', model: 'hex' } }, space);
      const lines = strokedLines(content);
      expect(lines).toHaveLength(8);
      for (const l of lines) {
        expect(l.ops).toMatch(ink);
        expect(l.ops).not.toMatch(/SCN/);
      }
    }
  });
});
