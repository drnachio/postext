import { describe, it, expect } from 'vitest';
import { caseWords, numberToWords } from '../numerals/numberWords.js';
import { computeHeadingNumbering } from '../numerals/numbering.js';
import { parseMarkdown } from '../parse/index.js';

/** `numberToWords` for 1…100 in `locale`, one entry per number. */
const upTo100 = (locale: string) => Array.from({ length: 100 }, (_, i) => numberToWords(i + 1, 'cardinal', locale));

/** The table of a language, written out by decade, `|` between numbers. */
const table = (...decades: string[]) => decades.join('|').split('|');

describe('French number words (#834)', () => {
  it('spells 1–100 in the traditional spelling', () => {
    expect(upTo100('fr')).toEqual(table(
      'un|deux|trois|quatre|cinq|six|sept|huit|neuf|dix',
      'onze|douze|treize|quatorze|quinze|seize|dix-sept|dix-huit|dix-neuf|vingt',
      'vingt et un|vingt-deux|vingt-trois|vingt-quatre|vingt-cinq|vingt-six|vingt-sept|vingt-huit|vingt-neuf|trente',
      'trente et un|trente-deux|trente-trois|trente-quatre|trente-cinq|trente-six|trente-sept|trente-huit|trente-neuf|quarante',
      'quarante et un|quarante-deux|quarante-trois|quarante-quatre|quarante-cinq|quarante-six|quarante-sept|quarante-huit|quarante-neuf|cinquante',
      'cinquante et un|cinquante-deux|cinquante-trois|cinquante-quatre|cinquante-cinq|cinquante-six|cinquante-sept|cinquante-huit|cinquante-neuf|soixante',
      'soixante et un|soixante-deux|soixante-trois|soixante-quatre|soixante-cinq|soixante-six|soixante-sept|soixante-huit|soixante-neuf|soixante-dix',
      'soixante et onze|soixante-douze|soixante-treize|soixante-quatorze|soixante-quinze|soixante-seize|soixante-dix-sept|soixante-dix-huit|soixante-dix-neuf|quatre-vingts',
      'quatre-vingt-un|quatre-vingt-deux|quatre-vingt-trois|quatre-vingt-quatre|quatre-vingt-cinq|quatre-vingt-six|quatre-vingt-sept|quatre-vingt-huit|quatre-vingt-neuf|quatre-vingt-dix',
      'quatre-vingt-onze|quatre-vingt-douze|quatre-vingt-treize|quatre-vingt-quatorze|quatre-vingt-quinze|quatre-vingt-seize|quatre-vingt-dix-sept|quatre-vingt-dix-huit|quatre-vingt-dix-neuf|cent',
    ));
  });

  it('writes the hundreds and thousands, cent and vingt agreeing only when last', () => {
    const fr = (n: number) => numberToWords(n, 'cardinal', 'fr-FR');
    expect(fr(101)).toBe('cent un');
    expect(fr(200)).toBe('deux cents');
    expect(fr(201)).toBe('deux cent un');
    expect(fr(280)).toBe('deux cent quatre-vingts');
    expect(fr(1000)).toBe('mille');
    expect(fr(1001)).toBe('mille un');
    expect(fr(2000)).toBe('deux mille');
    expect(fr(2024)).toBe('deux mille vingt-quatre');
    expect(fr(21_000)).toBe('vingt et un mille');
    expect(fr(80_000)).toBe('quatre-vingt mille');
    expect(fr(200_000)).toBe('deux cent mille');
    expect(fr(999_999)).toBe('neuf cent quatre-vingt-dix-neuf mille neuf cent quatre-vingt-dix-neuf');
  });

  it('spells the ordinals, premier and première for one', () => {
    const ordinals = Array.from({ length: 20 }, (_, i) => numberToWords(i + 1, 'ordinal', 'fr'));
    expect(ordinals).toEqual(table(
      'premier|deuxième|troisième|quatrième|cinquième|sixième|septième|huitième|neuvième|dixième',
      'onzième|douzième|treizième|quatorzième|quinzième|seizième|dix-septième|dix-huitième|dix-neuvième|vingtième',
    ));
    const fr = (n: number) => numberToWords(n, 'ordinal', 'fr');
    expect(fr(21)).toBe('vingt et unième');
    expect(fr(71)).toBe('soixante et onzième');
    expect(fr(80)).toBe('quatre-vingtième');
    expect(fr(81)).toBe('quatre-vingt-unième');
    expect(fr(100)).toBe('centième');
    expect(fr(200)).toBe('deux centième');
    expect(fr(1000)).toBe('millième');
    expect(fr(2000)).toBe('deux millième');
    expect(numberToWords(1, 'ordinal', 'fr', { gender: 'feminine' })).toBe('première');
    expect(numberToWords(2, 'ordinal', 'fr', { gender: 'feminine' })).toBe('deuxième');
  });

  it('writes une for a feminine noun', () => {
    expect(numberToWords(1, 'cardinal', 'fr', { gender: 'feminine' })).toBe('une');
    expect(numberToWords(21, 'cardinal', 'fr', { gender: 'feminine' })).toBe('vingt et une');
    expect(numberToWords(81, 'cardinal', 'fr', { gender: 'feminine' })).toBe('quatre-vingt-une');
    expect(numberToWords(11, 'cardinal', 'fr', { gender: 'feminine' })).toBe('onze');
  });
});

describe('Italian number words (#834)', () => {
  it('spells 1–100 as one word', () => {
    expect(upTo100('it')).toEqual(table(
      'uno|due|tre|quattro|cinque|sei|sette|otto|nove|dieci',
      'undici|dodici|tredici|quattordici|quindici|sedici|diciassette|diciotto|diciannove|venti',
      'ventuno|ventidue|ventitré|ventiquattro|venticinque|ventisei|ventisette|ventotto|ventinove|trenta',
      'trentuno|trentadue|trentatré|trentaquattro|trentacinque|trentasei|trentasette|trentotto|trentanove|quaranta',
      'quarantuno|quarantadue|quarantatré|quarantaquattro|quarantacinque|quarantasei|quarantasette|quarantotto|quarantanove|cinquanta',
      'cinquantuno|cinquantadue|cinquantatré|cinquantaquattro|cinquantacinque|cinquantasei|cinquantasette|cinquantotto|cinquantanove|sessanta',
      'sessantuno|sessantadue|sessantatré|sessantaquattro|sessantacinque|sessantasei|sessantasette|sessantotto|sessantanove|settanta',
      'settantuno|settantadue|settantatré|settantaquattro|settantacinque|settantasei|settantasette|settantotto|settantanove|ottanta',
      'ottantuno|ottantadue|ottantatré|ottantaquattro|ottantacinque|ottantasei|ottantasette|ottantotto|ottantanove|novanta',
      'novantuno|novantadue|novantatré|novantaquattro|novantacinque|novantasei|novantasette|novantotto|novantanove|cento',
    ));
  });

  it('writes the hundreds and thousands', () => {
    const it_ = (n: number) => numberToWords(n, 'cardinal', 'it-IT');
    expect(it_(101)).toBe('centouno');
    expect(it_(103)).toBe('centotré');
    expect(it_(108)).toBe('centotto');
    expect(it_(180)).toBe('centottanta');
    expect(it_(200)).toBe('duecento');
    expect(it_(1000)).toBe('mille');
    expect(it_(1001)).toBe('milleuno');
    expect(it_(2000)).toBe('duemila');
    expect(it_(2024)).toBe('duemilaventiquattro');
    expect(it_(3003)).toBe('tremilatré');
    expect(it_(23_000)).toBe('ventitremila');
    expect(it_(100_000)).toBe('centomila');
    expect(it_(999_999)).toBe('novecentonovantanovemilanovecentonovantanove');
  });

  it('spells the ordinals, masculine and feminine', () => {
    const ordinals = Array.from({ length: 20 }, (_, i) => numberToWords(i + 1, 'ordinal', 'it'));
    expect(ordinals).toEqual(table(
      'primo|secondo|terzo|quarto|quinto|sesto|settimo|ottavo|nono|decimo',
      'undicesimo|dodicesimo|tredicesimo|quattordicesimo|quindicesimo|sedicesimo|diciassettesimo|diciottesimo|diciannovesimo|ventesimo',
    ));
    const it_ = (n: number) => numberToWords(n, 'ordinal', 'it');
    expect(it_(21)).toBe('ventunesimo');
    expect(it_(23)).toBe('ventitreesimo');
    expect(it_(26)).toBe('ventiseiesimo');
    expect(it_(28)).toBe('ventottesimo');
    expect(it_(100)).toBe('centesimo');
    expect(it_(1000)).toBe('millesimo');
    expect(it_(2000)).toBe('duemillesimo');
    expect(numberToWords(1, 'ordinal', 'it', { gender: 'feminine' })).toBe('prima');
    expect(numberToWords(21, 'ordinal', 'it', { gender: 'feminine' })).toBe('ventunesima');
    expect(numberToWords(1, 'cardinal', 'it', { gender: 'feminine' })).toBe('una');
  });
});

describe('German number words (#834)', () => {
  it('spells 1–100 as one word', () => {
    expect(upTo100('de')).toEqual(table(
      'eins|zwei|drei|vier|fünf|sechs|sieben|acht|neun|zehn',
      'elf|zwölf|dreizehn|vierzehn|fünfzehn|sechzehn|siebzehn|achtzehn|neunzehn|zwanzig',
      'einundzwanzig|zweiundzwanzig|dreiundzwanzig|vierundzwanzig|fünfundzwanzig|sechsundzwanzig|siebenundzwanzig|achtundzwanzig|neunundzwanzig|dreißig',
      'einunddreißig|zweiunddreißig|dreiunddreißig|vierunddreißig|fünfunddreißig|sechsunddreißig|siebenunddreißig|achtunddreißig|neununddreißig|vierzig',
      'einundvierzig|zweiundvierzig|dreiundvierzig|vierundvierzig|fünfundvierzig|sechsundvierzig|siebenundvierzig|achtundvierzig|neunundvierzig|fünfzig',
      'einundfünfzig|zweiundfünfzig|dreiundfünfzig|vierundfünfzig|fünfundfünfzig|sechsundfünfzig|siebenundfünfzig|achtundfünfzig|neunundfünfzig|sechzig',
      'einundsechzig|zweiundsechzig|dreiundsechzig|vierundsechzig|fünfundsechzig|sechsundsechzig|siebenundsechzig|achtundsechzig|neunundsechzig|siebzig',
      'einundsiebzig|zweiundsiebzig|dreiundsiebzig|vierundsiebzig|fünfundsiebzig|sechsundsiebzig|siebenundsiebzig|achtundsiebzig|neunundsiebzig|achtzig',
      'einundachtzig|zweiundachtzig|dreiundachtzig|vierundachtzig|fünfundachtzig|sechsundachtzig|siebenundachtzig|achtundachtzig|neunundachtzig|neunzig',
      'einundneunzig|zweiundneunzig|dreiundneunzig|vierundneunzig|fünfundneunzig|sechsundneunzig|siebenundneunzig|achtundneunzig|neunundneunzig|hundert',
    ));
  });

  it('writes the hundreds and thousands, eins at the end and ein before tausend', () => {
    const de = (n: number) => numberToWords(n, 'cardinal', 'de-DE');
    expect(de(101)).toBe('hunderteins');
    expect(de(121)).toBe('hunderteinundzwanzig');
    expect(de(200)).toBe('zweihundert');
    expect(de(1000)).toBe('tausend');
    expect(de(1001)).toBe('tausendeins');
    expect(de(2024)).toBe('zweitausendvierundzwanzig');
    expect(de(21_000)).toBe('einundzwanzigtausend');
    expect(de(101_000)).toBe('hunderteintausend');
    expect(de(999_999)).toBe('neunhundertneunundneunzigtausendneunhundertneunundneunzig');
  });

  it('spells the ordinals, weak after the article and strong in a gender', () => {
    const ordinals = Array.from({ length: 20 }, (_, i) => numberToWords(i + 1, 'ordinal', 'de'));
    expect(ordinals).toEqual(table(
      'erste|zweite|dritte|vierte|fünfte|sechste|siebte|achte|neunte|zehnte',
      'elfte|zwölfte|dreizehnte|vierzehnte|fünfzehnte|sechzehnte|siebzehnte|achtzehnte|neunzehnte|zwanzigste',
    ));
    const de = (n: number) => numberToWords(n, 'ordinal', 'de');
    expect(de(21)).toBe('einundzwanzigste');
    expect(de(100)).toBe('hundertste');
    expect(de(101)).toBe('hunderterste');
    expect(de(108)).toBe('hundertachte');
    expect(de(1000)).toBe('tausendste');
    expect(de(2024)).toBe('zweitausendvierundzwanzigste');
    expect(numberToWords(1, 'ordinal', 'de', { gender: 'masculine' })).toBe('erster');
    expect(numberToWords(1, 'ordinal', 'de', { gender: 'feminine' })).toBe('erste');
    expect(numberToWords(1, 'ordinal', 'de', { gender: 'neuter' })).toBe('erstes');
    expect(numberToWords(20, 'ordinal', 'de', { gender: 'neuter' })).toBe('zwanzigstes');
    // The cardinal counts alike for every gender.
    expect(numberToWords(1, 'cardinal', 'de', { gender: 'feminine' })).toBe('eins');
  });

  it('writes ss for ß in Switzerland, and SS in capitals', () => {
    expect(numberToWords(31, 'cardinal', 'de-CH')).toBe('einunddreissig');
    expect(numberToWords(30, 'ordinal', 'de-CH')).toBe('dreissigste');
    expect(caseWords(numberToWords(32, 'cardinal', 'de'), 'upper', 'de')).toBe('ZWEIUNDDREISSIG');
  });
});

describe('Catalan number words (#834)', () => {
  it('spells cardinals as the IEC writes them, u where the number follows its noun', () => {
    expect(upTo100('ca').slice(0, 31)).toEqual(table(
      'u|dos|tres|quatre|cinc|sis|set|vuit|nou|deu',
      'onze|dotze|tretze|catorze|quinze|setze|disset|divuit|dinou|vint',
      'vint-i-u|vint-i-dos|vint-i-tres|vint-i-quatre|vint-i-cinc|vint-i-sis|vint-i-set|vint-i-vuit|vint-i-nou|trenta',
      'trenta-u',
    ));
    const ca = (n: number) => numberToWords(n, 'cardinal', 'ca');
    expect(ca(99)).toBe('noranta-nou');
    expect(ca(100)).toBe('cent');
    expect(ca(101)).toBe('cent u');
    expect(ca(200)).toBe('dos-cents');
    expect(ca(1000)).toBe('mil');
    expect(ca(2024)).toBe('dos mil vint-i-quatre');
    expect(ca(21_000)).toBe('vint-i-un mil');
    expect(numberToWords(1, 'cardinal', 'ca', { gender: 'feminine' })).toBe('una');
    expect(numberToWords(222, 'cardinal', 'ca', { gender: 'feminine' })).toBe('dues-centes vint-i-dues');
  });

  it('spells the ordinals up to 999', () => {
    const ordinals = Array.from({ length: 20 }, (_, i) => numberToWords(i + 1, 'ordinal', 'ca'));
    expect(ordinals).toEqual(table(
      'primer|segon|tercer|quart|cinquè|sisè|setè|vuitè|novè|desè',
      'onzè|dotzè|tretzè|catorzè|quinzè|setzè|dissetè|divuitè|dinovè|vintè',
    ));
    expect(numberToWords(21, 'ordinal', 'ca')).toBe('vint-i-unè');
    expect(numberToWords(100, 'ordinal', 'ca')).toBe('centè');
    expect(numberToWords(1, 'ordinal', 'ca', { gender: 'feminine' })).toBe('primera');
    expect(numberToWords(5, 'ordinal', 'ca', { gender: 'feminine' })).toBe('cinquena');
    expect(numberToWords(1000, 'ordinal', 'ca')).toBe('1000');
  });
});

describe('Portuguese number words (#834)', () => {
  it('spells cardinals, Brazilian by default and European in another region', () => {
    const pt = (n: number, locale = 'pt-BR') => numberToWords(n, 'cardinal', locale);
    expect(upTo100('pt').slice(0, 22)).toEqual(table(
      'um|dois|três|quatro|cinco|seis|sete|oito|nove|dez',
      'onze|doze|treze|quatorze|quinze|dezesseis|dezessete|dezoito|dezenove|vinte',
      'vinte e um|vinte e dois',
    ));
    expect(pt(16, 'pt-PT')).toBe('dezasseis');
    expect(pt(14, 'pt-PT')).toBe('catorze');
    expect(pt(100)).toBe('cem');
    expect(pt(101)).toBe('cento e um');
    expect(pt(500)).toBe('quinhentos');
    expect(pt(1001)).toBe('mil e um');
    expect(pt(1100)).toBe('mil e cem');
    expect(pt(1234)).toBe('mil duzentos e trinta e quatro');
    expect(pt(2024)).toBe('dois mil e vinte e quatro');
    expect(numberToWords(222, 'cardinal', 'pt', { gender: 'feminine' })).toBe('duzentas e vinte e duas');
  });

  it('spells the Latin ordinals up to 999', () => {
    const pt = (n: number) => numberToWords(n, 'ordinal', 'pt');
    expect(pt(1)).toBe('primeiro');
    expect(pt(11)).toBe('décimo primeiro');
    expect(pt(21)).toBe('vigésimo primeiro');
    expect(pt(121)).toBe('centésimo vigésimo primeiro');
    expect(numberToWords(21, 'ordinal', 'pt', { gender: 'feminine' })).toBe('vigésima primeira');
    expect(pt(1000)).toBe('1000');
  });
});

describe('Spanish feminine number words (#834)', () => {
  it('agrees the cardinal and the ordinal with a feminine noun', () => {
    const es = (n: number, kind: 'cardinal' | 'ordinal') => numberToWords(n, kind, 'es', { gender: 'feminine' });
    expect(es(1, 'cardinal')).toBe('una');
    expect(es(21, 'cardinal')).toBe('veintiuna');
    expect(es(31, 'cardinal')).toBe('treinta y una');
    expect(es(500, 'cardinal')).toBe('quinientas');
    expect(es(21_000, 'cardinal')).toBe('veintiuna mil');
    expect(es(1, 'ordinal')).toBe('primera');
    expect(es(21, 'ordinal')).toBe('vigesimoprimera');
    expect(es(34, 'ordinal')).toBe('trigésima cuarta');
    expect(numberToWords(1, 'ordinal', 'es')).toBe('primero');
  });
});

describe('spelled-out heading templates in French, Italian and German (#834)', () => {
  const blocks = parseMarkdown('# A\n\n# B\n\n# C');
  const prefixes = (template: string, locale: string) =>
    computeHeadingNumbering(blocks, { 1: template }, undefined, undefined, { locale }).prefixes;

  it('prints the words of the document language', () => {
    expect(prefixes('Chapitre {1:Words}', 'fr')).toEqual(['Chapitre Un', 'Chapitre Deux', 'Chapitre Trois']);
    expect(prefixes('Chapitre {1:ordinal}', 'fr')).toEqual(['Chapitre premier', 'Chapitre deuxième', 'Chapitre troisième']);
    expect(prefixes('{1:Ordinal-f} partie', 'fr')).toEqual(['Première partie', 'Deuxième partie', 'Troisième partie']);
    expect(prefixes('Capitolo {1:Words}', 'it')).toEqual(['Capitolo Uno', 'Capitolo Due', 'Capitolo Tre']);
    expect(prefixes('Capitolo {1:ordinal}', 'it')).toEqual(['Capitolo primo', 'Capitolo secondo', 'Capitolo terzo']);
    expect(prefixes('Parte {1:ordinal-feminine}', 'it')).toEqual(['Parte prima', 'Parte seconda', 'Parte terza']);
    expect(prefixes('Kapitel {1:words}', 'de')).toEqual(['Kapitel eins', 'Kapitel zwei', 'Kapitel drei']);
    expect(prefixes('{1:Ordinal-neuter} Kapitel', 'de')).toEqual(['Erstes Kapitel', 'Zweites Kapitel', 'Drittes Kapitel']);
    expect(prefixes('{1:Ordinal-m} Teil', 'de')).toEqual(['Erster Teil', 'Zweiter Teil', 'Dritter Teil']);
    expect(prefixes('Das {1:ordinal} Kapitel', 'de')).toEqual(['Das erste Kapitel', 'Das zweite Kapitel', 'Das dritte Kapitel']);
    expect(prefixes('KAPITEL {1:WORDS}', 'de')).toEqual(['KAPITEL EINS', 'KAPITEL ZWEI', 'KAPITEL DREI']);
  });
});
