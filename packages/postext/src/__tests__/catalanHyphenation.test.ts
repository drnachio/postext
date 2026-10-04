import { describe, it, expect, afterEach } from 'vitest';
import { measureRichBlock } from '../measure/rich';
import { measureBlock } from '../measure/plain';
import { hyphenateText, setHyphenationLocale } from '../hyphenate';
import type { InlineSpan } from '../parse';
import type { VDTLine } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env): every
// character, the space included, is 7 px wide.
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const FONT = '16px Test';
const span = (text: string): InlineSpan[] => [{ text, bold: false, italic: false }];
const texts = (lines: { text: string }[]): string[] => lines.map((l) => l.text);
const syllables = (word: string): string => hyphenateText(word, 'ca').replace(/­/g, '-');

afterEach(() => setHyphenationLocale('en-us'));

describe('Catalan syllables (IEC, Llibre d\'estil VI)', () => {
  it('leaves two letters on either side of a break, as TeX does with these patterns', () => {
    expect(['terra', 'guerra', 'caixa', 'cotxe', 'pluja', 'cavall', 'aigua'].map(syllables))
      .toEqual(['ter-ra', 'guer-ra', 'cai-xa', 'cot-xe', 'plu-ja', 'ca-vall', 'ai-gua']);
  });

  it('keeps the digraphs whole and parts the separable pairs', () => {
    expect(['muntanya', 'llibre', 'passar', 'qüestió', 'setmana'].map(syllables))
      .toEqual(['mun-ta-nya', 'lli-bre', 'pas-sar', 'qües-tió', 'set-ma-na']);
  });

  it('breaks an ela geminada between its two l, the dot kept for the line breakers', () => {
    expect(syllables('il·lusió')).toBe('il·-lu-sió');
    expect(syllables('col·lecció')).toBe('col·-lec-ció');
    expect(syllables('«Intel·ligent»')).toBe('«In-tel·-li-gent»');
  });

  it('does not part two vowels in hiatus, but an intervocalic i or u opens its syllable', () => {
    expect(['ciència', 'camions', 'geografia', 'realitat', 'dient', 'suor'].map(syllables))
      .toEqual(['cièn-cia', 'ca-mions', 'geo-gra-fia', 'rea-li-tat', 'dient', 'suor']);
    expect(['feia', 'veient', 'creuen'].map(syllables)).toEqual(['fe-ia', 've-ient', 'cre-uen']);
  });

  it('divides the common prefixed words at their prefix', () => {
    expect(['nosaltres', 'vosaltres', 'benestar', 'malentès', 'celobert', 'transatlàntic'].map(syllables))
      .toEqual(['nos-al-tres', 'vos-al-tres', 'ben-es-tar', 'mal-en-tès', 'cel-o-bert', 'trans-at-làn-tic']);
  });

  it('never breaks right after an apostrophe', () => {
    expect(["l'alba", "s'havia", "l'home", "d'aquelles"].map(syllables))
      .toEqual(["l'al-ba", "s'ha-via", "l'ho-me", "d'a-que-lles"]);
  });

  it('leaves the other languages as they were', () => {
    expect(hyphenateText('il·lusió', 'es').replace(/­/g, '-')).not.toContain('·-');
    expect(hyphenateText('terra', 'it').replace(/­/g, '-')).toBe('ter-ra');
  });
});

describe('a line ending inside l·l prints the hyphen in place of the dot', () => {
  // 80 px = 11 characters: "la gran il-" fits, "la gran il·lu-" does not.
  const TEXT = 'la gran il·lusió del poble';
  const check = (lines: VDTLine[]): void => {
    expect(lines[0]!.text).toBe('la gran il-');
    expect(lines[1]!.text.startsWith('lusió')).toBe(true);
    const last = lines[0]!.segments!.filter((s) => s.kind === 'text').at(-1)!;
    expect(last.text).toBe('il-');
    expect(last.width).toBe(3 * 7);
  };

  it('on the plain greedy path', () => {
    setHyphenationLocale('ca');
    check(measureBlock(TEXT, FONT, 80, 20, { textAlign: 'justify', hyphenate: true }).lines);
  });

  // 77 px: "la gran il-" fits only because the break gives the dot back.
  it('with Knuth–Plass on plain text', () => {
    setHyphenationLocale('ca');
    check(measureBlock(TEXT, FONT, 77, 20, { textAlign: 'justify', hyphenate: true, optimal: true }).lines);
  });

  it('on the rich greedy path', () => {
    setHyphenationLocale('ca');
    check(measureRichBlock(span(TEXT), FONT, FONT, FONT, FONT, 80, 20, { textAlign: 'justify', hyphenate: true }).lines);
  });

  it('with Knuth–Plass on rich text', () => {
    setHyphenationLocale('ca');
    check(measureRichBlock(span(TEXT), FONT, FONT, FONT, FONT, 77, 20, { textAlign: 'justify', hyphenate: true, optimal: true }).lines);
  });

  it('a word wider than the line is cut the same way', () => {
    setHyphenationLocale('ca');
    // 35 px = 5 characters: "il·lu-" (6) does not fit, "il-" does.
    const lines = texts(measureRichBlock(span('il·lusió'), FONT, FONT, FONT, FONT, 35, 20, { textAlign: 'left', hyphenate: true }).lines);
    expect(lines[0]).toBe('il-');
    expect(lines.join('')).toBe('il-lusió');
  });
});
