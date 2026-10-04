import { describe, it, expect } from 'vitest';
import { compileKashidaPatterns, findKashidaPoints, kashidaPatternSet, KashidaPatternError, type KashidaPatternSetName } from '../measure/kashidaPatterns';

// #375: the port of raqim-kashida (aliftype, MIT). The vectors are raqim's
// own (src/tests.rs at e217f98c): [grapheme index, priority] pairs.

const points = (word: string, text: string) => findKashidaPoints(word, compileKashidaPatterns(text)).map((p) => [p.index, p.priority]);
const builtin = (name: KashidaPatternSetName, word: string) => findKashidaPoints(word, kashidaPatternSet(name)).map((p) => [p.index, p.priority]);
const errorOf = (text: string): string => {
  try {
    compileKashidaPatterns(text);
  } catch (e) {
    return (e as Error).message;
  }
  throw new Error(`"${text}" compiled`);
};

describe('kashida pattern language', () => {
  it('letters match only themselves; the last rule wins; 0 is a candidate', () => {
    expect(points('بت', 'ب2ت')).toEqual([[0, 2]]);
    expect(points('نت', 'ب2ت')).toEqual([]);
    expect(points('بت', 'ب2ت\nب5ت')).toEqual([[0, 5]]);
    expect(points('بت', 'ب5ت\nب2ت')).toEqual([[0, 2]]);
    expect(points('بت', 'بت')).toEqual([]);
    expect(points('بت', 'ب0ت')).toEqual([[0, 0]]);
    expect(points('بت', 'ب9ت\nب!ت')).toEqual([]);
    expect(points('بت', 'ب!ت\nب9ت')).toEqual([[0, 9]]);
    expect(points('بتم', 'ب3ت\nت5م\nب1ت')).toEqual([[0, 1], [1, 5]]);
  });

  it('length guards and the priority ladder', () => {
    expect(points('بتر', '[3]ب2ت')).toEqual([[0, 2]]);
    expect(points('بتر', '[4]ب2ت')).toEqual([]);
    expect(points('بتر', '[2:3]ب2ت')).toEqual([[0, 2]]);
    expect(points('بتبت', '[2:3]ب2ت')).toEqual([]);
    expect(points('بت', '[3:]ب2ت')).toEqual([]);
    const steps = (w: string) => points(w, '[4:] ب 6\\3 ت');
    expect(steps('بتنن')).toEqual([[0, 6]]);
    expect(steps('بتننن')).toEqual([[0, 5]]);
    expect(steps('بتنننننن')).toEqual([[0, 3]]);
    const open = (w: string) => points(w, '[:4:] ب 6\\3 ت');
    expect(open('بت')).toEqual([[0, 4]]);
    expect(open('بتنن')).toEqual([[0, 6]]);
    expect(open('بتننننن')).toEqual([[0, 3]]);
    expect(points('بت', '[:6:]ب3\\2ت')).toEqual([[0, 2]]);
  });

  it('groups fold positionally; = and ^ do not', () => {
    expect(points('نت', '@Beh 5 ت')).toEqual([[0, 5]]);
    expect(points('يت', '@Beh 5 ت')).toEqual([[0, 5]]);
    expect(points('بنت', '@Beh 5 ت')).toEqual([[1, 5]]);
    expect(points('تب', 'ت 5 @Beh .')).toEqual([[0, 5]]);
    expect(points('تن', 'ت 5 @Beh .')).toEqual([]);
    expect(points('نت', '=Beh 5 ت')).toEqual([]);
    expect(points('نت', '^=Beh 5 ت')).toEqual([[0, 5]]);
    expect(points('صت', '^{@Beh @Seen} 5 ت')).toEqual([[0, 5]]);
    expect(points('بت', '^{@Beh @Seen} 5 ت')).toEqual([]);
    expect(points('ست', '{@Seen ب} 5 ت')).toEqual([[0, 5]]);
    expect(points('بـت', '{@Tatweel} 9')).toEqual([[1, 9]]);
    expect(points('بتت', '@Behت 2 ت')).toEqual([[1, 2]]);
  });

  it('ZWJ and ZWNJ change the joins', () => {
    expect(points('ب‌ت', 'ب2ت')).toEqual([]);
    expect(points('د‍ب', 'د2ب')).toEqual([]);
    expect(points('ب‍ت', 'ب2ت')).toEqual([[0, 2]]);
    expect(points('ب‍‌ت', 'ب2ت')).toEqual([]);
    expect(points('سف', '8 ف .')).toEqual([[0, 8]]);
    expect(points('سف‍', '8 ف .')).toEqual([]);
  });

  it('rejects malformed lines with the line number', () => {
    expect(errorOf('[3ب2ت')).toContain('Unterminated length guard');
    expect(errorOf('[:3]ب2ت')).toContain('Invalid length guard');
    expect(errorOf('[1]ب2ت')).toContain('Invalid length guard');
    expect(errorOf('[3:2]ب2ت')).toContain('Invalid length guard');
    expect(errorOf('@')).toContain('Empty group name');
    expect(errorOf('ب.ت')).toContain('Token after a trailing');
    expect(errorOf('5')).toContain('Pattern has no letters');
    expect(errorOf('@Nope 2 ت')).toContain('Unknown Unicode Joining_Group');
    expect(errorOf('ب3\\6ت')).toContain('must not increase');
    expect(errorOf('ب9\\خت')).toContain('Expected a digit after');
    expect(errorOf('ب\\3ت')).toContain('must follow a priority digit');
    expect(errorOf('{@Beh Noon} 2 ت')).toContain('Stray character');
    expect(errorOf('ب٢ت')).toContain('Stray character');
    expect(errorOf('{@Beh 2 ت')).toContain('Unterminated “{”');
    expect(errorOf('{} 2 ت')).toContain('Empty “{}”');
    expect(errorOf('ب 2 ^ت')).toContain('must be followed by');
    expect(errorOf('ب2 3ت')).toContain('Conflicting weights');
    expect(errorOf('ب 5 .')).toContain('Weight outside the run');
    expect(errorOf('use nope')).toContain('Unknown pattern set');
    expect(() => compileKashidaPatterns('# fine\n\nب2ت\n@Nope 1 ت')).toThrow(KashidaPatternError);
    expect(errorOf('# fine\n\nب2ت\n@Nope 1 ت')).toContain('(line 4)');
  });
});

describe('built-in kashida sets', () => {
  it('naskh: the matrix, the heh ending, Afifi’s prohibitions', () => {
    const p = (w: string) => builtin('naskh', w);
    expect(p('بط')).toEqual([[0, 7]]);
    expect(p('مبط')).toEqual([[1, 8]]);
    expect(p('ممبط')).toEqual([[0, 3], [2, 9]]);
    expect(p('مممبط')).toEqual([[0, 2], [1, 2], [3, 8]]);
    expect(p('ممبم')).toEqual([[0, 3], [2, 6]]);
    expect(p('بب')).toEqual([]);
    expect(p('ببب')).toEqual([[0, 2]]);
    expect(p('ببر')).toEqual([[0, 6], [1, 2]]);
    expect(p('ببم')).toEqual([[1, 5]]);
    expect(p('تبين')).toEqual([[2, 6]]);
    expect(p('مببب')).toEqual([]);
    expect(p('بحه')).toEqual([[1, 9]]);
    expect(p('مسعد')).toEqual([[2, 3]]);
    expect(p('كلمة')).toEqual([[2, 9]]);
    expect(p('سعي')).toEqual([]);
    expect(p('به')).toEqual([[0, 9]]);
    expect(p('لا')).toEqual([]);
    expect(p('يهتم')).toEqual([[0, 6], [1, 6], [2, 6]]);
  });

  it('naskh: seat tatweels are transparent and points follow the marks', () => {
    for (const [word, seated] of [
      ['ٱلرَّحۡمَـٰنِ', [[3, 2], [5, 2]]],
      ['ٱلۡعَـٰلَمِینَ', [[3, 1], [6, 4]]],
      ['ٱلصَّـٰلِحَـٰتِ', [[3, 5]]],
    ] as const) {
      expect(builtin('naskh', word)).toEqual(seated);
    }
    // The offset is after the whole cluster: ح with its sukun.
    const [first] = findKashidaPoints('ٱلرَّحۡمَـٰنِ', kashidaPatternSet('naskh'));
    expect('ٱلرَّحۡمَـٰنِ'.slice(0, first!.offset)).toBe('ٱلرَّحۡ');
  });

  it('simple and nastaliq', () => {
    expect(builtin('simple', 'سبت')).toEqual([[0, 8], [1, 3]]);
    expect(builtin('simple', 'بيبت')).toEqual([[2, 3]]);
    expect(builtin('simple', 'بني')).toEqual([[0, 5], [1, 3]]);
    expect(builtin('simple', 'لا')).toEqual([]);
    expect(builtin('simple', 'لب')).toEqual([[0, 3]]);
    expect(builtin('simple', 'بـت').some(([i, p]) => i === 1 && p === 9)).toBe(true);
    expect(builtin('nastaliq', 'يهتم')).toEqual([[1, 6], [2, 6]]);
    expect(builtin('nastaliq', 'سقتم')).toEqual([[2, 6]]);
    expect(builtin('nastaliq', 'متهم')).toEqual([]);
    expect(builtin('nastaliq', 'بحه')).toEqual([[1, 5]]);
  });

  it('no points in Latin, digits or a lone letter', () => {
    const naskh = kashidaPatternSet('naskh');
    expect(findKashidaPoints('word', naskh)).toEqual([]);
    expect(findKashidaPoints('١٤٤٥', naskh)).toEqual([]);
    expect(findKashidaPoints('و', naskh)).toEqual([]);
  });
});
