import { describe, it, expect } from 'vitest';
import { formatFieldNumber, formNumberStyle, numberFieldText, documentLanguageOf } from '../../index.js';
import { formFieldFromAttrs, parseFieldCalc } from '../../parse/formFields.js';

// #1445: the number rule every output shares (the PDF's printed values and
// its widgets' appearance, the canvas preview, writers of the display list).

const de = formNumberStyle(undefined, 'de-DE');
const en = formNumberStyle(undefined, 'en-US');

describe('form field attributes (#1445)', () => {
  it('reads the kind, format, calculation and flags', () => {
    expect(formFieldFromAttrs({ field: 'order.total', format: 'currency', calc: 'sum(a, b)' })).toEqual({
      name: 'order.total', kind: 'number', format: 'currency', calc: { op: 'sum', args: ['a', 'b'], fields: ['a', 'b'] }, readonly: true,
    });
    expect(formFieldFromAttrs({ field: 'size', kind: 'choice', options: 'S | M | L', required: '' })).toEqual({
      name: 'size', kind: 'choice', options: ['S', 'M', 'L'], required: true,
    });
    expect(formFieldFromAttrs({ style: 'field' })).toBeUndefined();
    expect(parseFieldCalc('divide(a, b)')).toBeUndefined();
  });

  it('reads numbers and nested calculations, and every field they read', () => {
    expect(parseFieldCalc('sum(order.a.total, order.b.total, product(order.fee, 161.75), product(order.wrap, order.wrap.price))')).toEqual({
      op: 'sum',
      args: [
        'order.a.total',
        'order.b.total',
        { op: 'product', args: ['order.fee', 161.75] },
        { op: 'product', args: ['order.wrap', 'order.wrap.price'] },
      ],
      fields: ['order.a.total', 'order.b.total', 'order.fee', 'order.wrap', 'order.wrap.price'],
    });
    // A name that has digits stays a name; a bare number, also negative or
    // with a leading point, is a number. A field read twice is listed once.
    expect(parseFieldCalc('product(pkg.1, -2, .5, pkg.1)')).toEqual({ op: 'product', args: ['pkg.1', -2, 0.5, 'pkg.1'], fields: ['pkg.1'] });
    expect(parseFieldCalc(' MAX( a ,min(b, 3) ) ')?.args).toEqual(['a', { op: 'min', args: ['b', 3] }]);
    // An unknown or empty nested calculation, an unclosed one and trailing
    // text are no calculation.
    for (const bad of ['sum(a, divide(b, 2))', 'sum(a, product())', 'sum(a, product(b, 2)', 'sum(a) b', 'sum(a b(c))', '12.5']) {
      expect(parseFieldCalc(bad)).toBeUndefined();
    }
  });

  it('reads the on value of a check box, and of no other kind', () => {
    expect(formFieldFromAttrs({ field: 'order.fee', kind: 'checkbox', on: ' 1 ' })).toEqual({ name: 'order.fee', kind: 'checkbox', on: '1' });
    expect(formFieldFromAttrs({ field: 'order.fee', kind: 'checkbox' })).toEqual({ name: 'order.fee', kind: 'checkbox' });
    expect(formFieldFromAttrs({ field: 'note', on: '1' })).toEqual({ name: 'note', kind: 'text' });
  });
});

describe('number style (#1445)', () => {
  it('takes the separators from the document language, options overriding', () => {
    expect(de).toEqual({ currency: '€', currencyBefore: true, separatorStyle: 2 });
    expect(en.separatorStyle).toBe(0);
    expect(formNumberStyle(undefined, undefined).separatorStyle).toBe(0);
    expect(formNumberStyle(undefined, 'de_AT').separatorStyle).toBe(2);
    // A language that only starts like one that writes `1.234,56`.
    expect(formNumberStyle(undefined, 'dsb').separatorStyle).toBe(0);
    expect(formNumberStyle({ separatorStyle: 3, currency: 'CHF', currencyBefore: false }, 'en')).toEqual({ currency: 'CHF', currencyBefore: false, separatorStyle: 3 });
  });

  it('reads the language from the locale, else the hyphenation tag', () => {
    expect(documentLanguageOf({ locale: 'de' })).toBe('de');
    expect(documentLanguageOf({ bodyText: { hyphenation: { locale: 'fr' } } })).toBe('fr');
    expect(documentLanguageOf({ bodyText: { shapingLanguage: 'host', hyphenation: { tag: 'es-ES' } } })).toBe('es-ES');
    expect(documentLanguageOf(undefined)).toBeUndefined();
  });
});

describe('formatFieldNumber (#1445)', () => {
  it('writes currency, decimals and integers in the style', () => {
    expect(formatFieldNumber('1234.5', 'currency', de)).toBe('€ 1.234,50');
    expect(formatFieldNumber('1234.5', 'currency', en)).toBe('€ 1,234.50');
    expect(formatFieldNumber('1234.5', 'currency', { ...de, currencyBefore: false })).toBe('1.234,50 €');
    expect(formatFieldNumber('1234,5', 'decimal', de)).toBe('1.234,50');
    expect(formatFieldNumber('1234', 'integer', en)).toBe('1,234');
    expect(formatFieldNumber('1234.56', 'decimal', { ...en, separatorStyle: 1 })).toBe('1234.56');
    expect(formatFieldNumber('1234.56', 'decimal', { ...en, separatorStyle: 3 })).toBe('1234,56');
  });

  it('reads a value written either way', () => {
    for (const raw of ['1234.5', '1234,5', '1.234,50', '1,234.50', ' 1 234,50 ']) {
      expect(formatFieldNumber(raw, 'decimal', de)).toBe('1.234,50');
    }
    // Three digits after the only mark: thousands.
    expect(formatFieldNumber('1.234', 'integer', de)).toBe('1.234');
    expect(formatFieldNumber('-12,5', 'currency', de)).toBe('-€ 12,50');
    expect(formatFieldNumber('-1234', 'decimal', en)).toBe('-1,234.00');
    expect(formatFieldNumber('-0.4', 'integer', en)).toBe('0');
  });

  it('leaves text, an empty value and a percent alone', () => {
    expect(formatFieldNumber('n/a', 'currency', de)).toBeUndefined();
    expect(formatFieldNumber('', 'currency', de)).toBeUndefined();
    expect(formatFieldNumber('12', 'percent', de)).toBeUndefined();
    expect(formatFieldNumber('12', undefined, de)).toBeUndefined();
  });
});

describe('numberFieldText (#1445)', () => {
  it('shows a number field formatted, else as typed; other fields not', () => {
    expect(numberFieldText({ name: 'p', kind: 'number', format: 'currency' }, ' 120 ', de)).toBe('€ 120,00');
    expect(numberFieldText({ name: 'q', kind: 'number' }, ' 3 ', de)).toBe('3');
    expect(numberFieldText({ name: 'q', kind: 'number', format: 'currency' }, 'tbd', de)).toBe('tbd');
    expect(numberFieldText({ name: 'q', kind: 'number', format: 'currency' }, ' ', de)).toBeUndefined();
    expect(numberFieldText({ name: 'n', kind: 'text' }, '120', de)).toBeUndefined();
    expect(numberFieldText(undefined, '120', de)).toBeUndefined();
  });
});
