import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFStream, PDFString, decodePDFRawStream } from 'pdf-lib';
import UPNG from '@pdf-lib/upng';
import { buildDocument } from 'postext';
import type { PostextConfig, PrintConfig, Resource } from 'postext';
import { renderToPdf, type PdfWarning } from '../pdf-backend/index.js';

// #603 / #604: colour-managed CMYK, black handling and PDF/X output.

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fogra39 = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

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

/** A 2 × 2 RGBA PNG: red, half-transparent green, blue, white. */
const PNG = new Uint8Array(UPNG.encode([new Uint8Array([255, 0, 0, 255, 0, 255, 0, 128, 0, 0, 255, 255, 255, 255, 255, 255]).buffer], 2, 2, 0));

const resources: Resource[] = [{
  id: 'pic',
  typeId: 'figure',
  kind: 'bitmap',
  createdAt: 0,
  updatedAt: 0,
  bitmap: { fileId: 'pic.png', format: 'png', width: 2, height: 2 },
  placement: { position: 'here' },
}];

function config(extra: PostextConfig = {}): PostextConfig {
  return {
    page: { width: pt(300), height: pt(300), margins: { top: pt(30), bottom: pt(30), left: pt(24), right: pt(24) } },
    bodyText: { fontFamily: 'Lora', color: hex('#000000') },
    headings: { fontFamily: 'Lora' },
    header: {
      elements: [
        // A large black band (rich black) and a thin black rule (K only).
        { kind: 'box', id: 'band', placement: { anchor: { to: 'container', edge: 'top-left' }, size: { width: pt(120), height: pt(40) } }, style: { backgroundColor: hex('#000000') } },
        { kind: 'box', id: 'rule', placement: { anchor: { to: 'container', edge: 'bottom-left' }, size: { width: pt(120), height: pt(2) } }, style: { backgroundColor: hex('#000000') } },
      ],
    },
    footer: { elements: [] },
    ...extra,
  };
}

async function render(print: PrintConfig | undefined, opts: { colorSpace?: 'cmyk' | 'grayscale'; accessible?: boolean; date?: Date | number | string } = {}) {
  const doc = buildDocument({ markdown: 'Black text on the page, and a [link](https://example.com).\n\n::resource{id="pic"}', resources }, config());
  const warnings: PdfWarning[] = [];
  const bytes = await renderToPdf(doc, {
    fontProvider: async () => new Uint8Array(fontBytes),
    resourceBytes: (id) => (id === 'pic.png' ? PNG : undefined),
    outputProfile: fogra39,
    accessible: opts.accessible ?? true,
    onWarning: (w) => warnings.push(w),
    ...(print ? { print } : {}),
    ...(opts.colorSpace ? { colorSpace: opts.colorSpace } : {}),
    ...(opts.date !== undefined ? { date: opts.date } : {}),
  });
  const pdf = await PDFDocument.load(bytes);
  const page = pdf.getPage(0);
  const contents = page.node.Contents();
  const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
  const content = refs
    .map((r) => {
      const s = pdf.context.lookup(r);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    })
    .join('\n');
  const raw = new TextDecoder('latin1').decode(bytes);
  return { pdf, page, content, raw, bytes, warnings };
}

function extGStates(pdf: PDFDocument): Map<string, PDFDict> {
  const out = new Map<string, PDFDict>();
  const states = pdf.getPage(0).node.Resources()?.lookup(PDFName.of('ExtGState'));
  if (!(states instanceof PDFDict)) return out;
  for (const [name, ref] of states.entries()) {
    const d = pdf.context.lookup(ref);
    if (d instanceof PDFDict) out.set(name.asString().slice(1), d);
  }
  return out;
}

/** The image XObjects the first page draws (its resources), by colour
 *  space: a picture embedded but never placed is not among them. */
function placed(pdf: PDFDocument): string[] {
  const xobjects = pdf.getPage(0).node.Resources()?.lookup(PDFName.of('XObject'));
  if (!(xobjects instanceof PDFDict)) return [];
  return xobjects.values().map((ref) => {
    const obj = pdf.context.lookup(ref);
    const dict = obj instanceof PDFStream ? obj.dict : obj instanceof PDFDict ? obj : undefined;
    return dict?.lookup(PDFName.of('Subtype'))?.toString() === '/Image' ? dict.lookup(PDFName.of('ColorSpace'))?.toString() ?? '?' : '';
  }).filter(Boolean);
}

function images(pdf: PDFDocument): PDFDict[] {
  const out: PDFDict[] = [];
  pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
    if (obj instanceof PDFStream && obj.dict.lookup(PDFName.of('Subtype'))?.toString() === '/Image') out.push(obj.dict);
  });
  return out;
}

describe('ICC CMYK output', () => {
  it('separates colours through the output profile and black to K only', async () => {
    const { content } = await render(undefined, { colorSpace: 'cmyk' });
    // Black text is 100 % K, not a four-colour black.
    expect(content).toMatch(/0 0 0 1 k/);
    expect(content).not.toMatch(/0 0 0 0 k[\s\S]*1 0 0 rg/);
  });

  it('overprints 100 % K text and knocks the rest out', async () => {
    const { pdf, content } = await render(undefined, { colorSpace: 'cmyk' });
    const states = extGStates(pdf);
    const op = [...states.entries()].find(([, d]) => d.lookup(PDFName.of('op'))?.toString() === 'true');
    expect(op).toBeDefined();
    expect(op![1].lookup(PDFName.of('OPM'))?.toString()).toBe('1');
    // The overprint state is set before the text is shown.
    const before = content.slice(0, content.indexOf(' Tj') >= 0 ? content.indexOf(' Tj') : content.indexOf(' TJ'));
    expect(before).toContain(`/${op![0]} gs`);
  });

  it('sets large black areas in rich black and keeps the thin rule K only', async () => {
    const { content } = await render(undefined, { colorSpace: 'cmyk' });
    expect(content).toMatch(/0\.6 0\.4 0\.4 1 k/);
    expect(content.match(/0 0 0 1 k/g)!.length).toBeGreaterThan(0);
  });

  it('converts RGB pictures to DeviceCMYK, keeping alpha as a soft mask outside PDF/X-1a', async () => {
    const { pdf } = await render(undefined, { colorSpace: 'cmyk' });
    const pics = images(pdf).filter((d) => d.lookup(PDFName.of('ColorSpace'))?.toString() === '/DeviceCMYK');
    expect(pics.length).toBe(1);
    expect(pics[0]!.get(PDFName.of('SMask'))).toBeDefined();
    // And the page draws it (#800: it used to fall back to a placeholder).
    expect(placed(pdf)).toEqual(['/DeviceCMYK']);
  });

  it('leaves RGB output alone', async () => {
    const { content, pdf } = await render(undefined);
    expect(content).not.toMatch(/ k\b/);
    expect(images(pdf).some((d) => d.lookup(PDFName.of('ColorSpace'))?.toString() === '/DeviceRGB')).toBe(true);
  });
});

describe('PDF/X-1a', () => {
  it('identifies the file and embeds the output intent', async () => {
    const { pdf, raw } = await render({ standard: 'pdfx1a' });
    expect(raw.startsWith('%PDF-1.4')).toBe(true);
    expect(raw).not.toMatch(/\/ObjStm/);
    expect(raw).not.toMatch(/\/XRefStm|\/Type \/XRef/);
    const intents = pdf.catalog.lookup(PDFName.of('OutputIntents'), PDFArray);
    const intent = pdf.context.lookup(intents.get(0)) as PDFDict;
    expect(intent.lookup(PDFName.of('S'))?.toString()).toBe('/GTS_PDFX');
    expect((intent.lookup(PDFName.of('OutputConditionIdentifier')) as PDFString).decodeText()).toBe('FOGRA39');
    expect(intent.lookup(PDFName.of('DestOutputProfile'))).toBeInstanceOf(PDFStream);
    expect(raw).toMatch(/\/GTS_PDFXVersion \(PDF\/X-1a:2003\)/);
    expect(raw).toMatch(/\/Trapped \/False/);
    expect(raw).toMatch(/\/ID \[/);
  });

  it('gives every page a TrimBox and BleedBox and no annotations', async () => {
    const { page } = await render({ standard: 'pdfx1a' });
    expect(page.node.get(PDFName.of('TrimBox'))).toBeDefined();
    expect(page.node.get(PDFName.of('BleedBox'))).toBeDefined();
    const annots = page.node.lookup(PDFName.of('Annots'));
    expect(annots === undefined || (annots instanceof PDFArray && annots.size() === 0)).toBe(true);
  });

  it('writes no transparency: pictures flattened, no soft masks, no alpha states', async () => {
    const { pdf, raw } = await render({ standard: 'pdfx1a' });
    expect(raw).not.toMatch(/\/SMask/);
    for (const d of extGStates(pdf).values()) {
      expect(d.get(PDFName.of('ca'))).toBeUndefined();
      expect(d.get(PDFName.of('CA'))).toBeUndefined();
    }
    expect(images(pdf).every((d) => d.lookup(PDFName.of('ColorSpace'))?.toString() !== '/DeviceRGB')).toBe(true);
    expect(placed(pdf)).toEqual(['/DeviceCMYK']);
  });

  it('keeps the PDF/UA tagging and its identification in the merged XMP', async () => {
    const { raw } = await render({ standard: 'pdfx1a' });
    expect(raw).toMatch(/<pdfxid:GTSPDFXVersion>PDF\/X-1a:2003<\/pdfxid:GTSPDFXVersion>/);
    expect(raw).toMatch(/<pdfuaid:part>1<\/pdfuaid:part>/);
    expect(raw).toMatch(/\/StructTreeRoot/);
  });
});

describe('PDF/X-4', () => {
  it('identifies the file, blends pages in CMYK and keeps transparency', async () => {
    const { raw, page, pdf } = await render({ standard: 'pdfx4' });
    expect(raw.startsWith('%PDF-1.6')).toBe(true);
    expect(raw).toMatch(/<pdfxid:GTSPDFXVersion>PDF\/X-4<\/pdfxid:GTSPDFXVersion>/);
    expect(raw).toMatch(/<xmpMM:DocumentID>uuid:/);
    const group = page.node.lookup(PDFName.of('Group'), PDFDict);
    expect(group.lookup(PDFName.of('CS'))?.toString()).toBe('/DeviceCMYK');
    expect(images(pdf).some((d) => d.get(PDFName.of('SMask')) !== undefined)).toBe(true);
  });

  it('tags kept RGB pictures sRGB through DefaultRGB', async () => {
    const { page, pdf } = await render({ standard: 'pdfx4', convertImages: false });
    const spaces = page.node.Resources()!.lookup(PDFName.of('ColorSpace'), PDFDict);
    const def = spaces.lookup(PDFName.of('DefaultRGB'), PDFArray);
    expect(def.lookup(0)?.toString()).toBe('/ICCBased');
    expect(images(pdf).some((d) => d.lookup(PDFName.of('ColorSpace'))?.toString() === '/DeviceRGB')).toBe(true);
  });
});

describe('pictures in a forced device colour space (#800)', () => {
  /** The decoded samples of an image XObject. */
  const samples = (pdf: PDFDocument, dict: PDFDict): Uint8Array => {
    let found: Uint8Array | undefined;
    pdf.context.enumerateIndirectObjects().forEach(([, obj]) => {
      if (obj instanceof PDFRawStream && obj.dict === dict) found = decodePDFRawStream(obj).decode();
    });
    return found!;
  };

  it('writes the pictures of a grayscale PDF in DeviceGray, with the flat colours\' luma and their alpha', async () => {
    const { pdf, content } = await render(undefined, { colorSpace: 'grayscale' });
    // The flat colours are gray already.
    expect(content).not.toMatch(/ rg\b/);
    const pics = images(pdf).filter((d) => d.lookup(PDFName.of('ColorSpace'))?.toString() === '/DeviceGray' && d.get(PDFName.of('SMask')) !== undefined);
    expect(pics).toHaveLength(1);
    expect(images(pdf).some((d) => d.lookup(PDFName.of('ColorSpace'))?.toString() === '/DeviceRGB')).toBe(false);
    // Red, green, blue, white through Rec. 601.
    expect([...samples(pdf, pics[0]!)]).toEqual([76, 150, 29, 255]);
    expect(placed(pdf)).toEqual(['/DeviceGray']);
  });

  it('separates the pictures of a plain CMYK PDF whose profile is unavailable, as its flat colours are', async () => {
    const doc = buildDocument({ markdown: 'Text.\n\n::resource{id="pic"}', resources }, config());
    const warnings: PdfWarning[] = [];
    const bytes = await renderToPdf(doc, {
      fontProvider: async () => new Uint8Array(fontBytes),
      resourceBytes: (id) => (id === 'pic.png' ? PNG : undefined),
      profileBaseUrl: 'http://127.0.0.1:9/icc/',
      colorSpace: 'cmyk',
      onWarning: (w) => warnings.push(w),
    });
    expect(warnings.map((w) => w.kind)).toContain('outputProfileUnavailable');
    const pdf = await PDFDocument.load(bytes);
    const pics = images(pdf).filter((d) => d.lookup(PDFName.of('ColorSpace'))?.toString() === '/DeviceCMYK');
    expect(pics).toHaveLength(1);
    // Red is M + Y; white no ink.
    expect([...samples(pdf, pics[0]!)].slice(0, 4)).toEqual([0, 255, 255, 0]);
    expect([...samples(pdf, pics[0]!)].slice(12)).toEqual([0, 0, 0, 0]);
    expect(placed(pdf)).toEqual(['/DeviceCMYK']);
  });
});

describe('profiles', () => {
  it('fails a PDF/X render without its profile, and warns for plain CMYK', async () => {
    const doc = buildDocument({ markdown: 'Text.' }, config());
    const base = { fontProvider: async () => new Uint8Array(fontBytes), profileBaseUrl: 'http://127.0.0.1:9/icc/' };
    await expect(renderToPdf(doc, { ...base, print: { standard: 'pdfx4' } })).rejects.toThrow(/output profile/);
    const warnings: PdfWarning[] = [];
    await renderToPdf(doc, { ...base, colorSpace: 'cmyk', onWarning: (w) => warnings.push(w) });
    expect(warnings.map((w) => w.kind)).toContain('outputProfileUnavailable');
  });
});

describe('authored CMYK', () => {
  it('sets a colour authored in CMYK with its exact values, through a palette link too', async () => {
    const doc = buildDocument({ markdown: 'Cyan text.\n\n# Heading' }, config({
      colorPalette: [{ id: 'brand', name: 'Brand', value: { hex: '#00a0e3', model: 'cmyk', cmyk: { c: 100, m: 0, y: 0, k: 0 } } }],
      bodyText: { fontFamily: 'Lora', color: { hex: '#00a0e3', model: 'cmyk', paletteId: 'brand' } },
    }));
    const bytes = await renderToPdf(doc, { fontProvider: async () => new Uint8Array(fontBytes), outputProfile: fogra39, colorSpace: 'cmyk', accessible: false });
    const pdf = await PDFDocument.load(bytes);
    const c = pdf.getPage(0).node.Contents();
    const s = c instanceof PDFArray ? pdf.context.lookup(c.get(0)) : c;
    const raw = s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    expect(raw).toMatch(/1 0 0 0 k/);
  });
});

describe('inspectPrintMaster', () => {
  it('reports non-embedded fonts, RGB colour and transparency in a placed PDF', async () => {
    const { inspectPrintMaster } = await import('../print/inspectMaster.js');
    const { StandardFonts, rgb, cmyk } = await import('pdf-lib');
    const loose = await PDFDocument.create();
    const page = loose.addPage([200, 200]);
    page.drawText('Hi', { font: await loose.embedFont(StandardFonts.Helvetica), size: 12, color: rgb(1, 0, 0), opacity: 0.5 });
    const report = await inspectPrintMaster(await loose.save());
    expect(report.nonEmbeddedFonts).toEqual(['Helvetica']);
    expect(report.rgb).toBe(true);
    expect(report.transparency).toBe(true);

    const clean = await PDFDocument.create();
    clean.addPage([200, 200]).drawRectangle({ x: 10, y: 10, width: 50, height: 50, color: cmyk(0, 1, 0, 0) });
    expect(await inspectPrintMaster(await clean.save())).toEqual({ nonEmbeddedFonts: [], rgb: false, transparency: false, spotInks: [] });
  });

  it('lists the spot inks of its Separation and DeviceN spaces, as an Illustrator swatch names them', async () => {
    const { inspectPrintMaster } = await import('../print/inspectMaster.js');
    const { PDFName: Name } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    const page = doc.addPage([200, 200]);
    const fn = doc.context.obj({ FunctionType: 2, Domain: [0, 1], C0: [0, 0, 0, 0], C1: [0, 1, 0.8, 0], N: 1 });
    const sep = doc.context.obj([Name.of('Separation'), Name.of('PANTONE 185 C'), Name.of('DeviceCMYK'), fn]);
    const devn = doc.context.obj([Name.of('DeviceN'), [Name.of('Black'), Name.of('Oro')], Name.of('DeviceCMYK'), fn]);
    const spaces = doc.context.obj({ CS0: doc.context.register(sep), CS1: doc.context.register(devn) });
    page.node.Resources()!.set(Name.of('ColorSpace'), spaces);
    expect((await inspectPrintMaster(await doc.save())).spotInks).toEqual(['Oro', 'PANTONE 185 C']);
  });
});

// #734: a PDF/X file also carries the dates in its XMP packet, and took its
// trailer /ID and XMP DocumentID from a random source: no two renders of
// one document were the same file.
describe('a dated PDF/X render repeats byte for byte (#734)', () => {
  const date = '2026-09-27T00:00:00Z';
  const id = (raw: string) => /\/ID\s*\[\s*<([0-9a-fA-F]+)>/.exec(raw)?.[1];

  it('gives the same bytes for the same document and date', async () => {
    for (const standard of ['pdfx4', 'pdfx1a'] as const) {
      const a = await render({ standard }, { date });
      const b = await render({ standard }, { date });
      expect(Buffer.from(a.bytes).equals(Buffer.from(b.bytes)), standard).toBe(true);
      expect(a.raw).toContain('<xmp:CreateDate>2026-09-27T00:00:00Z</xmp:CreateDate>');
      expect(a.raw).toContain('<xmp:ModifyDate>2026-09-27T00:00:00Z</xmp:ModifyDate>');
      // (`render` loads the file with pdf-lib's default, which stamps /ModDate again.)
      const info = await PDFDocument.load(a.bytes, { updateMetadata: false });
      expect(info.getCreationDate()?.toISOString()).toBe('2026-09-27T00:00:00.000Z');
      expect(info.getModificationDate()?.toISOString()).toBe('2026-09-27T00:00:00.000Z');
      // The XMP DocumentID is the trailer id, as in an undated render.
      const hexId = id(a.raw)!;
      expect(hexId).toHaveLength(32);
      expect(a.raw).toContain(`<xmpMM:DocumentID>uuid:${hexId.slice(0, 8)}-${hexId.slice(8, 12)}-`);
    }
  });

  it('takes the id from the date: another date is another file, and no date a random one', async () => {
    const a = await render({ standard: 'pdfx4' }, { date });
    const later = await render({ standard: 'pdfx4' }, { date: '2026-09-28T00:00:00Z' });
    expect(id(later.raw)).not.toBe(id(a.raw));
    const one = await render({ standard: 'pdfx4' });
    const two = await render({ standard: 'pdfx4' });
    expect(id(one.raw)).not.toBe(id(two.raw));
    expect(id(one.raw)).not.toBe(id(a.raw));
  });
});
