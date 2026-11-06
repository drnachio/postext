import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, PDFHexString, PDFBool } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { buildDocument } from 'postext';
import type { PostextConfig } from 'postext';
import { renderToPdf, type PdfWarning } from '../pdf-backend/index.js';
import { parseFontString } from '../fontString.js';

const fontBytes = fs.readFileSync(new URL('../../../../apps/web/public/fonts/Lora-Regular.ttf', import.meta.url));
const fontProvider = async () => new Uint8Array(fontBytes);
const face = fontkit.create(fontBytes);

class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    const sizePx = parseFontString(this.font)?.sizePx ?? 16;
    const run = face.layout(s);
    return { width: (run.advanceWidth / face.unitsPerEm) * sizePx };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const pt = (value: number) => ({ value, unit: 'pt' as const });
const hex = (h: string) => ({ hex: h, model: 'hex' as const });

// #1445: form fields on chips. An order line (quantity × price = total), a
// sum over a total and a field that does not exist, a check box and a
// choice; the price has a default value.
const config: PostextConfig = {
  page: { width: pt(300), height: pt(300), margins: { top: pt(20), bottom: pt(20), left: pt(20), right: pt(20) } },
  locale: 'de',
  chipStyles: [
    { id: 'field', backgroundEnabled: false, borderColor: hex('#999999'), borderWidth: pt(0.5), borderRadius: pt(0), minWidth: pt(60) },
  ],
};

const markdown = [
  'Menge :chip[ ]{style="field" field="pos.a.qty" kind="number"}',
  '',
  'Preis :chip[120]{style="field" field="pos.a.price" format="currency"}',
  '',
  'Gesamt :chip[ ]{style="field" field="pos.a.total" format="currency" calc="product(pos.a.qty, pos.a.price)"}',
  '',
  'Summe :chip[ ]{style="field" field="sum" format="currency" calc="sum(pos.a.total, pos.b.total)"}',
  '',
  'Paket :chip[ ]{style="field" field="pkg" kind="checkbox"} Wahl :chip[A]{style="field" field="pick" kind="choice" options="A|B"}',
].join('\n');

const js = (dict: PDFDict, key: string): string | undefined => {
  const aa = dict.lookupMaybe(PDFName.of('AA'), PDFDict);
  const action = aa?.lookupMaybe(PDFName.of(key), PDFDict);
  const v = action?.lookup(PDFName.of('JS'));
  return v instanceof PDFString || v instanceof PDFHexString ? v.decodeText() : undefined;
};

describe('form fields on chips (#1445)', () => {
  let pdf: PDFDocument;
  const warnings: PdfWarning[] = [];

  beforeAll(async () => {
    const doc = buildDocument({ markdown }, config);
    const bytes = await renderToPdf(doc, { fontProvider, onWarning: (w) => warnings.push(w) });
    if (process.env.POSTEXT_FORMS_OUT) fs.writeFileSync(process.env.POSTEXT_FORMS_OUT, bytes);
    pdf = await PDFDocument.load(bytes);
  });

  it('lays the field out on the chip', () => {
    const doc = buildDocument({ markdown }, config);
    const chips = doc.blocks.flatMap((b) => b.lines.flatMap((l) => l.segments ?? [])).filter((s) => s.chip?.field).map((s) => s.chip!.field!);
    expect(chips.map((f) => f.name)).toEqual(['pos.a.qty', 'pos.a.price', 'pos.a.total', 'sum', 'pkg', 'pick']);
    expect(chips[2]).toMatchObject({ kind: 'number', format: 'currency', readonly: true, calc: { op: 'product', fields: ['pos.a.qty', 'pos.a.price'] } });
  });

  it('writes one AcroForm field per name, with its value and kind', () => {
    const form = pdf.getForm();
    expect(form.getFields().map((f) => f.getName()).sort()).toEqual(['pick', 'pkg', 'pos.a.price', 'pos.a.qty', 'pos.a.total', 'sum']);
    expect(form.getTextField('pos.a.price').getText()).toBe('120');
    expect(form.getTextField('pos.a.total').isReadOnly()).toBe(true);
    expect(form.getCheckBox('pkg')).toBeDefined();
    expect(form.getDropdown('pick').getSelected()).toEqual(['A']);
  });

  it('formats numbers in the document language and calculates with Acrobat scripts', () => {
    const total = pdf.getForm().getTextField('pos.a.total').acroField.dict;
    // The euro sign as a JavaScript escape: the script is a PDFDocEncoding
    // string, as Acrobat writes it.
    expect(js(total, 'F')).toBe('AFNumber_Format(2, 2, 0, 0, "\\u20ac ", true);');
    expect(js(total, 'K')).toBe('AFNumber_Keystroke(2, 2, 0, 0, "\\u20ac ", true);');
    expect(js(total, 'C')).toBe('AFSimple_Calculate("PRD", new Array ("pos.a.qty", "pos.a.price"));');
  });

  it('orders the calculations by their dependencies', () => {
    const acro = pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
    const co = acro.lookup(PDFName.of('CO'), PDFArray);
    const names = co.asArray().map((ref) => pdf.getForm().getFields().find((f) => f.acroField.ref === ref)?.getName());
    expect(names).toEqual(['pos.a.total', 'sum']);
    expect(acro.lookup(PDFName.of('NeedAppearances'))).toBe(PDFBool.True);
  });

  it('warns about a calculation that reads an unknown field', () => {
    expect(warnings.some((w) => w.kind === 'formField' && /pos\.b\.total/.test((w as { message: string }).message))).toBe(true);
  });

  it('puts the widget on the chip box', () => {
    const qty = pdf.getForm().getTextField('pos.a.qty').acroField.getWidgets()[0]!.getRectangle();
    expect(qty.width).toBeGreaterThanOrEqual(59);
    expect(qty.height).toBeGreaterThan(8);
  });

  it('paints the values as text and writes no form in a print standard', async () => {
    const doc = buildDocument({ markdown }, config);
    const bytes = await renderToPdf(doc, { fontProvider, print: { standard: 'pdfx4' }, outputProfile: new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url))) });
    const printed = await PDFDocument.load(bytes);
    expect(printed.catalog.lookupMaybe(PDFName.of('AcroForm'), PDFDict)).toBeUndefined();
  });
});
