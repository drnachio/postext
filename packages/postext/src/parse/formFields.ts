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
