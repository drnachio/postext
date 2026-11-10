import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { PDFArray, PDFDict, PDFDocument, PDFName, PDFString, PDFHexString, PDFBool, PDFRawStream, decodePDFRawStream } from 'pdf-lib';
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

// #1445: a print standard has no form, so a number field's value is
// painted: in the field's format and the document's number style (what the
// form and the canvas preview show), set to the box's end inside the
// style's own padding, in the chip's colour.
describe('number fields painted for print (#1445)', () => {
  const outputProfile = new Uint8Array(fs.readFileSync(new URL('../../../postext/icc/fogra39.icc', import.meta.url)));
  const printConfig: PostextConfig = {
    ...config,
    chipStyles: [{ id: 'field', backgroundEnabled: false, borderColor: hex('#999999'), borderWidth: pt(0.5), borderRadius: pt(0), paddingX: pt(2), minWidth: pt(80), color: hex('#336699') }],
  };

  async function printed(markdown: string): Promise<string> {
    const bytes = await renderToPdf(buildDocument({ markdown }, printConfig), { fontProvider, print: { standard: 'pdfx4' }, outputProfile });
    const doc = await PDFDocument.load(bytes);
    const contents = doc.getPage(0).node.Contents();
    const refs = contents instanceof PDFArray ? contents.asArray() : [contents];
    return refs.map((ref) => {
      const s = doc.context.lookup(ref);
      return s instanceof PDFRawStream ? new TextDecoder('latin1').decode(decodePDFRawStream(s).decode()) : '';
    }).join('\n');
  }

  /** The text shows after the chip's outline: where each starts (pt), its
   *  size and the fill colour it is set in. */
  function shownAfterBox(content: string): { boxRight: number; shows: { x: number; size: number; fill: string }[] } {
    const stroke = content.indexOf(' K\n');
    const path = content.slice(stroke, content.indexOf('\nS\n', stroke));
    const xs = [...path.matchAll(/^([\d.]+) [\d.]+ [ml]$/gm)].map((m) => Number(m[1]));
    const shows = [...content.slice(stroke).matchAll(/BT\n(.+) k\n\S+ ([\d.]+) Tf\n1 0 0 1 ([\d.]+) [\d.]+ Tm/g)]
      .map((m) => ({ fill: m[1]!, size: Number(m[2]), x: Number(m[3]) }));
    // The outline is stroked half its width inside the box.
    return { boxRight: Math.max(...xs) + 0.25, shows };
  }

  it('sets the formatted value to the box end, in the chip colour', async () => {
    const content = await printed('Price :chip[1234.5]{style="field" field="price" format="currency"}');
    const { boxRight, shows } = shownAfterBox(content);
    expect(shows).toHaveLength(1);
    const width = (face.layout('€ 1.234,50').advanceWidth / face.unitsPerEm) * shows[0]!.size;
    // Border 0.5 pt and the style's padding 2 pt inside the box's end.
    expect(shows[0]!.x + width).toBeCloseTo(boxRight - 0.5 - 2, 1);
    // The colour a plain chip of the style paints its words in.
    const plain = shownAfterBox(await printed('Price :chip[1234.5]{style="field"}'));
    expect(shows[0]!.fill).toBe(plain.shows[0]!.fill);
    // A plain chip stays centred in its least width.
    expect(plain.shows[0]!.x).toBeLessThan(shows[0]!.x);
  });

  it.skipIf(!(() => { try { execFileSync('pdftotext', ['-v'], { stdio: 'ignore' }); return true; } catch { return false; } })())('prints the value as the form shows it, an unformatted number as typed', async () => {
    const markdown = 'Price :chip[1234.5]{style="field" field="price" format="currency"} Qty :chip[3]{style="field" field="qty" kind="number"} Note :chip[n/a]{style="field" field="note"}';
    const bytes = await renderToPdf(buildDocument({ markdown }, printConfig), { fontProvider, print: { standard: 'pdfx4' }, outputProfile });
    const file = path.join(os.tmpdir(), `postext-forms-print-${process.pid}.pdf`);
    fs.writeFileSync(file, bytes);
    const text = execFileSync('pdftotext', ['-raw', file, '-'], { encoding: 'utf8' }).replace(/\s+/g, ' ');
    fs.unlinkSync(file);
    expect(text).toContain('€ 1.234,50');
    expect(text).not.toContain('1234.5');
    expect(text).toMatch(/Qty 3 Note n\/a/);
  });

  it('formats a screen form\'s values with the same rule and options', async () => {
    const markdown = 'Price :chip[1234.5]{style="field" field="price" format="currency"}';
    const bytes = await renderToPdf(buildDocument({ markdown }, config), { fontProvider, forms: { currency: 'USD', currencyBefore: false, separatorStyle: 0 } });
    const form = (await PDFDocument.load(bytes)).getForm();
    const price = form.getTextField('price');
    // The field keeps the number its scripts read; the appearance shows it
    // formatted (the PDF/X value and the canvas preview are the same text).
    expect(price.getText()).toBe('1234.5');
    expect(js(price.acroField.dict, 'F')).toBe('AFNumber_Format(2, 0, 0, 0, " USD", false);');
  });
});

// A total over order lines, a check box with a fixed price and numbers in
// the calculation: `sum(lines, product(box, price))`. A ticked box gives its
// on value to the scripts, so `on="1"` makes it count 1, and `AFMakeNumber`
// counts anything that is no number 0 (`Yes`, `Off`).
describe('calculations with numbers and check boxes', () => {
  const markdown = [
    'Widget A :chip[ ]{style="field" field="order.a.qty" kind="number"} :chip[ ]{style="field" field="order.a.total" format="currency" calc="product(order.a.qty, 12.5)"}',
    '',
    'Service fee :chip[ ]{style="field" field="order.fee" kind="checkbox" on="1"}',
    '',
    'Gift wrap :chip[ ]{style="field" field="order.wrap" kind="checkbox"}',
    '',
    'Total :chip[ ]{style="field" field="order.total" format="currency" calc="sum(order.a.total, product(order.fee, 161.75), product(order.wrap, 5))"}',
    '',
    'Lines :chip[ ]{style="field" field="order.lines" kind="number" calc="sum(order.a.total, order.fee)"}',
  ].join('\n');

  /** `AFMakeNumber` as pdf.js has it: a number, or null for anything else. */
  const AFMakeNumber = (v: unknown): number | null => {
    if (typeof v === 'number') return v;
    if (typeof v !== 'string') return null;
    const n = parseFloat(v.trim().replace(',', '.'));
    return Number.isFinite(n) ? n : null;
  };
  /** Run a Calculate script with `this` the document, as a viewer does. */
  const calculate = (script: string, values: Record<string, string>): unknown => {
    const event: { value?: unknown } = {};
    const doc = { getField: (n: string) => (n in values ? { value: values[n] } : null) };
    new Function('event', 'AFMakeNumber', script).call(doc, event, AFMakeNumber);
    return event.value;
  };

  let pdf: PDFDocument;
  const warnings: PdfWarning[] = [];
  beforeAll(async () => {
    const bytes = await renderToPdf(buildDocument({ markdown }, config), { fontProvider, onWarning: (w) => warnings.push(w) });
    if (process.env.POSTEXT_FORMS_CALC_OUT) fs.writeFileSync(process.env.POSTEXT_FORMS_CALC_OUT, bytes);
    pdf = await PDFDocument.load(bytes);
  });

  it('names the on state of a check box after its on value', () => {
    const fee = pdf.getForm().getCheckBox('order.fee');
    for (const widget of fee.acroField.getWidgets()) {
      const ap = widget.dict.lookup(PDFName.of('AP'), PDFDict);
      for (const key of ['N', 'D']) {
        expect(ap.lookup(PDFName.of(key), PDFDict).keys().map((k) => k.decodeText()).sort()).toEqual(['1', 'Off']);
      }
      expect(widget.getAppearanceState()).toBe(PDFName.of('Off'));
    }
    // Ticked, the box has the value 1. A box without `on` keeps `Yes`.
    fee.check();
    expect(fee.acroField.getValue()).toBe(PDFName.of('1'));
    expect(pdf.getForm().getCheckBox('order.wrap').acroField.getOnValue()).toBe(PDFName.of('Yes'));
  });

  it('writes a calculation with numbers or nested calculations as a script of its own', () => {
    const form = pdf.getForm();
    const line = js(form.getTextField('order.a.total').acroField.dict, 'C')!;
    expect(line).toBe('event.value = Math.round(1e6 * ((AFMakeNumber(this.getField("order.a.qty").value) || 0) * 12.5)) / 1e6;');
    expect(calculate(line, { 'order.a.qty': '3' })).toBe(37.5);
    // Empty fields count 0.
    expect(calculate(line, { 'order.a.qty': '' })).toBe(0);
    const total = js(form.getTextField('order.total').acroField.dict, 'C')!;
    // The order line and the ticked service fee; the gift wrap is ticked
    // too, but its value `Yes` is no number.
    expect(calculate(total, { 'order.a.total': '37.5', 'order.fee': '1', 'order.wrap': 'Yes' })).toBe(199.25);
    expect(calculate(total, { 'order.a.total': '37.5', 'order.fee': 'Off', 'order.wrap': 'Off' })).toBe(37.5);
    // Rounded to six decimals (16.275000000000002 unrounded), as pdf.js
    // rounds a simple calculation.
    expect(calculate(total, { 'order.a.total': '0.1', 'order.fee': '0.1', 'order.wrap': 'Off' })).toBe(16.275);
    // A calculation over fields alone stays Acrobat's simple calculate.
    expect(js(form.getTextField('order.lines').acroField.dict, 'C')).toBe('AFSimple_Calculate("SUM", new Array ("order.a.total", "order.fee"));');
  });

  it('orders the calculations by every field they read, nested ones too', () => {
    const acro = pdf.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
    const names = acro.lookup(PDFName.of('CO'), PDFArray).asArray().map((ref) => pdf.getForm().getFields().find((f) => f.acroField.ref === ref)?.getName());
    expect(names).toEqual(['order.a.total', 'order.total', 'order.lines']);
  });

  it('warns about a check box in a calculation whose on value is no number', () => {
    const messages = warnings.filter((w) => w.kind === 'formField').map((w) => (w as { message: string }).message);
    expect(messages).toEqual([expect.stringMatching(/"order\.total" reads check box "order\.wrap", whose value "Yes" is no number/)]);
  });

  it('shows no default value in a calculated field', () => {
    expect(pdf.getForm().getTextField('order.total').getText()).toBeUndefined();
  });
});

describe('field names the PDF cannot hold', () => {
  it('drops the field with a warning and still writes the document', async () => {
    const md = [
      'A :chip[ ]{style="field" field="order"}',
      '',
      'B :chip[ ]{style="field" field="order.qty" kind="number"}',
      '',
      'C :chip[ ]{style="field" field="a..b"}',
      '',
      'D :chip[ ]{style="field" field="ok"}',
    ].join('\n');
    const warnings: PdfWarning[] = [];
    const bytes = await renderToPdf(buildDocument({ markdown: md }, config), { fontProvider, onWarning: (w) => warnings.push(w) });
    const names = (await PDFDocument.load(bytes)).getForm().getFields().map((f) => f.getName());
    expect(names).toContain('order');
    expect(names).toContain('ok');
    expect(names).not.toContain('a..b');
    const messages = warnings.filter((w) => w.kind === 'formField').map((w) => (w as { message: string }).message);
    expect(messages.some((m) => m.includes('"order.qty" cannot be written'))).toBe(true);
    expect(messages.some((m) => m.includes('"a..b" cannot be written'))).toBe(true);
  });
});
