/**
 * Fillable form fields (AcroForm, #1445). A chip that carries a `field`
 * paints its box as any chip; its words are not painted but become the
 * field's value, and the field's widget is put on the box. Fields are
 * collected while the pages paint and written once every page exists, so a
 * name used on several pages is one field with several widgets.
 *
 * Formats and calculations use Acrobat's standard scripts
 * (`AFNumber_Format`, `AFNumber_Keystroke`, `AFSimple_Calculate`), which
 * Acrobat, Foxit, pdf.js and most viewers run; a calculation with numbers
 * or nested calculations is a short script of its own that reads the
 * fields the same way (`AFMakeNumber`, anything else counts 0). The
 * calculation order (`/CO`) follows the dependencies. A check box with an
 * `on` value names its on state so, and a calculation reads that value
 * when it is ticked. A print standard (PDF/X) allows no
 * interactive fields: there the value is painted as text instead.
 *
 * A field shows its value in the face of its chip, embedded whole
 * (`formFonts.ts`), unless the options name another or Helvetica.
 */
import { PDFName, PDFString, PDFArray, PDFDict, PDFHexString, TextAlignment, type PDFDocument, type PDFPage, type PDFField, type PDFFont, type PDFCheckBox } from 'pdf-lib';
import { formatFieldNumber, type FormFieldCalc, type FormFieldCalcCall, type FormFieldSpec as FieldSpec, type FormNumberOptions, type FormNumberStyle } from 'postext';
import type { FormFonts, PdfFormFont } from './formFonts.js';

/** How form fields write numbers (Acrobat's separator style and the
 *  currency: `FormNumberOptions` of postext, which the canvas preview takes
 *  too) and the face they show values in. */
export interface PdfFormOptions extends FormNumberOptions {
  /** The face of the fields: `'chip'` (the default) the face each field's
   *  chip is set in, or a face of the document's fonts by family, weight
   *  and style; embedded whole, once per face, so any character typed in
   *  has its glyph. `'helvetica'` embeds nothing. A face that cannot be
   *  embedded whole falls back to Helvetica with a `formField` warning. */
  font?: PdfFormFont;
}

interface Placement {
  page: PDFPage;
  rect: [number, number, number, number];
  value: string;
  field: FieldSpec;
  /** The chip's text size in points. */
  sizePt: number;
  /** The font string of the chip's words. */
  fontString?: string;
}

export class FormFieldRegistry {
  private placements: Placement[] = [];
  /** Warnings for the host (duplicate kinds, unknown fields in a
   *  calculation, a cycle). */
  readonly warnings: string[] = [];

  /** Put the widget of `field` on `page` at `rect` (points, page space),
   *  its value shown at `sizePt`, in the face of `fontString` (the chip's)
   *  unless the options say otherwise. */
  add(page: PDFPage, rect: [number, number, number, number], field: FieldSpec, value: string, sizePt: number, fontString?: string): void {
    this.placements.push({ page, rect, value, field, sizePt, ...(fontString ? { fontString } : {}) });
  }

  get size(): number {
    return this.placements.length;
  }

  /** Write the AcroForm, its numbers in `style`, its values in the faces
   *  `fonts` gives. */
  async finalize(pdfDoc: PDFDocument, style: FormNumberStyle, fonts: FormFonts): Promise<void> {
    if (this.placements.length === 0) return;
    const form = pdfDoc.getForm();
    const { separatorStyle: sep, currency, currencyBefore: before } = style;
    const byName = new Map<string, { spec: FieldSpec; field: PDFField; value: string; font?: PDFFont }>();

    for (const p of this.placements) {
      const known = byName.get(p.field.name);
      if (known && known.spec.kind !== p.field.kind) {
        this.warnings.push(`form field "${p.field.name}" is used as ${known.spec.kind} and as ${p.field.kind}; the first wins`);
        continue;
      }
      // A field has one face, its first chip's: every widget shows it. A
      // check box shows no text.
      const font = known ? known.font : p.field.kind === 'checkbox' ? undefined : await fonts.fontFor(p.fontString);
      const [x1, y1, x2, y2] = p.rect;
      const box = { x: Math.min(x1, x2), y: Math.min(y1, y2), width: Math.abs(x2 - x1), height: Math.abs(y2 - y1),
        borderWidth: 0, borderColor: undefined, backgroundColor: undefined, ...(font ? { font } : {}) };
      const size = Math.max(4, p.sizePt);
      if (p.field.kind === 'checkbox') {
        const cb = (known?.field as ReturnType<typeof form.createCheckBox>) ?? form.createCheckBox(p.field.name);
        cb.addToPage(p.page, { ...box, textColor: undefined });
        if (!known) byName.set(p.field.name, { spec: p.field, field: cb, value: p.value, font });
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
        if (!known) byName.set(p.field.name, { spec: p.field, field: dd, value: p.value, font });
        continue;
      }
      const tf = (known?.field as ReturnType<typeof form.createTextField>) ?? form.createTextField(p.field.name);
      if (!known) {
        if (p.field.multiline) tf.enableMultiline();
        tf.setAlignment(p.field.kind === 'number' ? TextAlignment.Right : TextAlignment.Left);
      }
      tf.addToPage(p.page, box);
      tf.setFontSize(size);
      if (!known) byName.set(p.field.name, { spec: p.field, field: tf, value: p.value, font });
    }

    // Every widget's appearance, in its field's face (so pdf-lib draws none
    // in its default face on save): a value as the viewer's format script
    // shows it, while the field keeps the plain number its scripts read.
    for (const { spec, field, value, font } of byName.values()) {
      if (!font) continue;
      if (spec.kind === 'choice') {
        (field as ReturnType<typeof form.createDropdown>).updateAppearances(font);
        continue;
      }
      const tf = field as ReturnType<typeof form.createTextField>;
      const shown = value ? formatFieldNumber(value, spec.format, style) ?? value : '';
      if (shown) tf.setText(shown);
      tf.updateAppearances(font);
      if (shown !== value) tf.acroField.setValue(PDFHexString.fromText(value));
    }

    for (const { spec, field } of byName.values()) {
      if (spec.kind === 'checkbox' && spec.on) {
        if (spec.on === 'Off') this.warnings.push(`form field "${spec.name}" cannot name its on state "Off", the off state's name; it keeps "Yes"`);
        else nameOnState(field as PDFCheckBox, spec.on);
      }
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
        for (const n of spec.calc.fields) {
          const read = byName.get(n)?.spec;
          if (read?.kind === 'checkbox' && !isNumber(onValue(read))) {
            this.warnings.push(`form field "${spec.name}" reads check box "${n}", whose value "${onValue(read)}" is no number, so it always counts 0 (give the box on="1")`);
          }
        }
        actions.C = calcScript(spec.calc, (n) => byName.has(n));
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
    await fonts.register();
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

/** The value a ticked check box gives its scripts: the name of its on
 *  state. */
const onValue = (spec: FieldSpec): string => (spec.on && spec.on !== 'Off' ? spec.on : 'Yes');

/** Whether `AFMakeNumber` reads `value` as a number. */
const isNumber = (value: string): boolean => value.trim() !== '' && Number.isFinite(Number(value.trim().replace(',', '.')));

/** Name the on state of every widget of `box` `on` (pdf-lib names it
 *  `Yes`): the normal and the down appearance, and the state and value
 *  when ticked. A viewer gives the name to scripts as the box's value. */
function nameOnState(box: PDFCheckBox, on: string): void {
  const yes = PDFName.of('Yes');
  const to = PDFName.of(on);
  for (const widget of box.acroField.getWidgets()) {
    const ap = widget.dict.lookupMaybe(PDFName.of('AP'), PDFDict);
    for (const key of ['N', 'D']) {
      const states = ap?.lookupMaybe(PDFName.of(key), PDFDict);
      const appearance = states?.get(yes);
      if (!states || !appearance) continue;
      states.delete(yes);
      states.set(to, appearance);
    }
    if (widget.dict.get(PDFName.of('AS')) === yes) widget.dict.set(PDFName.of('AS'), to);
  }
  if (box.acroField.dict.get(PDFName.of('V')) === yes) box.acroField.dict.set(PDFName.of('V'), to);
}

const SIMPLE_OPS = { sum: 'SUM', product: 'PRD', min: 'MIN', max: 'MAX', avg: 'AVG' } as const;

/**
 * The Calculate script of `calc`. Over fields alone it is Acrobat's
 * `AFSimple_Calculate`, which viewers with only the standard scripts run
 * too. With numbers or nested calculations it is an expression that reads
 * each field as `AFSimple_Calculate` does (`AFMakeNumber` of its value,
 * anything that is no number 0; a field `known` does not hold is 0) and
 * rounds to six decimals as pdf.js does.
 */
function calcScript(calc: FormFieldCalc, known: (name: string) => boolean): string {
  if (calc.args.every((a) => typeof a === 'string')) {
    return `AFSimple_Calculate("${SIMPLE_OPS[calc.op]}", new Array (${calc.args.map((n) => jsString(n as string)).join(', ')}));`;
  }
  const expr = (c: FormFieldCalcCall): string => {
    const terms = c.args.map((a) => typeof a === 'number' ? String(a)
      : typeof a === 'string' ? known(a) ? `(AFMakeNumber(this.getField(${jsString(a)}).value) || 0)` : '0'
      : expr(a));
    switch (c.op) {
      case 'sum': return `(${terms.join(' + ')})`;
      case 'product': return `(${terms.join(' * ')})`;
      case 'min': return `Math.min(${terms.join(', ')})`;
      case 'max': return `Math.max(${terms.join(', ')})`;
      case 'avg': return `((${terms.join(' + ')}) / ${terms.length})`;
    }
  };
  return `event.value = Math.round(1e6 * ${expr(calc)}) / 1e6;`;
}

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
