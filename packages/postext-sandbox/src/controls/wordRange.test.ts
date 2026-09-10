import { describe, expect, it } from 'vitest';
import { wordRangeAt } from './wordRange';

describe('wordRangeAt', () => {
  const text = 'La ocupación_1 es  clave.';

  it('expands to the word around a caret inside it', () => {
    const o = text.indexOf('ocupación') + 3;
    expect(wordRangeAt(text, o)).toEqual({ from: 3, to: 3 + 'ocupación_1'.length });
  });

  it('takes the word after a caret sitting between words', () => {
    expect(wordRangeAt(text, 0)).toEqual({ from: 0, to: 2 });
  });

  it('takes the word before a caret at a word end', () => {
    expect(wordRangeAt(text, 2)).toEqual({ from: 0, to: 2 });
    const c = text.indexOf('clave');
    expect(wordRangeAt(text, c + 5)).toEqual({ from: c, to: c + 5 });
    expect(wordRangeAt(text, text.length)).toEqual({ from: text.length, to: text.length });
  });

  it('stays collapsed on whitespace with no word adjacent', () => {
    const o = text.indexOf('  ') + 1;
    expect(wordRangeAt(text, o)).toEqual({ from: o, to: o });
  });

  it('clamps out-of-range offsets', () => {
    expect(wordRangeAt('ab', 10)).toEqual({ from: 0, to: 2 });
    expect(wordRangeAt('', 0)).toEqual({ from: 0, to: 0 });
  });
});
