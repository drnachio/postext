/**
 * Fillable form fields (AcroForm, #1445). A chip that carries a `field`
 * paints its box as any chip; its words are not painted but become the
 * field's value, and the field's widget is put on the box. Fields are
 * collected while the pages paint and written once every page exists, so a
 * name used on several pages is one field with several widgets.
 *
 * Formats and calculations use Acrobat's standard scripts
 * (`AFNumber_Format`, `AFNumber_Keystroke`, `AFSimple_Calculate`), which
 * Acrobat, Foxit, pdf.js and most viewers run; the calculation order
 * (`/CO`) follows the dependencies. A print standard (PDF/X) allows no
 * interactive fields: there the value is painted as text instead.
 */
import { PDFName, PDFString, PDFArray, PDFDict, PDFHexString, StandardFonts, TextAlignment, type PDFDocument, type PDFPage, type PDFField } from 'pdf-lib';
import { formatFieldNumber, type FormFieldSpec as FieldSpec, type FormNumberOptions, type FormNumberStyle } from 'postext';

/** How numbers are written: Acrobat's separator style and the currency
 *  (`FormNumberOptions` of postext, which the canvas preview takes too). */
export type PdfFormOptions = FormNumberOptions;

interface Placement {
  page: PDFPage;
  rect: [number, number, number, number];
  value: string;
  field: FieldSpec;
  /** The chip's text size in points. */
  sizePt: number;
}

export class FormFieldRegistry {
  private placements: Placement[] = [];
  /** Warnings for the host (duplicate kinds, unknown fields in a
   *  calculation, a cycle). */
  readonly warnings: string[] = [];

  /** Put the widget of `field` on `page` at `rect` (points, page space),
   *  its value shown at `sizePt`. */
  add(page: PDFPage, rect: [number, number, number, number], field: FieldSpec, value: string, sizePt: number): void {
    this.placements.push({ page, rect, value, field, sizePt });
  }

  get size(): number {
    return this.placements.length;
  }

  /** Write the AcroForm, its numbers in `style`. */
  async finalize(pdfDoc: PDFDocument, style: FormNumberStyle): Promise<void> {
    if (this.placements.length === 0) return;
    const form = pdfDoc.getForm();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const { separatorStyle: sep, currency, currencyBefore: before } = style;
    const byName = new Map<string, { spec: FieldSpec; field: PDFField; value: string }>();

    for (const p of this.placements) {
      const [x1, y1, x2, y2] = p.rect;
      const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
        borderWidth: 0, borderColor: undefined, backgroundColor: undefined, font };
      const known = byName.get(p.field.name);
      if (known && known.spec.kind !== p.field.kind) {
        this.warnings.push(`form field "${p.field.name}" is used as ${known.spec.kind} and as ${p.field.kind}; the first wins`);
      }
      const size = Math.max(4, p.sizePt);
      if (p.field.kind === 'checkbox') {
        const cb = (known?.field as ReturnType<typeof form.createCheckBox>) ?? form.createCheckBox(p.field.name);
        cb.addToPage(p.page, { ...box, textColor: undefined });
        if (!known) byName.set(p.field.name, { spec: p.field, field: cb, value: p.value });
        continue;
      }
      if (p.field.kind === 'choice') {
        const dd = (known?.field as ReturnType<typeof form.createDropdown>) ?? form.createDropdown(p.field.name);
        if (!known) {
          dd.setOptions(p.field.options ?? []);
          if (p.value && (p.field.options ?? []).includes(p.value)) dd.select(p.value);
        }
        dd.addToPage(p.page, box);
        dd.setFontSize(size);
        if (!known) byName.set(p.field.name, { spec: p.field, field: dd, value: p.value });
        continue;
      }
      const tf = (known?.field as ReturnType<typeof form.createTextField>) ?? form.createTextField(p.field.name);
      if (!known) {
        if (p.field.multiline) tf.enableMultiline();
        tf.setAlignment(p.field.kind === 'number' ? TextAlignment.Right : TextAlignment.Left);
      }
      tf.addToPage(p.page, box);
      tf.setFontSize(size);
      if (!known && p.value) {
        // The value as the viewer's format script would show it, drawn into
        // the appearance; the field keeps the plain number its scripts read.
        const shown = formatFieldNumber(p.value, p.field.format, style) ?? p.value;
        tf.setText(shown);
        if (shown !== p.value) {
          tf.updateAppearances(font);
          form.markFieldAsClean(tf.ref);
          tf.acroField.setValue(PDFHexString.fromText(p.value));
        }
      }
      if (!known) byName.set(p.field.name, { spec: p.field, field: tf, value: p.value });
    }

    for (const { spec, field } of byName.values()) {
      if (spec.readonly) field.enableReadOnly();
      if (spec.required) field.enableRequired();
      const dict = field.acroField.dict;
      if (spec.tooltip) dict.set(PDFName.of('TU'), PDFHexString.fromText(spec.tooltip));
      const actions: Record<string, string> = {};
      const fmt = numberFormat(spec, sep, currency, before);
      if (fmt) { actions.F = `AFNumber_Format(${fmt});`; actions.K = `AFNumber_Keystroke(${fmt});`; }
      if (spec.calc) {
        const missing = spec.calc.fields.filter((n) => !byName.has(n));
        if (missing.length) this.warnings.push(`form field "${spec.name}" calculates from unknown field(s): ${missing.join(', ')}`);
        const op = { sum: 'SUM', product: 'PRD', min: 'MIN', max: 'MAX', avg: 'AVG' }[spec.calc.op];
        actions.C = `AFSimple_Calculate("${op}", new Array (${spec.calc.fields.map((n) => jsString(n)).join(', ')}));`;
      }
      if (Object.keys(actions).length > 0) {
        const aa = pdfDoc.context.obj({});
        for (const [k, js] of Object.entries(actions)) {
          // A literal string: backslashes and parentheses escaped (PDF 7.3.4.2).
          aa.set(PDFName.of(k), pdfDoc.context.obj({ S: 'JavaScript', JS: PDFString.of(js.replace(/[\\()]/g, '\\$&')) }));
        }
        dict.set(PDFName.of('AA'), aa);
      }
    }

    // Calculation order: every calculated field after the ones it reads.
    const calculated = [...byName.values()].filter((f) => f.spec.calc);
    const order: string[] = [];
    const state = new Map<string, 'busy' | 'done'>();
    const visit = (name: string): void => {
      const f = byName.get(name);
      if (!f?.spec.calc || state.get(name) === 'done') return;
      if (state.get(name) === 'busy') { this.warnings.push(`form fields calculate in a cycle through "${name}"`); return; }
      state.set(name, 'busy');
      for (const dep of f.spec.calc.fields) visit(dep);
      state.set(name, 'done');
      order.push(name);
    };
    for (const f of calculated) visit(f.spec.name);
    const acro = pdfDoc.catalog.lookup(PDFName.of('AcroForm'), PDFDict);
    if (order.length > 0) {
      const co = PDFArray.withContext(pdfDoc.context);
      for (const n of order) co.push(byName.get(n)!.field.acroField.ref);
      acro.set(PDFName.of('CO'), co);
    }
    // Viewers draw values in their own format (the scripts above).
    acro.set(PDFName.of('NeedAppearances'), pdfDoc.context.obj(true));
  }
}

/** A JavaScript string literal in ASCII, other characters escaped
 *  (`€`): the script is a PDFDocEncoding string, which some viewers
 *  read without a euro sign. */
const jsString = (s: string): string => JSON.stringify(s).replace(/[^\x20-\x7e]/g, (c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, '0')}`);

/** The arguments of `AFNumber_Format` for a field, or undefined. */
function numberFormat(spec: FieldSpec, sep: number, currency: string, before: boolean): string | undefined {
  switch (spec.format) {
    case 'currency': return `2, ${sep}, 0, 0, ${jsString(before ? `${currency} ` : ` ${currency}`)}, ${before}`;
    case 'decimal': return `2, ${sep}, 0, 0, "", true`;
    case 'integer': return `0, ${sep}, 0, 0, "", true`;
    case 'percent': return undefined;
    default: return undefined;
  }
}
