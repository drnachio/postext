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
 *   :chip[ ]{style="box" field="pkg.a" kind="checkbox"}
 */
import type { DirectiveAttrs } from './types.js';

/** What a field computes from others (Acrobat's simple calculate). */
export type FormFieldCalcOp = 'sum' | 'product' | 'min' | 'max' | 'avg';

export interface FormFieldSpec {
  /** Unique per document; dots make a hierarchy (`pos.a.qty`). */
  name: string;
  /** `text` (default), `number`, `checkbox` or `choice`. */
  kind: 'text' | 'number' | 'checkbox' | 'choice';
  /** How a number is shown and typed: `currency` (the document's currency,
   *  two decimals), `decimal` (two decimals), `integer`, `percent`. */
  format?: 'currency' | 'decimal' | 'integer' | 'percent';
  /** Computed from other fields, by name. */
  calc?: { op: FormFieldCalcOp; fields: string[] };
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

/** `product(a, b)` → `{ op: 'product', fields: ['a', 'b'] }`; anything else
 *  is not a calculation. */
export function parseFieldCalc(text: string): FormFieldSpec['calc'] | undefined {
  const m = /^\s*([a-z]+)\s*\(([^()]*)\)\s*$/i.exec(text);
  if (!m || !OPS.has(m[1]!.toLowerCase())) return undefined;
  const fields = m[2]!.split(',').map((f) => f.trim()).filter(Boolean);
  return fields.length > 0 ? { op: m[1]!.toLowerCase() as FormFieldCalcOp, fields } : undefined;
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
    ...(flag(attrs.readonly) || calc ? { readonly: true as const } : {}),
    ...(flag(attrs.required) ? { required: true as const } : {}),
    ...(flag(attrs.multiline) ? { multiline: true as const } : {}),
    ...(attrs.tooltip ? { tooltip: attrs.tooltip } : {}),
  };
}
