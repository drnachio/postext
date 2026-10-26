import { describe, expect, it } from 'vitest';
import { parseMarkdown } from '../../parse/index.js';
import { readExercises, readOperation } from '../../exercises/model.js';
import { gridBox } from '../../exercises/grids.js';
import { resolveExerciseStylesConfig } from '../../defaults/boxes/exercises.js';
import { collectContentWarnings } from '../../pipeline/contentWarnings.js';
import { seededRandom, shuffledOrder } from '../../exercises/shuffle.js';

const read = (md: string) => {
  const blocks = parseMarkdown(md);
  return { blocks, ...readExercises(blocks) };
};

describe('the exercise model (#1225)', () => {
  it('tells the kind from the content', () => {
    const kinds = [
      ':::exercise\nPick.\n\n- [ ] a\n- [x] b\n:::\n',
      ':::exercise\nJoin.\n\n- a -> b\n:::\n',
      ':::exercise\nFill [[in]].\n:::\n',
      ':::exercise\nWhy?\n:::\n',
    ].map((md) => read(md).exercises[0]!.kind);
    expect(kinds).toEqual(['choice', 'match', 'gaps', 'open']);
  });

  it('reads questions with stems, several right options and select', () => {
    const { exercises } = read(':::exercise{select=many}\nPick.\n\n1. Which?\n   - [x] a\n   - [ ] b\n2. And?\n   - [x] c\n   - [x] d\n:::\n');
    const ex = exercises[0]!;
    expect(ex.questions.map((q) => [q.stem !== undefined, q.options.map((o) => o.correct), q.multiple])).toEqual([
      [true, [true, false], true],
      [true, [true, true], true],
    ]);
  });

  it('reads pairs, distractors, categories, scrambles, entries and operations', () => {
    expect(read(':::exercise\nJoin.\n\n- Bee -> Hive\n- -> Cave\n- Bird → Nest\n:::\n').exercises[0]!.pairs.map((p) => [p.left.text, p.right.text]))
      .toEqual([['Bee', 'Hive'], ['', 'Cave'], ['Bird', 'Nest']]);
    expect(read(':::exercise{type=sort}\nSort.\n\n- Mammals: dog, whale\n- 鸟：鹰、企鹅\n:::\n').exercises[0]!.categories.map((c) => [c.name.text, c.items.map((i) => i.text)]))
      .toEqual([['Mammals', ['dog', 'whale']], ['鸟', ['鹰', '企鹅']]]);
    expect(read(':::exercise{type=scramble}\nOrder.\n\n- She / goes / home\n- I am here\n:::\n').exercises[0]!.sentences.map((s) => s.pieces.map((p) => p.text)))
      .toEqual([['She', 'goes', 'home'], ['I', 'am', 'here']]);
    expect(read(':::exercise{type=crossword}\nSolve.\n\n- SUN: Our star\n- ice cream: Cold\n:::\n').exercises[0]!.entries.map((e) => [e.word, e.clue?.text]))
      .toEqual([['SUN', 'Our star'], ['icecream', 'Cold']]);
    expect(readOperation('345 + 278', 0)).toMatchObject({ a: '345', b: '278', op: '+', result: '623' });
    expect(readOperation('865 ÷ 4', 0)).toMatchObject({ op: '÷', result: '216', remainder: '1' });
    expect(readOperation('٣٤ × ٢', 0)).toMatchObject({ a: '٣٤', result: '٦٨' });
    expect(readOperation('7 ÷ 0', 0)).toBeUndefined();
    // The sign prints as written: a German dot, a colon; ASCII stand-ins as signs.
    expect(readOperation('216 · 4', 0)).toMatchObject({ op: '×', sign: '·', result: '864' });
    expect(readOperation('864 : 4', 0)).toMatchObject({ op: '÷', sign: ':', result: '216' });
    expect(readOperation('12 * 3', 0)).toMatchObject({ op: '×', sign: '×' });
  });

  it('reports what it cannot read', () => {
    const { issues } = read(':::exercise{type=bogus}\nX.\n:::\n\n:::solution\nOut.\n:::\n\n:::exercise{type=match}\nJoin.\n\n- no arrow\n:::\n\n:::exercise\nPick.\n\n- [ ] a\n- [ ] b\n:::\n');
    expect(issues.map((i) => i.kind).sort()).toEqual(['exerciseNoAnswer', 'exerciseNoAnswer', 'exerciseUnknownType', 'exerciseUnreadItem', 'solutionOutside'].sort());
    const warnings = collectContentWarnings(':::exercise{type=crossword}\nX.\n\n- AAA\n- BBB\n:::\n');
    expect(warnings.map((w) => w.kind)).toContain('exerciseWordUnplaced');
  });
});

describe('the grids (#1228)', () => {
  const style = resolveExerciseStylesConfig(undefined, 'en')[0]!;
  const box = (md: string, seed = 1) => {
    const { blocks, exercises } = read(md);
    const ex = exercises[0]!;
    return gridBox({ kind: ex.kind as 'wordsearch', id: 'g', style, exercise: ex, blocks, seed, bodySizePt: 10, lineHeightPt: 12, measurePt: 400 });
  };

  it('places every word of a word search, the same way every time', () => {
    const md = ':::exercise{type=wordsearch}\nFind.\n\n- MERCURY\n- VENUS\n- EARTH\n- MARS\n:::\n';
    const a = box(md);
    expect(a.unplaced).toEqual([]);
    expect(a.slots!.map((s) => s.key)).toEqual(expect.arrayContaining(['w1', 'w2', 'w3', 'w4']));
    expect(box(md).slots).toEqual(a.slots);
    expect(box(md, 2).slots).not.toEqual(a.slots);
  });

  it('lays a crossword with every word crossing another and numbers its starts', () => {
    const b = box(':::exercise{type=crossword}\nSolve.\n\n- RAIZ: a\n- HOJA: b\n- FLOR: c\n- FRUTO: d\n- TALLO: e\n:::\n');
    expect(b.unplaced).toEqual([]);
    // The key in words, across then down: every entry once.
    const key = b.key!.join(' ');
    expect(key).toMatch(/^Across: .* Down: /);
    for (const w of ['RAIZ', 'HOJA', 'FLOR', 'FRUTO', 'TALLO']) expect(key.split(w).length).toBe(2);
    expect(b.slots!.every((s) => s.kind === 'cell' && s.accept![0]!.length === 1)).toBe(true);
  });

  it('never leaves a shuffle in the written order', () => {
    for (let n = 2; n < 8; n++) {
      for (let s = 0; s < 20; s++) {
        const order = shuffledOrder(n, seededRandom(s, n));
        expect(order.some((v, i) => v !== i)).toBe(true);
        expect([...order].sort((x, y) => x - y)).toEqual([...Array(n).keys()]);
      }
    }
  });
});
