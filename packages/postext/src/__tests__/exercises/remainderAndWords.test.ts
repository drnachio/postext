import { describe, it, expect } from 'vitest';
import { parseMarkdown } from '../../parse/index.js';
import { readExercises } from '../../exercises/model.js';
import { gridBox } from '../../exercises/grids.js';
import { exerciseSettingsOf } from '../../defaults/boxes/exercises.js';
import type { DesignTextElement, PostextConfig } from '../../types.js';

// A bracket division's remainder (#1311).

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
