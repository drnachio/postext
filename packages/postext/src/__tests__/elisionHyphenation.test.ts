import { describe, it, expect } from 'vitest';
import { hyphenateText } from '../hyphenation/hyphenate.js';

// #835: an Italian or French apostrophe stands for an elided vowel, and the
// patterns, reading `dellacqua`, split the consonants before it from their
// word: "del-l’acqua", "que-st’anno", "jus-qu’à". The elided word stays
// whole; the word after it divides as usual.

const SHY = '­';
const div = (word: string, locale: string): string => hyphenateText(word, locale).replaceAll(SHY, '-');

describe('Italian elisions (#835)', () => {
  const itl = (word: string): string => div(word, 'it');

  it('never breaks before the apostrophe of an elided word', () => {
    expect(itl('dell’acqua')).toBe('dell’ac-qua');
    expect(itl("dell'alta")).toBe("dell'al-ta");
    expect(itl('sull’altro')).toBe('sull’al-tro');
    expect(itl('nell’ambito')).toBe('nell’am-bi-to');
    expect(itl('dall’inizio')).toBe('dall’i-ni-zio');
    expect(itl('all’improvviso')).toBe('all’im-prov-vi-so');
    expect(itl('quell’uomo')).toBe('quell’uo-mo');
    expect(itl('quest’anno')).toBe('quest’an-no');
    expect(itl('anch’esso')).toBe('anch’es-so');
    expect(itl('senz’altro')).toBe('senz’al-tro');
    expect(itl('tutt’altro')).toBe('tutt’al-tro');
  });

  it('no dictionary break touches the apostrophe', () => {
    for (const word of ['dell’amministrazione', 'l’acqua', 'un’amica', 'c’era', 'sull’orlo', 'quest’ultimo']) {
      expect(itl(word)).not.toMatch(/-['’]|['’]-|-[^\s'’-]*['’]/u);
    }
  });

  it('the word after the elision divides as before', () => {
    expect(itl('dell’amministrazione')).toBe('dell’am-mi-ni-stra-zio-ne');
    expect(itl('l’acqua')).toBe('l’ac-qua');
    expect(itl('c’era')).toBe('c’e-ra');
  });

  it('punctuation around the word changes nothing', () => {
    expect(itl('«dell’acqua»,')).toBe('«dell’ac-qua»,');
  });

  it('a word without an apostrophe is divided as before', () => {
    expect(itl('acqua')).toBe('ac-qua');
    expect(itl('amministrazione')).toBe('am-mi-ni-stra-zio-ne');
  });

  it('keeps a soft hyphen the author typed', () => {
    expect(hyphenateText(`del${SHY}l’acqua`, 'it')).toContain(`del${SHY}l`);
  });
});

describe('French elisions (#835)', () => {
  const fr = (word: string): string => div(word, 'fr');

  it('never breaks before the apostrophe of an elided word', () => {
    for (const word of ['jusqu’à', 'jusqu’alors', 'lorsqu’elle', 'puisqu’elles', 'presqu’île', 'quelqu’un', 'prud’homme']) {
      expect(fr(word)).toBe(word);
    }
    expect(fr('entr’ouvert')).toBe('entr’ou-vert');
    expect(fr('lorsqu’apparaissent')).toBe('lorsqu’ap-pa-raissent');
  });

  it('a break with a syllable before the apostrophe stays', () => {
    expect(fr('aujourd’hui')).toBe('au-jourd’hui');
    expect(fr('qu’aujourd’hui')).toBe('qu’au-jourd’hui');
  });

  it('the word after the elision divides as before', () => {
    expect(fr('l’ordinateur')).toBe('l’or-di-na-teur');
    expect(fr('s’entendre')).toBe('s’en-tendre');
    expect(fr('n’importe')).toBe('n’im-porte');
    expect(fr("l'ordinateur")).toBe("l'or-di-na-teur");
  });
});

describe('the other dictionaries', () => {
  it('English and Catalan keep their own rules', () => {
    expect(div('person’s', 'en-us')).toBe('per-son’s');
    expect(div('isn’t', 'en-us')).toBe('isn’t');
    expect(div('s’havia', 'ca')).toBe('s’ha-via');
    expect(div('l’alba', 'ca')).toBe('l’al-ba');
  });
});
