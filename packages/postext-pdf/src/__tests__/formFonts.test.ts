import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFRawStream, PDFRef, PDFStream, PDFString, PDFHexString, decodePDFRawStream } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf, type PdfWarning, type RenderToPdfOptions } from '../pdf-backend/index.js';
import { embeddingFlags } from '../pdf-backend/formFonts.js';
import { parseFontString } from '../fontString.js';

// #1445: form fields show and take their values in the document's face,
// embedded whole (a subset has no glyph for what someone types), once per
// face, named in the AcroForm's /DR and in each field's /DA, and drawn
// with in the widgets' appearances. Helvetica stands in, with a warning,
// for a face that cannot be embedded whole.

const lora = new Uint8Array(fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url)));
const face = fontkit.create(Buffer.from(lora));

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
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

const config: PostextConfig = {
  page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  locale: 'de',
  chipStyles: [
    { id: 'field', backgroundEnabled: false, borderColor: hex('#999999'), borderWidth: pt(0.5), borderRadius: pt(0), minWidth: pt(80) },
  ],
};

const markdown = [
  'Item :chip[Widget A]{style="field" field="item"}',
  '',
  'Price :chip[120]{style="field" field="price" format="currency"}',
  '',
  'Size :chip[M]{style="field" field="size" kind="choice" options="S|M|L"} Wrap :chip[ ]{style="field" field="wrap" kind="checkbox"}',
].join('\n');

/** Lora with its OS/2 fsType set to `flags`. */
function withEmbeddingFlags(flags: number): Uint8Array {
  const bytes = lora.slice();
  const view = new DataView(bytes.buffer);
  for (let i = 0; i < view.getUint16(4); i++) {
    const at = 12 + i * 16;
    if (String.fromCharCode(...bytes.slice(at, at + 4)) === 'OS/2') view.setUint16(view.getUint32(at + 8) + 8, flags);
  }
  return bytes;
}

/** Render the form, the provider answering `file` for every face (`fieldFile`
 *  for the family `Field Face`). */
async function render(options: Partial<RenderToPdfOptions> = {}, file: Uint8Array = lora, fieldFile?: Uint8Array): Promise<{ pdf: PDFDocument; warnings: PdfWarning[] }> {
  const warnings: PdfWarning[] = [];
  const fontProvider = async (family: string) => (family === 'Field Face' && fieldFile ? fieldFile : file);
  const bytes = await renderToPdf(buildDocument({ markdown }, config), { fontProvider, onWarning: (w) => warnings.push(w), ...options });
  if (process.env.POSTEXT_FORM_FONTS_OUT) fs.writeFileSync(process.env.POSTEXT_FORM_FONTS_OUT, bytes);
  return { pdf: await PDFDocument.load(bytes), warnings };
}

const decode = (s: PDFRawStream): Uint8Array => decodePDFRawStream(s).decode();
const text = (s: PDFRawStream): string => new TextDecoder('latin1').decode(decode(s));

/** The font a field's /DA names, looked up in the AcroForm's /DR. */
function daFont(pdf: PDFDocument, name: string): { fontName: string; size: number; font: PDFDict | undefined } {
  const field = pdf.getForm().getField(name).acroField;
  const widget = field.getWidgets()[0]!;
  const da = (widget.getDefaultAppearance() ?? field.getDefaultAppearance())!;
  const m = /\/(\S+) ([\d.]+) Tf/.exec(da)!;
  const dr = pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict).lookup(PDFName.of('DR'), PDFDict);
  const font = dr.lookup(PDFName.of('Font'), PDFDict).lookupMaybe(PDFName.of(m[1]!), PDFDict);
  return { fontName: m[1]!, size: Number(m[2]), font };
}

/** The font program a Type0 font embeds, with its stream key. */
function fontProgram(pdf: PDFDocument, font: PDFDict): { key: string; bytes: Uint8Array } | undefined {
  const cid = font.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
  const descriptor = cid.lookup(PDFName.of('FontDescriptor'), PDFDict);
  for (const key of ['FontFile2', 'FontFile3']) {
    const stream = descriptor.lookupMaybe(PDFName.of(key), PDFStream) as PDFRawStream | undefined;
    if (stream) return { key, bytes: decode(stream) };
  }
  return undefined;
}

/** The text an appearance stream shows, read through its font's ToUnicode
 *  map (as pdf.js and pdftotext read it). */
function appearanceText(pdf: PDFDocument, name: string): { text: string; fontRef: PDFRef | undefined } {
  const widget = pdf.getForm().getField(name).acroField.getWidgets()[0]!;
  const ap = widget.dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'));
  const stream = ap as PDFRawStream;
  const fonts = stream.dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('Font'), PDFDict);
  const [, ref] = fonts.entries()[0]!;
  const font = pdf.context.lookup(ref, PDFDict);
  const cmap = text(font.lookup(PDFName.of('ToUnicode'), PDFStream) as PDFRawStream);
  const map = new Map([...cmap.matchAll(/<([0-9a-f]{4})> <([0-9a-f]+)>/gi)].map((m) => [m[1]!.toLowerCase(), String.fromCodePoint(...(m[2]!.match(/.{4}/g) ?? []).map((h) => parseInt(h, 16)))]));
  const shown = [...text(stream).matchAll(/<([0-9a-f]+)> Tj/gi)].map((m) => (m[1]!.match(/.{4}/g) ?? []).map((g) => map.get(g.toLowerCase()) ?? '?').join('')).join('');
  return { text: shown, fontRef: ref instanceof PDFRef ? ref : undefined };
}

describe('the face of form fields (#1445)', () => {
  it('embeds the chip face whole, once, and names it in /DR and /DA', async () => {
    const { pdf, warnings } = await render();
    expect(warnings.filter((w) => w.kind === 'formField')).toEqual([]);
    const item = daFont(pdf, 'item');
    expect(item.fontName).not.toMatch(/Helv/);
    expect(item.font?.lookup(PDFName.of('BaseFont'))?.toString()).toMatch(/Lora/);
    // The other text fields and the choice share the face.
    expect(daFont(pdf, 'price').fontName).toBe(item.fontName);
    expect(daFont(pdf, 'size').fontName).toBe(item.fontName);
    const program = fontProgram(pdf, item.font!)!;
    expect(program.key).toBe('FontFile2');
    // Whole: every glyph of the file, not a subset.
    expect(fontkit.create(Buffer.from(program.bytes)).numGlyphs).toBe(face.numGlyphs);
    expect(program.bytes.length).toBe(lora.length);
    // A width for every glyph, for the text a viewer draws as it is typed.
    const cid = item.font!.lookup(PDFName.of('DescendantFonts'), PDFArray).lookup(0, PDFDict);
    const widths = cid.lookup(PDFName.of('W'), PDFArray).lookup(1, PDFArray);
    expect(widths.size()).toBe(face.numGlyphs);
    // Embedded whole once: one program of the whole file in the document
    // (the pages' text keeps its own subset).
    const programs = pdf.context.enumerateIndirectObjects()
      .map(([, o]) => o)
      .filter((o): o is PDFDict => o instanceof PDFDict && o.lookupMaybe(PDFName.of('Type'), PDFName) === PDFName.of('FontDescriptor'))
      .map((d) => d.lookupMaybe(PDFName.of('FontFile2'), PDFStream) as PDFRawStream | undefined)
      .filter((s): s is PDFRawStream => !!s);
    expect(programs.filter((s) => decode(s).length === lora.length)).toHaveLength(1);
    expect(programs.length).toBeGreaterThan(1);
  });

  it('draws the appearances with it, a number as the form formats it', async () => {
    const { pdf } = await render();
    const item = daFont(pdf, 'item');
    const dr = pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict).lookup(PDFName.of('DR'), PDFDict).lookup(PDFName.of('Font'), PDFDict);
    const ref = dr.get(PDFName.of(item.fontName));
    const shownItem = appearanceText(pdf, 'item');
    expect(shownItem.fontRef?.toString()).toBe(ref?.toString());
    expect(shownItem.text).toBe('Widget A');
    expect(appearanceText(pdf, 'price').text).toBe('€ 120,00');
    // The field keeps the plain number its scripts read.
    expect(pdf.getForm().getTextField('price').getText()).toBe('120');
    // The face reads back characters no default value has (typed later).
    const cmap = text(item.font!.lookup(PDFName.of('ToUnicode'), PDFStream) as PDFRawStream);
    for (const ch of 'ßQZ7') expect(cmap.toLowerCase()).toContain(`<${ch.codePointAt(0)!.toString(16).padStart(4, '0')}>`);
  });

  it('uses a face the options name, and Helvetica when asked', async () => {
    const named = await render({ forms: { font: { family: 'Lora', weight: 400 } } });
    expect(daFont(named.pdf, 'item').font?.lookup(PDFName.of('BaseFont'))?.toString()).toMatch(/Lora/);
    const plain = await render({ forms: { font: 'helvetica' } });
    expect(daFont(plain.pdf, 'item').font?.lookup(PDFName.of('BaseFont'))?.toString()).toBe('/Helvetica');
    expect(plain.warnings.filter((w) => w.kind === 'formField')).toEqual([]);
  });

  it('falls back to Helvetica, with a warning, for a face its licence keeps from embedding', async () => {
    const restricted = withEmbeddingFlags(0x0002);
    expect(embeddingFlags(restricted)).toBe(2);
    expect(embeddingFlags(lora)).toBe(embeddingFlags(withEmbeddingFlags(embeddingFlags(lora))));
    const { pdf, warnings } = await render({}, restricted);
    expect(daFont(pdf, 'item').font?.lookup(PDFName.of('BaseFont'))?.toString()).toBe('/Helvetica');
    const messages = warnings.filter((w) => w.kind === 'formField').map((w) => (w as { message: string }).message);
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatch(/shown in Helvetica instead of .+ 400: its licence/);
    // The appearance is drawn in Helvetica too.
    const ap = pdf.getForm().getTextField('item').acroField.getWidgets()[0]!.dict.lookup(PDFName.of('AP'), PDFDict).lookup(PDFName.of('N'), PDFStream) as PDFRawStream;
    const fonts = ap.dict.lookup(PDFName.of('Resources'), PDFDict).lookup(PDFName.of('Font'), PDFDict);
    expect(fonts.entries().map(([, ref]) => pdf.context.lookup(ref, PDFDict).lookup(PDFName.of('BaseFont'))?.toString())).toEqual(['/Helvetica']);
  });

  // A face no page is set in, given as WOFF2 (pages take TrueType or
  // OpenType: pdf-lib cannot subset a WOFF2).
  it('decompresses a WOFF2 face before embedding it whole', async () => {
    const { compress } = await import('wawoff2');
    const woff2 = await compress(lora);
    const { pdf, warnings } = await render({ forms: { font: { family: 'Field Face' } } }, lora, woff2);
    expect(warnings.filter((w) => w.kind === 'formField')).toEqual([]);
    const program = fontProgram(pdf, daFont(pdf, 'item').font!)!;
    expect(fontkit.create(Buffer.from(program.bytes)).numGlyphs).toBe(face.numGlyphs);
  });

  it('keeps the field values readable as text', async () => {
    const { pdf } = await render();
    const form = pdf.getForm();
    expect(form.getTextField('item').getText()).toBe('Widget A');
    const v = form.getTextField('item').acroField.dict.lookup(PDFName.of('V'));
    expect(v instanceof PDFString || v instanceof PDFHexString).toBe(true);
  });
});
