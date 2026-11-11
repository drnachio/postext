import { describe, expect, it } from 'vitest';
import { PDFArray, PDFDocument, PDFName, PDFNumber, PDFRawStream, StandardFonts, rgb, type PDFContext, type PDFDict } from 'pdf-lib';
import { inspectPrintMaster } from '../print/inspectMaster.js';
import { inspectPrintPdf } from '../print/inspectPdf.js';
import { inlineImageDicts } from '../print/pdfWalk.js';

// Files built by hand, for what a book's own PDF never holds: fonts left
// out, RGB in shadings, Type 3 glyphs, annotation appearances and inline
// images, page boxes that are not boxes (#1474).

const latin1 = (s: string): Uint8Array => Uint8Array.from(s, (c) => c.charCodeAt(0));
const stream = (ctx: PDFContext, text: string, dict: Record<string, unknown> = {}): PDFRawStream =>
  PDFRawStream.of(ctx.obj(dict as never) as unknown as PDFDict, latin1(text));

/** One page painting `content` with `resources`. */
async function onePage(resources: (ctx: PDFContext) => Record<string, unknown>, content = '', extra?: (doc: PDFDocument) => void): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([200, 200]);
  const ctx = doc.context;
  page.node.set(PDFName.of('Resources'), ctx.obj(resources(ctx) as never));
  page.node.set(PDFName.of('Contents'), ctx.register(stream(ctx, content)));
  extra?.(doc);
  return doc.save({ useObjectStreams: false });
}

const rgbShading = (ctx: PDFContext) => ({
  Shading: { Sh0: ctx.obj({ ShadingType: 2, ColorSpace: 'DeviceRGB', Coords: [0, 0, 100, 0], Function: { FunctionType: 2, Domain: [0, 1], C0: [1, 0, 0], C1: [0, 0, 1], N: 1 } }) },
});

const type3 = (ctx: PDFContext) => {
  const glyph = ctx.register(stream(ctx, '1 0 0 rg 0 0 0 0 10 10 d1 0 0 10 10 re f'));
  return {
    Font: {
      F3: ctx.obj({
        Type: 'Font', Subtype: 'Type3', FontBBox: [0, 0, 10, 10], FontMatrix: [0.1, 0, 0, 0.1, 0, 0],
        CharProcs: { a: glyph }, Encoding: { Type: 'Encoding', Differences: [97, 'a'] }, FirstChar: 97, LastChar: 97, Widths: [10],
      }),
    },
  };
};

describe('inspectPrintMaster reads what a placed master paints with', () => {
  it('finds RGB in a shading', async () => {
    const r = await inspectPrintMaster(await onePage(rgbShading, '/Sh0 sh'));
    expect(r.rgb).toBe(true);
  });

  it('finds RGB set in the glyphs of a Type 3 font', async () => {
    const r = await inspectPrintMaster(await onePage(type3, 'BT /F3 12 Tf (a) Tj ET'));
    expect(r.rgb).toBe(true);
    // A Type 3 font is its own program: never "not embedded".
    expect(r.nonEmbeddedFonts).toEqual([]);
  });

  it('a CMYK master stays clean', async () => {
    const r = await inspectPrintMaster(await onePage(() => ({}), '0 0 0 1 k 0 0 10 10 re f'));
    expect(r).toEqual({ nonEmbeddedFonts: [], rgb: false, spotInks: [], transparency: false });
  });
});

describe('inspectPrintPdf', () => {
  it('lists a face used without its program even when it is also embedded', async () => {
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    // Helvetica is one of the 14 standard faces: pdf-lib refers to it
    // without embedding it.
    const helv = await doc.embedFont(StandardFonts.Helvetica);
    page.drawText('Hi', { x: 10, y: 10, font: helv, size: 12, color: rgb(0, 0, 0) });
    const r = await inspectPrintPdf(await doc.save());
    expect(r.fonts).toEqual([{ name: 'Helvetica', embedded: false, type: 'Type 1' }]);
  });

  it('tells DeviceRGB from RGB with a profile, and pictures from vector paint', async () => {
    const r = await inspectPrintPdf(await onePage((ctx) => ({
      ColorSpace: { CS0: ctx.obj(['ICCBased', ctx.register(stream(ctx, '', { N: 3 }))]) },
      XObject: { Im0: ctx.register(stream(ctx, 'ÿ\u0000\u0000', { Type: 'XObject', Subtype: 'Image', Width: 1, Height: 1, BitsPerComponent: 8, ColorSpace: 'DeviceRGB' })) },
    }), '/CS0 cs 1 0 0 sc 0 0 10 10 re f q 10 0 0 10 0 0 cm /Im0 Do Q'));
    expect(r.color.deviceRgb).toEqual({ vector: false, images: true });
    expect(r.color.iccRgb).toEqual({ vector: true, images: false });
    expect(r.color.rgb).toBe(true);
  });

  it('reads inline images, annotation appearances and a tiling pattern', async () => {
    const inline = await inspectPrintPdf(await onePage(() => ({}), 'q 10 0 0 10 0 0 cm BI /W 1 /H 1 /CS /RGB /BPC 8 ID ÿ\u0000\u0000 EI Q'));
    expect(inline.color.deviceRgb).toEqual({ vector: false, images: true });

    const annotated = await inspectPrintPdf(await onePage(() => ({}), '', (doc) => {
      const ctx = doc.context;
      const ap = ctx.register(stream(ctx, '0 1 0 rg 0 0 10 10 re f', { Type: 'XObject', Subtype: 'Form', BBox: [0, 0, 10, 10] }));
      const annot = ctx.register(ctx.obj({ Type: 'Annot', Subtype: 'Square', Rect: [0, 0, 10, 10], AP: { N: ap } }));
      doc.getPage(0).node.set(PDFName.of('Annots'), ctx.obj([annot]));
    }));
    expect(annotated.color.deviceRgb.vector).toBe(true);
    expect(annotated.annotations).toBe(1);

    const tiled = await inspectPrintPdf(await onePage((ctx) => ({
      Pattern: { P0: ctx.register(stream(ctx, '0 0 1 rg 0 0 5 5 re f', { PatternType: 1, PaintType: 1, TilingType: 1, BBox: [0, 0, 5, 5], XStep: 5, YStep: 5, Resources: {} })) },
    }), '/Pattern cs /P0 scn 0 0 100 100 re f'));
    expect(tiled.color.deviceRgb.vector).toBe(true);
  });

  it('reads the fields of a form', async () => {
    const doc = await PDFDocument.create();
    doc.addPage([200, 200]);
    const form = doc.getForm();
    form.createTextField('name').addToPage(doc.getPage(0), { x: 10, y: 10, width: 100, height: 20 });
    const r = await inspectPrintPdf(await doc.save());
    expect(r.form).toBe(true);
    // Its default appearance is set in Helvetica, which pdf-lib does not embed.
    expect(r.fonts.some((f) => f.name === 'Helvetica' && !f.embedded)).toBe(true);
  });

  it('reads a page box that is not four numbers as missing', async () => {
    const bytes = await onePage(() => ({}), '', (doc) => {
      const node = doc.getPage(0).node;
      node.set(PDFName.of('TrimBox'), doc.context.obj([0, 0, 'Oops', 100]));
      node.set(PDFName.of('BleedBox'), PDFArray.withContext(doc.context));
      node.set(PDFName.of('ArtBox'), PDFNumber.of(3));
    });
    const r = await inspectPrintPdf(bytes);
    expect(r.malformedBoxPages).toBe(1);
    expect(r.pagesWithoutTrimBox).toBe(1);
    expect(r.trimMm.width).toBeCloseTo(70.6, 1);
  });
});

describe('inlineImageDicts', () => {
  it('takes each dictionary and skips the data', () => {
    expect(inlineImageDicts('BI /W 1 /CS /G ID \u0000BI EI q BI /CS /CMYK ID xx EI')).toEqual([' /W 1 /CS /G', ' /CS /CMYK']);
    expect(inlineImageDicts('/BIG 1 Tf')).toEqual([]);
  });
});
