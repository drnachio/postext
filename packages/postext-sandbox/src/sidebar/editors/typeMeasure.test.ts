import { describe, expect, it } from 'vitest';
import { alphabeticMeasure, charactersPerLine, measureVerdict } from './typeMeasure.js';

describe('charactersPerLine', () => {
  it('divides the column by the average character', () => {
    // 86 mm column, 10.5 pt, a face averaging 0.43 em a character.
    expect(charactersPerLine(86 * 2.83465, 10.5, 0.43)).toBe(54);
    expect(charactersPerLine(300, 0, 0.5)).toBe(0);
    expect(charactersPerLine(300, 10, 0)).toBe(0);
  });
});

describe('measureVerdict', () => {
  it('holds one column to 45–75 characters and several to 40–75', () => {
    expect(measureVerdict(44, 1)).toBe('short');
    expect(measureVerdict(45, 1)).toBe('good');
    expect(measureVerdict(75, 1)).toBe('good');
    expect(measureVerdict(76, 1)).toBe('long');
    expect(measureVerdict(42, 2)).toBe('good');
    expect(measureVerdict(39, 2)).toBe('short');
  });
});

describe('alphabeticMeasure', () => {
  it('judges alphabets and leaves the other scripts alone', () => {
    expect(alphabeticMeasure('es')).toBe(true);
    expect(alphabeticMeasure('en-US')).toBe(true);
    expect(alphabeticMeasure('ru')).toBe(true);
    expect(alphabeticMeasure('zh-Hans')).toBe(false);
    expect(alphabeticMeasure('ja')).toBe(false);
    expect(alphabeticMeasure('ar')).toBe(false);
  });
});
