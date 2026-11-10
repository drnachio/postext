/**
 * Fillable form fields (AcroForm, #1445): a chip that carries a `field`
 * attribute is a form field. The chip lays out and paints its box as any
 * chip does (its style gives the look and the least width, its words are
 * the field's default value); the PDF backend puts an interactive field on
 * the box, the canvas paints the value. Nothing else changes in the
 * layout, so a field sits in a table cell, after a label or alone.
 *
 *   :chip[ ]{style="field" field="pos.a.qty" kind="number"}
 *   :chip[120]{style="field" field="pos.a.price" format="currency"}
 *   :chip[ ]{style="field" field="pos.a.total" format="currency" calc="product(pos.a.qty, pos.a.price)" readonly}
 *   :chip[ ]{style="box" field="pkg.a" kind="checkbox" on="1"}
 *   :chip[ ]{style="field" field="sum" format="currency" calc="sum(pos.a.total, product(pkg.a, 49.5))"}
 */
import type { DirectiveAttrs } from './types.js';

/** What a field computes from others (Acrobat's simple calculate). */
export type FormFieldCalcOp = 'sum' | 'product' | 'min' | 'max' | 'avg';

/** One argument of a calculation: a field by name, a number, or a nested
 *  calculation. */
export type FormFieldCalcArg = string | number | FormFieldCalcCall;

/** A calculation: an operation over its arguments. */
export interface FormFieldCalcCall {
  op: FormFieldCalcOp;
  args: FormFieldCalcArg[];
}

/** A field's calculation, with every field it reads. */
export interface FormFieldCalc extends FormFieldCalcCall {
  /** The fields the calculation reads, nested ones too, each once, in the
   *  order they are written. */
  fields: string[];
}

export interface FormFieldSpec {
  /** Unique per document; dots make a hierarchy (`pos.a.qty`). */
  name: string;
  /** `text` (default), `number`, `checkbox` or `choice`. */
  kind: 'text' | 'number' | 'checkbox' | 'choice';
  /** How a number is shown and typed: `currency` (the document's currency,
   *  two decimals), `decimal` (two decimals), `integer`, `percent`. */
  format?: 'currency' | 'decimal' | 'integer' | 'percent';
  /** Computed from other fields, by name, numbers and nested
   *  calculations. */
  calc?: FormFieldCalc;
  /** Check box: the name of its on state, which is the value a script
   *  reads when it is ticked (`1` makes it count as a number). Default
   *  `Yes`. */
  on?: string;
  /** Choice: the options, in order. */
  options?: string[];
  readonly?: true;
  required?: true;
  /** Several lines (a text field taller than one line). */
  multiline?: true;
  /** What a screen reader and a viewer's tooltip read (`/TU`). */
  tooltip?: string;
  /** Set by the layout: the chip's text size (px), the size the field's
   *  value is shown at. */
  sizePx?: number;
  /** Set by the layout: the chip style's own horizontal padding (px),
   *  where a number set to the box's end stops. A least width widens the
   *  painted padding evenly (`VDTChip.paddingX`); this one does not grow. */
  padPx?: number;
  /** Set by the layout: the face of the chip (its style's family, the
   *  text's weight and style, the chip's size), which an empty chip has no
   *  run to tell. The face a form field shows and takes its value in. */
  fontString?: string;
}

/** How form fields write numbers (#1445): the currency and the separators.
 *  The PDF's number scripts, its printed values and the canvas preview all
 *  follow it (`renderToPdf` and `renderPageToCanvas` take it as `forms`). */
export interface FormNumberOptions {
  /** The currency symbol for `format="currency"`. Default `'€'`. */
  currency?: string;
  /** The symbol before the number (`€ 12,50`) or after it (`12,50 €`).
   *  Default before. */
  currencyBefore?: boolean;
  /** Acrobat's separator style (`AFNumber_Format`): 0 `1,234.56`, 1
   *  `1234.56`, 2 `1.234,56`, 3 `1234,56`. Default from the document
   *  language (German, French, Spanish and most of Europe: 2; else 0). */
  separatorStyle?: 0 | 1 | 2 | 3;
}

/** {@link FormNumberOptions} with every default filled in. */
export type FormNumberStyle = Required<FormNumberOptions>;

/** Languages that write `1.234,56`. */
const COMMA_DECIMAL = /^(de|fr|es|it|pt|nl|da|sv|nb|nn|fi|pl|cs|sk|hu|ro|ru|uk|tr|el|hr|sl|bg|lt|lv|et|ca)(?![a-z])/i;

/** The number style of a document in `lang` (a BCP 47 tag, or undefined
 *  for none), `options` overriding. */
export function formNumberStyle(options: FormNumberOptions | undefined, lang: string | undefined): FormNumberStyle {
  return {
    currency: options?.currency ?? '€',
    currencyBefore: options?.currencyBefore ?? true,
    separatorStyle: options?.separatorStyle ?? (lang && COMMA_DECIMAL.test(lang) ? 2 : 0),
  };
}

/** The form options a render uses: the host's own (`renderToPdf`'s or the
 *  canvas's `forms`) field by field, else the document's
 *  `pdfGeneration.forms`. Undefined when neither sets anything. */
export function formOptionsOf<T extends object>(host: T | undefined, configured: T | undefined): T | undefined {
  if (!host) return configured;
  if (!configured) return host;
  const out = { ...configured } as Record<string, unknown>;
  for (const [k, v] of Object.entries(host)) if (v !== undefined) out[k] = v;
  return out as T;
}

/**
 * A field's value as its number format shows it (what Acrobat's
 * `AFNumber_Format` draws): two decimals or none, grouped and pointed in
 * the style's separators, the currency on its side. The value may be
 * written either way (`1234.5`, `1.234,50`, `1,234.50`): the last comma or
 * point with one or two digits after it is the decimal mark. Undefined
 * when the field has no format that writes numbers (none, `percent`) or
 * the value is no number: it is shown as typed.
 */
export function formatFieldNumber(raw: string, format: FormFieldSpec['format'], style: FormNumberStyle): string | undefined {
  if (format !== 'currency' && format !== 'decimal' && format !== 'integer') return undefined;
  const t = raw.trim().replace(/\s/g, '');
  const m = /^(-?)([\d.,]*?)(?:[.,](\d{1,2}))?$/.exec(t);
  if (!m || !/\d/.test(t)) return undefined;
  const n = Number(`${m[1]}${m[2]!.replace(/[.,]/g, '')}.${m[3] ?? '0'}`);
  if (!Number.isFinite(n)) return undefined;
  const fixed = Math.abs(n).toFixed(format === 'integer' ? 0 : 2);
  const [whole, frac] = fixed.split('.');
  const sep = style.separatorStyle;
  const group = sep === 0 ? ',' : sep === 2 ? '.' : '';
  const point = sep >= 2 ? ',' : '.';
  const grouped = group ? whole!.replace(/\B(?=(\d{3})+(?!\d))/g, group) : whole!;
  // The minus leads, before a currency too (as `AFNumber_Format` writes
  // it); none on a value that rounds to zero.
  const sign = n < 0 && Number(fixed) !== 0 ? '-' : '';
  const num = `${grouped}${frac ? point + frac : ''}`;
  if (format !== 'currency') return sign + num;
  return sign + (style.currencyBefore ? `${style.currency} ${num}` : `${num} ${style.currency}`);
}

/** What a number field shows of the words `text` when it is painted rather
 *  than filled in (the canvas preview, a print standard's PDF): the value in
 *  its format, else as typed. Undefined for another kind of field or an
 *  empty one, which paint their words as any chip. Painters set it to the
 *  box's end, inside the style's own padding (`padPx`), as the PDF's widget
 *  aligns a number. */
export function numberFieldText(field: FormFieldSpec | undefined, text: string, style: FormNumberStyle): string | undefined {
  if (field?.kind !== 'number') return undefined;
  const value = text.trim();
  if (!value) return undefined;
  return formatFieldNumber(value, field.format, style) ?? value;
}

const KINDS = new Set(['text', 'number', 'checkbox', 'choice']);
const FORMATS = new Set(['currency', 'decimal', 'integer', 'percent']);
const OPS = new Set(['sum', 'product', 'min', 'max', 'avg']);
const flag = (v: string | undefined): boolean => v !== undefined && v !== 'false';

/** A number in a calculation: digits with a point as the decimal mark. */
const CALC_NUMBER = /^-?(?:\d+(?:\.\d*)?|\.\d+)$/;

/**
 * `product(a, b)` → `{ op: 'product', args: ['a', 'b'], fields: ['a', 'b'] }`.
 * An argument is a field by name, a number (`161.75`, a point as the
 * decimal mark) or a nested calculation:
 * `sum(a, product(b, 2.5))`. Anything else is not a calculation.
 */
export function parseFieldCalc(text: string): FormFieldCalc | undefined {
  let at = 0;
  const call = (): FormFieldCalcCall | undefined => {
    const m = /^\s*([a-z]+)\s*\(/i.exec(text.slice(at));
    const op = m?.[1]?.toLowerCase();
    if (!m || !op || !OPS.has(op)) return undefined;
    at += m[0].length;
    const args: FormFieldCalcArg[] = [];
    for (;;) {
      const rest = text.slice(at);
      if (/^\s*[a-z]+\s*\(/i.test(rest)) {
        const inner = call();
        if (!inner) return undefined;
        args.push(inner);
      } else {
        // A field name or a number, up to the next comma or parenthesis.
        const t = /^[^(),]*/.exec(rest)![0];
        at += t.length;
        const word = t.trim();
        if (word) args.push(CALC_NUMBER.test(word) ? Number(word) : word);
      }
      const end = /^\s*([,)])/.exec(text.slice(at));
      if (!end) return undefined;
      at += end[0].length;
      if (end[1] === ')') return args.length > 0 ? { op: op as FormFieldCalcOp, args } : undefined;
    }
  };
  const top = call();
  if (!top || text.slice(at).trim()) return undefined;
  const fields: string[] = [];
  const collect = (c: FormFieldCalcCall): void => {
    for (const a of c.args) {
      if (typeof a === 'object') collect(a);
      else if (typeof a === 'string' && !fields.includes(a)) fields.push(a);
    }
  };
  collect(top);
  return { ...top, fields };
}

/** A number as a calculation writes it: digits and a point, never an
 *  exponent, which {@link parseFieldCalc} would not read. */
const calcNumber = (n: number): string => {
  const s = String(n);
  return /e/i.test(s) ? n.toLocaleString('en-US', { useGrouping: false, maximumFractionDigits: 20 }) : s;
};

/**
 * A calculation as the `calc` attribute writes it, numbers and nested
 * calculations included, which {@link parseFieldCalc} reads back:
 * `sum(a, product(b, 2.5))`.
 */
export function formatFieldCalc(calc: FormFieldCalcCall): string {
  const arg = (a: FormFieldCalcArg): string => (typeof a === 'object' ? formatFieldCalc(a) : typeof a === 'number' ? calcNumber(a) : a);
  return `${calc.op}(${calc.args.map(arg).join(', ')})`;
}

/** The field a chip's attributes describe, or undefined without `field`. */
export function formFieldFromAttrs(attrs: DirectiveAttrs): FormFieldSpec | undefined {
  const name = attrs.field?.trim();
  if (!name) return undefined;
  const kind = KINDS.has(attrs.kind ?? '') ? (attrs.kind as FormFieldSpec['kind']) : attrs.format || attrs.calc ? 'number' : 'text';
  const format = FORMATS.has(attrs.format ?? '') ? (attrs.format as FormFieldSpec['format']) : undefined;
  const calc = attrs.calc ? parseFieldCalc(attrs.calc) : undefined;
  const options = attrs.options ? attrs.options.split('|').map((o) => o.trim()).filter(Boolean) : undefined;
  return {
    name,
    kind,
    ...(format ? { format } : {}),
    ...(calc ? { calc } : {}),
    ...(options && options.length > 0 ? { options } : {}),
    ...(kind === 'checkbox' && attrs.on?.trim() ? { on: attrs.on.trim() } : {}),
    ...(flag(attrs.readonly) || calc ? { readonly: true as const } : {}),
    ...(flag(attrs.required) ? { required: true as const } : {}),
    ...(flag(attrs.multiline) ? { multiline: true as const } : {}),
    ...(attrs.tooltip ? { tooltip: attrs.tooltip } : {}),
  };
}
