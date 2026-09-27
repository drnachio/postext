import { describe, expect, it } from 'vitest';
import { listNumberFormatValue } from './numberFormat';

// EF-12: a part's list override is shown raw, so the select must read the
// spellings the engine reads, or it matches no option.
describe('list number format in the panel', () => {
  it('shows any spelling of a format in the list spelling', () => {
    expect(listNumberFormatValue('decimal')).toBe('arabic');
    expect(listNumberFormatValue('arabic')).toBe('arabic');
    expect(listNumberFormatValue('roman-lower')).toBe('lower-roman');
    expect(listNumberFormatValue('I')).toBe('upper-roman');
    expect(listNumberFormatValue('upper-latin')).toBe('upper-alpha');
    expect(listNumberFormatValue('lower-alpha')).toBe('lower-alpha');
  });

  it('shows an unknown value as arabic, as the engine numbers it', () => {
    expect(listNumberFormatValue('roman')).toBe('arabic');
    expect(listNumberFormatValue(undefined)).toBe('arabic');
  });
});
