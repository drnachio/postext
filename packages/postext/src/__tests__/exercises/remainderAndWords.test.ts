import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse/index.js';
import { readExercises } from '../../exercises/model.js';
import { gridBox } from '../../exercises/grids.js';
import { areaElements } from '../../exercises/designs.js';
import { exerciseSettingsOf } from '../../defaults/boxes/exercises.js';
import type { DesignTextElement, PostextConfig } from '../../types.js';

// A bracket division's remainder (#1311) and model answers on squared paper
// kept in words (#1312).

describe('a bracket long division with a remainder', () => {
  const lay = (md: string, extra: PostextConfig, teacher = false) => {
    const blocks = parseMarkdown(md);
    const ex = readExercises(blocks).exercises[0]!;
    const style = exerciseSettingsOf(extra, extra.locale).styles[0]!;
    return gridBox({ kind: 'arithmetic', id: 'g', style, exercise: ex, blocks, bodySizePt: 10, lineHeightPt: 12, measurePt: 400, ...(teacher ? { teacher: true } : {}) });
  };
  const md = ':::exercise{type=arithmetic}\nDivide.\n\n- 638 ÷ 3\n:::\n';
  const cfg: PostextConfig = { locale: 'en', exerciseStyles: [{ id: 'calc', arithmetic: { division: 'bracket' } }] };

  it('gives the remainder its cells after an `r`, past the quotient', () => {
    const box = lay(md, cfg);
    const cellOf = (key: string) => box.slots!.find((s) => s.key === key)!;
    expect(cellOf('a1_r0').accept).toEqual(['2']);
    const q = ['a1_0', 'a1_1', 'a1_2'].map((k) => cellOf(k));
    expect(q.map((s) => s.accept![0]).join('')).toBe('212');
    // On the quotient's row, a cell apart and after the `r`, as `inline`
    // sets its `R` (`212 r2`).
    expect(cellOf('a1_r0').cell).toEqual([q[2]!.cell![0], q[2]!.cell![1] + 3]);
    const texts = (box.design!.slot!.elements ?? []).filter((e): e is DesignTextElement => e.kind === 'text');
    expect(texts.map((t) => t.content)).toContain('r');
  });

  it('writes the remainder in the teacher\'s copy', () => {
    const texts = (lay(md, cfg, true).design!.slot!.elements ?? []).filter((e): e is DesignTextElement => e.kind === 'text');
    const top = Math.min(...texts.map((t) => (t.placement.offset!.y as { value: number }).value));
    const row = texts.filter((t) => (t.placement.offset!.y as { value: number }).value === top)
      .sort((a, b) => (a.placement.offset!.x as { value: number }).value - (b.placement.offset!.x as { value: number }).value);
    expect(row.map((t) => t.content).join('')).toBe('212r2');
  });

  it('keeps an exact division as it was', () => {
    const box = lay(':::exercise{type=arithmetic}\nDivide.\n\n- 864 ÷ 4\n:::\n', cfg);
    expect(box.slots!.some((s) => s.key.includes('_r'))).toBe(false);
    expect(box.info!.cols).toBe(5);
  });
});

describe('a model answer on squared paper', () => {
  const RED = { hex: '#c0392b', model: 'hex' as const };
  const rows = (kind: 'grid' | 'tianzige', answer: string, cols: number, cells?: number[]) => {
    const { elements } = areaElements({ kind, lines: 6, spacingPt: 10, widthPt: cols * 10, color: RED, weightPt: 0.5, answers: [answer], answerColor: RED, ...(cells ? { cells } : {}) });
    const out: string[] = [];
    for (const t of elements.filter((e): e is DesignTextElement => e.kind === 'text')) {
      const r = Math.round((t.placement.offset!.y as { value: number }).value / 10);
      const c = Math.round((t.placement.offset!.x as { value: number }).value / 10);
      out[r] = (out[r] ?? '').padEnd(c, ' ') + t.content;
    }
    return out;
  };

  it('starts a word that does not fit the rest of a row on the next', () => {
    const text = 'Four boxes cost £3.75 × 4 = £15. Your change is £20 − £15 = £5.';
    const got = rows('grid', text, 34);
    expect(got[0]).toBe('Four boxes cost £3.75 × 4 = £15.');
    expect(got[1]).toBe('Your change is £20 − £15 = £5.');
  });

  it('keeps a number with its unit joined by a no-break space', () => {
    const got = rows('grid', 'The change is 5 €.', 15);
    expect(got[0]).toBe('The change is');
    expect(got[1]).toBe('5 €.');
  });

  it('cuts a word longer than a row character by character', () => {
    expect(rows('grid', 'ab Donaudampfschiff', 6)).toEqual(['ab', 'Donaud', 'ampfsc', 'hiff']);
  });

  it('keeps the answer\'s lines a space apart', () => {
    expect(rows('grid', '', 10)).toEqual([]);
    const { elements } = areaElements({ kind: 'grid', lines: 3, spacingPt: 10, widthPt: 100, color: RED, weightPt: 0.5, answers: ['one', 'two'], answerColor: RED });
    const t = elements.filter((e): e is DesignTextElement => e.kind === 'text').find((e) => e.content === 't')!;
    expect((t.placement.offset!.x as { value: number }).value).toBe(40);
  });

  it('fills Chinese text a character to a square, on a grid and on 田字格', () => {
    const zh = '春天来了，小草绿了，花儿开了。';
    for (const kind of ['grid', 'tianzige'] as const) {
      expect(rows(kind, zh, 6)).toEqual(['春天来了，小', '草绿了，花儿', '开了。']);
    }
    // 田字格 keeps every character in order, spaces as empty squares.
    expect(rows('tianzige', 'ab cd', 4)).toEqual(['ab c', 'd']);
  });
});
