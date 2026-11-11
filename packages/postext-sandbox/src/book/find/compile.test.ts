import { describe, expect, it } from 'vitest';
import { DEFAULT_FIND_OPTIONS, compileFind, type CompiledFind, type FindOptions } from './compile.js';
import { expandReplacement, replaceChanges } from './replace.js';
import { matchSnippet, matchSnippets } from './snippet.js';
import { applyTextChanges, changesApply } from '../textChanges.js';

function compiled(query: string, options: Partial<FindOptions> = {}): CompiledFind {
  const c = compileFind(query, { ...DEFAULT_FIND_OPTIONS, ...options });
  if (!c || 'error' in c) throw new Error('did not compile');
  return c;
}

const matchesOf = (text: string, query: string, options: Partial<FindOptions> = {}) => compiled(query, options).find(text).matches;
const found = (text: string, query: string, options: Partial<FindOptions> = {}): string[] =>
  matchesOf(text, query, options).map((m) => text.slice(m.from, m.to));

describe('compileFind', () => {
  it('is null for an empty query and reports a regular expression that does not compile', () => {
    expect(compileFind('', DEFAULT_FIND_OPTIONS)).toBeNull();
    expect(compileFind('(', { ...DEFAULT_FIND_OPTIONS, regex: true })).toHaveProperty('error');
  });

  it('takes the query as plain text, case aside unless asked', () => {
    expect(found('Célula, célula y CÉLULA.', 'célula')).toEqual(['Célula', 'célula', 'CÉLULA']);
    expect(found('Célula, célula y CÉLULA.', 'célula', { matchCase: true })).toEqual(['célula']);
    expect(found('1+1 = 2 (a.b) $1 [^x]', '(a.b)')).toEqual(['(a.b)']);
    expect(found('1+1 = 2 (a.b) $1 [^x]', '[^x]')).toEqual(['[^x]']);
  });

  it('finds whole words only, accented letters counting as letters', () => {
    expect(found('para parada amparar para_', 'para', { wholeWord: true })).toEqual(['para']);
    expect(found('acción accióna', 'acción', { wholeWord: true })).toEqual(['acción']);
  });

  it('matches accented and plain letters when asked, keeping ñ, ç, й and ё apart', () => {
    expect(found('Célula y celula; CELULA', 'celula', { ignoreAccents: true })).toEqual(['Célula', 'celula', 'CELULA']);
    expect(found('año y ano', 'año', { ignoreAccents: true })).toEqual(['año']);
    expect(found('año y ano', 'ano', { ignoreAccents: true })).toEqual(['ano']);
    expect(found('caça casa', 'caca', { ignoreAccents: true })).toEqual([]);
    expect(found('йод иод', 'йод', { ignoreAccents: true })).toEqual(['йод']);
    expect(found('ёлка елка', 'елка', { ignoreAccents: true })).toEqual(['елка']);
    expect(found('pingüino', 'pinguino', { ignoreAccents: true })).toEqual(['pingüino']);
    expect(found('Célula', 'celula', { ignoreAccents: true, matchCase: true })).toEqual([]);
    expect(found('célula celulares', 'celula', { ignoreAccents: true, wholeWord: true })).toEqual(['célula']);
    expect(found('がか', 'か', { ignoreAccents: true })).toEqual(['か']);
    expect(found('한국', '한', { ignoreAccents: true })).toEqual(['한']);
  });

  it('reads text written decomposed (NFD) as its composed letters', () => {
    const nfd = 'Célula y mañana'; // Célula y mañana, decomposed
    expect(found(nfd, 'célula')).toEqual(['Célula']);
    expect(found(nfd, 'celula', { ignoreAccents: true })).toEqual(['Célula']);
    // Without folding accents, a plain e is not the start of an é.
    expect(found(nfd, 'ce')).toEqual([]);
    expect(found(nfd, 'mañana', { ignoreAccents: true })).toEqual(['mañana']);
    expect(found(nfd, 'manana', { ignoreAccents: true })).toEqual([]);
    // Offsets are those of the text as written.
    const [m] = matchesOf(nfd, 'celula', { ignoreAccents: true });
    expect(m).toEqual({ from: 0, to: 7 });
  });

  it('folds Arabic pointing away, hamza kept', () => {
    expect(found('كَتَبَ الكِتابَ', 'كتب', { ignoreAccents: true })).toEqual(['كَتَبَ']);
    expect(found('كَتَبَ', 'كتب')).toEqual([]);
    expect(found('أحمد احمد', 'احمد', { ignoreAccents: true })).toEqual(['احمد']);
  });

  it('reads whole words in Chinese and Japanese with the word segmenter', () => {
    // 中国人 is one word for the segmenter; 中国 alone is a word in 在中国。
    expect(found('我在中国。', '中国', { wholeWord: true })).toEqual(['中国']);
    expect(found('我们', '我', { wholeWord: true })).toEqual([]);
    expect(found('東京に行く', '東京', { wholeWord: true })).toEqual(['東京']);
    expect(found('東京都', '京', { wholeWord: true })).toEqual([]);
  });

  it('reads regular expressions with line anchors, groups and whole words', () => {
    const text = '- uno\n- dos\ntexto - no';
    expect(found(text, '^- (\\w+)', { regex: true })).toEqual(['- uno', '- dos']);
    expect(found('mg/dl y MG/DL', 'mg/dl', { regex: true })).toEqual(['mg/dl', 'MG/DL']);
    expect(found('cat catalog', 'cat\\w*', { regex: true, wholeWord: true })).toEqual(['cat', 'catalog']);
    expect(found('scat cat', 'cat', { regex: true, wholeWord: true })).toEqual(['cat']);
  });

  it('skips empty matches instead of looping on them', () => {
    expect(found('abc', 'x*', { regex: true })).toEqual([]);
  });

  it('stops at the match cap and at the deadline', () => {
    const text = 'a'.repeat(100);
    const capped = compiled('a').find(text, { limit: 10 });
    expect(capped.matches).toHaveLength(10);
    expect(capped.stopped).toBe('count');
    let t = 0;
    const timed = compiled('a', { regex: true }).find(text, { deadline: 5, now: () => t++ });
    expect(timed.stopped).toBe('time');
    expect(timed.matches.length).toBeLessThan(10);
  });
});

describe('replacements', () => {
  const replaced = (text: string, query: string, template: string, options: Partial<FindOptions> = {}): string => {
    const c = compiled(query, options);
    return applyTextChanges(text, replaceChanges(text, c.find(text).matches, template, c.regex));
  };

  it('replaces plain text as it is, dollars and backslashes included', () => {
    expect(replaced('a 10 b 10', '10', '$1 € \\n $&')).toBe('a $1 € \\n $& b $1 € \\n $&');
  });

  it('expands groups, names, the whole match and the three escapes in regex mode', () => {
    const text = 'Smith, John';
    const [m] = compiled('(?<last>\\w+), (\\w+)', { regex: true }).find(text).matches;
    expect(expandReplacement('$2 $<last>', m!, text, true)).toBe('John Smith');
    expect(expandReplacement('[$&] $$ \\n\\t\\\\', m!, text, true)).toBe('[Smith, John] $ \n\t\\');
    // `$12` is group 1 and a "2" when there is no group 12.
    expect(expandReplacement('$12', m!, text, true)).toBe('Smith2');
    // Anything else is literal.
    expect(expandReplacement('$0 $9 $<none> $x \\, \\d \\.', m!, text, true)).toBe('$0 $9  $x \\, \\d \\.');
  });

  it('writes the signs of the query literally', () => {
    // A note mark kept: `^`, `$` and `.` are not read back from the query.
    expect(replaced('Note 3 here', '^Note (\\d+)', '[^$1]', { regex: true })).toBe('[^3] here');
    expect(replaced('1.7 y 23.45', '(\\d)\\.(\\d)', '$1,$2', { regex: true })).toBe('1,7 y 23,45');
    expect(replaced('1.7', '\\d\\.\\d', '\\d,\\d', { regex: true })).toBe('\\d,\\d');
    expect(replaced('cita 3', 'cita (\\d)', '[($1)]', { regex: true })).toBe('[(3)]');
    expect(replaced('a.b', '\\.', '\\,', { regex: true })).toBe('a\\,b');
    expect(replaced('etc', 'etc', 'etc.', { regex: true })).toBe('etc.');
  });

  it('reads named groups and whole words', () => {
    expect(replaced('2026-11-10', '(?<y>\\d{4})-(?<m>\\d\\d)-(?<d>\\d\\d)', '$<d>/$<m>/$<y>', { regex: true })).toBe('10/11/2026');
    expect(replaced('v1.2 y 3.4', '(\\d)\\.(\\d)', '$1,$2', { regex: true, wholeWord: true })).toBe('v1.2 y 3,4');
    expect(replaced('1.5', '(?<=\\d)\\.(?=\\d)', ',', { regex: true })).toBe('1,5');
  });

  it('gives changes that carry the text they replace, narrowed to what differs', () => {
    const text = 'uno dos uno';
    const c = compiled('uno');
    const changes = replaceChanges(text, c.find(text).matches, 'tres', c.regex);
    expect(changes.map((ch) => ch.expect)).toEqual(['uno', 'uno']);
    expect(changesApply(text, changes)).toBe(true);
    expect(changesApply('uno dos dos', changes)).toBe(false);
    expect(applyTextChanges(text, changes)).toBe('tres dos tres');
    const ph = 'pH 7.4';
    const d = compiled('(\\d)\\.(\\d)', { regex: true });
    expect(replaceChanges(ph, d.find(ph).matches, '$1,$2', true)).toEqual([{ from: 4, to: 5, insert: ',', expect: '.' }]);
  });

  it('replaces in decomposed text and in Arabic', () => {
    expect(replaced('Célula', 'celula', 'Cell', { ignoreAccents: true })).toBe('Cell');
    expect(replaced('قالَ كَتَبَ', 'كتب', 'كتبَ', { ignoreAccents: true })).toBe('قالَ كتبَ');
  });
});

describe('matchSnippet', () => {
  it('gives the line number and the words around the match', () => {
    const text = 'Primera línea.\nUna frase bastante larga que contiene la palabra buscada en medio de mucho texto alrededor.';
    const [m] = matchesOf(text, 'buscada');
    const s = matchSnippet(text, m!, 20);
    expect(s.line).toBe(2);
    expect(s.match).toBe('buscada');
    expect(s.before.startsWith('…')).toBe(true);
    expect(s.after.endsWith('…')).toBe(true);
    expect(`${s.before}${s.match}${s.after}`).not.toContain('\n');
  });

  it('counts lines in one pass for a list of matches', () => {
    const text = 'uno\ndos uno\n\ntres uno';
    const ms = matchesOf(text, 'uno');
    expect(matchSnippets(text, ms).map((s) => s.line)).toEqual([1, 2, 4]);
    expect(matchSnippets(text, ms).map((s) => s.line)).toEqual(ms.map((m) => matchSnippet(text, m).line));
    expect(matchSnippets(text, ms, 2)).toHaveLength(2);
  });
});
