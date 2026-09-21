import { describe, it, expect } from 'vitest';
import { computeBreakpoints } from '../knuthPlass/breakpoints';
import { KP_INFINITY, MAX_STRETCH, HYPHEN_PENALTY } from '../knuthPlass/constants';
import type { KPItem, KPOptions } from '../knuthPlass/types';

/** Deterministic pseudo-random paragraphs: words of varying width, some
 *  with a discretionary hyphen, glue between them, the closing glue and
 *  forced break. */
function paragraph(seed: number, words: number): KPItem[] {
  let x = seed;
  const rnd = () => { x = (x * 1103515245 + 12345) & 0x7fffffff; return x / 0x7fffffff; };
  const items: KPItem[] = [];
  for (let w = 0; w < words; w++) {
    const width = 20 + Math.floor(rnd() * 60);
    if (rnd() < 0.3) {
      const head = Math.floor(width * (0.3 + rnd() * 0.4));
      items.push({ type: 'box', width: head, sourceIndex: w });
      items.push({ type: 'penalty', width: 6, penalty: HYPHEN_PENALTY, flagged: true, sourceIndex: w });
      items.push({ type: 'box', width: width - head, sourceIndex: w });
    } else {
      items.push({ type: 'box', width, sourceIndex: w });
    }
    if (w < words - 1) items.push({ type: 'glue', width: 8, stretch: 4, shrink: 2, sourceIndex: w });
  }
  items.push({ type: 'glue', width: 0, stretch: MAX_STRETCH, shrink: 0, sourceIndex: -1 });
  items.push({ type: 'penalty', width: 0, penalty: -KP_INFINITY, flagged: false, sourceIndex: -1 });
  return items;
}

const baseOptions = (indent: number, runt: boolean): KPOptions => ({
  lineWidth: (line) => (line === 0 ? 300 - indent : 300),
  normalSpaceWidth: 8,
  maxStretchRatio: 1.5,
  minShrinkRatio: 0.75,
  runtPenalty: runt ? 300 : 0,
  runtMinWidth: runt ? 40 : 0,
});

describe('computeBreakpoints with lineWidthUniformFrom', () => {
  it('chooses the same breaks as the unmerged search', () => {
    for (let seed = 1; seed <= 120; seed++) {
      const items = paragraph(seed, 12 + (seed % 90));
      const options = baseOptions(seed % 3 === 0 ? 0 : 24, seed % 2 === 0);
      const plain = computeBreakpoints(items, options);
      const merged = computeBreakpoints(items, { ...options, lineWidthUniformFrom: 1 });
      expect(merged).toEqual(plain);
    }
  });

  it('keeps every line count apart while a looseness target is set', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const items = paragraph(seed, 30 + seed);
      const options = { ...baseOptions(24, false), looseness: 1 };
      expect(computeBreakpoints(items, { ...options, lineWidthUniformFrom: 1 })).toEqual(computeBreakpoints(items, options));
    }
  });
});
