import { describe, it, expect } from 'vitest';
import { hyphenateText } from '../../hyphenation/hyphenate.js';

// #669: hypher counts an apostrophe as a character of the word, so the
// English patterns' least of three after a break let `m's` and `n't` pass:
// "ar-m's", "is-n't", "could-n't". A break next to an apostrophe needs its
// letters, the apostrophe not counted.

const SHY = '­';
const en = (word: string): string => hyphenateText(word, 'en-us').replaceAll(SHY, '-');

describe('English words with an apostrophe (#669)', () => {
  it('a one-syllable possessive stays whole', () => {
    for (const word of ['arm’s', "arm's", 'ship’s', 'boat’s', 'year’s']) expect(en(word)).toBe(word);
  });

  it('a contraction never leaves n’t to open a line', () => {
    for (const word of ['isn’t', "isn't", 'couldn’t', "couldn't", 'wouldn’t', 'hadn’t', 'doesn’t', 'wasn’t']) {
      expect(en(word)).toBe(word);
    }
  });

  it('no break right after an apostrophe that follows one letter', () => {
    expect(en('o’clock')).toBe('o’clock');
  });

  it('a break with its letters on both sides stays', () => {
    expect(en('person’s')).toBe('per-son’s');
    expect(en("person's")).toBe("per-son's");
    expect(en('mother’s')).toBe('moth-er’s');
    expect(en('journal’s')).toBe('jour-nal’s');
    expect(en('author’s')).toBe('au-thor’s');
  });

  it('punctuation around the word is not counted as letters', () => {
    expect(en('(isn’t),')).toBe('(isn’t),');
    expect(en('“arm’s”')).toBe('“arm’s”');
    expect(en('(person’s)')).toBe('(per-son’s)');
  });

  it('a word without an apostrophe is divided as before', () => {
    expect(en('hyphenation')).toBe('hy-phen-ation');
    expect(en('typography')).toBe(hyphenateText('typography', 'en-us').replaceAll(SHY, '-'));
  });

  it('keeps a soft hyphen the author typed', () => {
    expect(hyphenateText(`is${SHY}n’t`, 'en-us')).toContain(SHY);
  });

  it('leaves Catalan to its own rules', () => {
    // Italian and French elisions: elisionHyphenation.test.ts (#835).
    expect(hyphenateText('s’havia', 'ca').replaceAll(SHY, '-')).toBe('s’ha-via');
  });
});
