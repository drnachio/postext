import { describe, expect, it } from 'vitest';
import { evalLength, plainNumber } from './lengthExpression.js';

describe('evalLength', () => {
  it('reads a bare number in the field\'s unit, with either decimal mark', () => {
    expect(evalLength('25,5', 'mm')).toBe(25.5);
    expect(evalLength(' 25.5 ', 'mm')).toBe(25.5);
    expect(evalLength('.5', 'cm')).toBe(0.5);
  });
  it('converts a length typed in another unit', () => {
    expect(evalLength('2cm', 'mm')).toBe(20);
    expect(evalLength('1in', 'pt')).toBe(72);
    expect(evalLength('1"', 'mm')).toBe(25.4);
    expect(evalLength('1pc', 'pt')).toBe(12);
    expect(evalLength('36 pt', 'in')).toBe(0.5);
    expect(evalLength('10MM', 'cm')).toBe(1);
  });
  it('adds and subtracts, a bare number counting in the field\'s unit', () => {
    expect(evalLength('25+3', 'mm')).toBe(28);
    expect(evalLength('12pt + 2mm', 'pt')).toBe(17.67);
    expect(evalLength('2cm - 5', 'mm')).toBe(15);
    expect(evalLength('−3 + 10', 'mm')).toBe(7);
  });
  it('multiplies and divides by a factor, with the usual precedence and brackets', () => {
    expect(evalLength('210mm - 2*15mm', 'mm')).toBe(180);
    expect(evalLength('(21cm - 3cm) / 2', 'cm')).toBe(9);
    expect(evalLength('3 × 4', 'pt')).toBe(12);
    expect(evalLength('1in / 2', 'pt')).toBe(36);
    expect(evalLength('20mm / 4mm', 'mm')).toBe(5);
  });
  it('keeps relative units apart from absolute ones', () => {
    expect(evalLength('1,5em', 'em')).toBe(1.5);
    expect(evalLength('1rem + 0.5', 'em')).toBe(1.5);
    expect(evalLength('12pt', 'em')).toBeNull();
    expect(evalLength('1em', 'pt')).toBeNull();
    expect(evalLength('1em + 2pt', 'pt')).toBeNull();
  });
  it('refuses what is not a length', () => {
    expect(evalLength('', 'mm')).toBeNull();
    expect(evalLength('abc', 'mm')).toBeNull();
    expect(evalLength('2mm * 3mm', 'mm')).toBeNull();
    expect(evalLength('5 / 0', 'mm')).toBeNull();
    expect(evalLength('2 / 1mm', 'mm')).toBeNull();
    expect(evalLength('2 +', 'mm')).toBeNull();
    expect(evalLength('(2', 'mm')).toBeNull();
    expect(evalLength('2 3', 'mm')).toBeNull();
    expect(evalLength('1.2.3', 'mm')).toBeNull();
  });
});

describe('plainNumber', () => {
  it('takes a number as it is typed and nothing else', () => {
    expect(plainNumber('25')).toBe(25);
    expect(plainNumber('25,')).toBe(25);
    expect(plainNumber('25,5')).toBe(25.5);
    expect(plainNumber('2cm')).toBeNull();
    expect(plainNumber('25+3')).toBeNull();
    expect(plainNumber('')).toBeNull();
  });
});
