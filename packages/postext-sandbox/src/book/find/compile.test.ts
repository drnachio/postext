import { describe, expect, it } from 'vitest';
import {
  DEFAULT_FIND_OPTIONS,
  compileFind,
  expandReplacement,
  foldText,
  matchSnippet,
  matchSnippets,
  patternAtoms,
  replaceChanges,
  type CompiledFind,
  type FindOptions,
} from './findReplace.js';
import { applyTextChanges, changesApply } from './textChanges.js';

function compiled(query: string, options: Partial<FindOptions> = {}): CompiledFind {
  const c = compileFind(query, { ...DEFAULT_FIND_OPTIONS, ...options });
  if (!c || 'error' in c) throw new Error('did not compile');
  return c;
}

const found = (text: string, query: string, options: Partial<FindOptions> = {}): string[] =>
  compiled(query, options).find(text).map((m) => text.slice(m.from, m.to));

describe('compileFind', () => {
  it('is null for an empty query and reports a regular expression that does not compile', () => {
    expect(compileFind('', DEFAULT_FIND_OPTIONS)).toBeNull();
    expect(compileFind('(', { ...DEFAULT_FIND_OPTIONS, regex: true })).toHaveProperty('error');
  });

  it('takes the query as plain text, case aside unless asked', () => {
    expect(found('Célula, célula y CÉLULA.', 'célula')).toEqual(['Célula', 'célula', 'CÉLULA']);
    expect(found('Célula, célula y CÉLULA.', 'célula', { matchCase: true })).toEqual(['célula']);
    expect(found('1+1 = 2 (a.b)', '(a.b)')).toEqual(['(a.b)']);
  });

  it('finds whole words only, accented letters counting as letters', () => {
    expect(found('para parada amparar para_', 'para', { wholeWord: true })).toEqual(['para']);
    expect(found('acción accióna', 'acción', { wholeWord: true })).toEqual(['acción']);
  });

  it('matches accented and plain letters when asked, keeping ñ apart', () => {
    expect(found('Célula y celula; CELULA', 'celula', { ignoreAccents: true })).toEqual(['Célula', 'celula', 'CELULA']);
    expect(found('año y ano', 'año', { ignoreAccents: true })).toEqual(['año']);
    expect(found('pingüino', 'pinguino', { ignoreAccents: true })).toEqual(['pingüino']);
    expect(found('Célula', 'celula', { ignoreAccents: true, matchCase: true })).toEqual([]);
    expect(found('célula celulares', 'celula', { ignoreAccents: true, wholeWord: true })).toEqual(['célula']);
    expect(found('がか', 'か', { ignoreAccents: true })).toEqual(['か']);
    expect(found('한국', '한', { ignoreAccents: true })).toEqual(['한']);
  });

  it('folds unit for unit, so offsets stay those of the text', () => {
    const text = 'Él dijo: «cómo»';
    expect(foldText(text, false)).toHaveLength(text.length);
    expect(foldText(text, false)).toBe('el dijo: «como»');
  });

  it('reads regular expressions with line anchors, groups and whole words', () => {
    const text = '- uno\n- dos\ntexto - no';
    expect(found(text, '^- (\\w+)', { regex: true })).toEqual(['- uno', '- dos']);
    expect(found('mg/dl y MG/DL', 'mg/dl', { regex: true })).toEqual(['mg/dl', 'MG/DL']);
    expect(found('cat catalog', 'cat\\w*', { regex: true, wholeWord: true })).toEqual(['cat', 'catalog']);
  });

  it('skips empty matches instead of looping on them', () => {
    expect(found('abc', 'x*', { regex: true })).toEqual([]);
  });
});

describe('replacements', () => {
  it('replaces plain text as it is, dollars included', () => {
    const text = 'a 10 b 10';
    const c = compiled('10');
    const changes = replaceChanges(text, c.find(text), '$1 €', c.regex);
    expect(applyTextChanges(text, changes)).toBe('a $1 € b $1 €');
  });

  it('expands groups, names, the whole match and escapes in regex mode', () => {
    const text = 'Smith, John';
    const c = compiled('(?<last>\\w+), (\\w+)', { regex: true });
    const [m] = c.find(text);
    expect(expandReplacement('$2 $<last>', m!, text, true)).toBe('John Smith');
    expect(expandReplacement('[$&] $$ \\n', m!, text, true)).toBe('[Smith, John] $ \n');
    expect(expandReplacement('$12', m!, text, true)).toBe('Smith2');
  });

  it('gives changes that carry the text they replace', () => {
    const text = 'uno dos uno';
    const c = compiled('uno');
    const changes = replaceChanges(text, c.find(text), 'tres', c.regex);
    expect(changes.map((ch) => ch.expect)).toEqual(['uno', 'uno']);
    expect(changesApply(text, changes)).toBe(true);
    expect(changesApply('uno dos dos', changes)).toBe(false);
    expect(applyTextChanges(text, changes)).toBe('tres dos tres');
  });
});

describe('regex replacements read piece by piece', () => {
  const replaced = (text: string, query: string, template: string, options: Partial<FindOptions> = {}): string => {
    const c = compiled(query, { regex: true, ...options });
    return applyTextChanges(text, replaceChanges(text, c.find(text), template, true));
  };

  it('splits a query into its top-level pieces', () => {
    expect(patternAtoms('\\d+\\.\\d{1,2}')).toEqual(['\\d+', '\\.', '\\d{1,2}']);
    expect(patternAtoms('[0-9]+(?:mg|g)?\\s')).toEqual(['[0-9]+', '(?:mg|g)?', '\\s']);
    expect(patternAtoms('\\p{L}+')).toEqual(['\\p{L}+']);
    expect(patternAtoms('a|b')).toBeNull();
    expect(patternAtoms('(a)\\1')).toBeNull();
  });

  it('keeps what the shared pieces matched and changes only the rest', () => {
    expect(replaced('1.7 y 23.45', '\\d\\.\\d', '\\d,\\d')).toBe('1,7 y 23,45');
    expect(replaced('12.5 mg y 0.25 g', '\\d+\\.\\d+', '\\d+,\\d+')).toBe('12,5 mg y 0,25 g');
    expect(replaced('5mg', '(\\d+) ?mg', '(\\d+) mg')).toBe('5 mg');
    expect(replaced('cita 3', 'cita (\\d)', '[(\\d)]')).toBe('[3]');
    expect(replaced('ver 3', 'ver (\\d)', '(véase $1)')).toBe('(véase 3)');
    expect(replaced('5mg y 7 mg', '\\d+ ?mg', '\\d+\u00a0mg')).toBe('5\u00a0mg y 7\u00a0mg');
    expect(replaced('a  b', 'a\\s+b', 'a b')).toBe('a b');
  });

  it('changes only the part that differs', () => {
    const text = 'pH 7.4';
    const c = compiled('\\d\\.\\d', { regex: true });
    expect(replaceChanges(text, c.find(text), '\\d,\\d', true)).toEqual([{ from: 4, to: 5, insert: ',', expect: '.' }]);
  });

  it('writes fixed characters as the replacement has them', () => {
    expect(replaced('POSTEXT y postext', 'postext', 'Postext')).toBe('Postext y Postext');
    expect(replaced('etc', 'etc', 'etc\\.')).toBe('etc.');
    expect(replaced('etc', 'etc', 'etc.')).toBe('etc.');
  });

  it('still reads groups, names and escapes', () => {
    expect(replaced('Smith, John', '(\\w+), (\\w+)', '$2 $1')).toBe('John Smith');
    expect(replaced('1.5', '(\\d)\\.(\\d)', '$1,$2')).toBe('1,5');
    expect(replaced('a-b', '-', '\\n')).toBe('a\nb');
    expect(replaced('aa b', '(a)\\1', 'x')).toBe('x b');
  });

  it('works with whole words and lookarounds', () => {
    expect(replaced('v1.2 y 3.4', '\\d\\.\\d', '\\d,\\d', { wholeWord: true })).toBe('v1.2 y 3,4');
    expect(replaced('1.5', '(?<=\\d)\\.(?=\\d)', ',')).toBe('1,5');
  });
});

describe('matchSnippet', () => {
  it('gives the line number and the words around the match', () => {
    const text = 'Primera línea.\nUna frase bastante larga que contiene la palabra buscada en medio de mucho texto alrededor.';
    const [m] = compiled('buscada').find(text);
    const s = matchSnippet(text, m!, 20);
    expect(s.line).toBe(2);
    expect(s.match).toBe('buscada');
    expect(s.before.startsWith('…')).toBe(true);
    expect(s.after.endsWith('…')).toBe(true);
    expect(`${s.before}${s.match}${s.after}`).not.toContain('\n');
  });

  it('counts lines in one pass for a list of matches', () => {
    const text = 'uno\ndos uno\n\ntres uno';
    const ms = compiled('uno').find(text);
    expect(matchSnippets(text, ms).map((s) => s.line)).toEqual([1, 2, 4]);
    expect(matchSnippets(text, ms).map((s) => s.line)).toEqual(ms.map((m) => matchSnippet(text, m).line));
    expect(matchSnippets(text, ms, 2)).toHaveLength(2);
  });
});
