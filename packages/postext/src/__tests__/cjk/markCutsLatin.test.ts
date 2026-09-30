import { describe, it, expect, vi, beforeEach } from 'vitest';

// Spies on the per-character scan behind `markCuts`: painting a page of a
// Latin book goes through it once per painted segment, so text with no CJK
// must not reach it (#184, #185).
const scans = vi.hoisted(() => ({ breakingSpace: 0, markCuts: 0 }));
vi.mock('../../measure/spaces', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../measure/spaces')>();
  return {
    ...actual,
    isBreakingSpace: (ch: string | undefined) => {
      scans.breakingSpace++;
      return actual.isBreakingSpace(ch);
    },
  };
});
vi.mock('../../measure/cjkClasses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../../measure/cjkClasses')>();
  return {
    ...actual,
    cjkMarkCuts: (text: string, shared: boolean) => {
      scans.markCuts++;
      return actual.cjkMarkCuts(text, shared);
    },
  };
});

import { markCuts, markPieces } from '../../measure/markCuts';
import { isTrimmableMark } from '../../measure/cjkClasses';
import { hasCJK } from '../../measure/cjk';

const LATIN = [
  'En un lugar de la Mancha, de cuyo nombre no quiero acordarme, no ha mucho tiempo que vivía un hidalgo',
  '“end.”“Yes” — «así»·‘ya’… 37 °C, 225 000',
  'Stay hungry.”“Stay foolish.',
];

describe('markCuts on text with no CJK', () => {
  beforeEach(() => {
    scans.breakingSpace = 0;
    scans.markCuts = 0;
  });

  it('paints it whole without scanning it character by character', () => {
    for (const text of LATIN) {
      expect(markCuts(text, 'words')).toEqual([]);
      expect(markCuts(text, 'text')).toEqual([]);
      expect(markPieces(text, 'words')).toEqual([text]);
    }
    expect(scans.breakingSpace).toBe(0);
    expect(scans.markCuts).toBe(0);
  });

  it('still cuts a line that holds CJK text as before', () => {
    expect(markCuts('a 楼 “end.”“Yes” 本）》录', 'words')).toEqual([18]);
    expect(markCuts('他说：”“好', 'text')).toEqual([3, 4]);
    // The CJK composer cuts the shared marks with no Han character on the line.
    expect(markCuts('hungry.”“Stay', 'composed')).toEqual([8]);
    expect(scans.markCuts).toBeGreaterThan(0);
  });

  it('holds because every mark cut outside the shared ones is a CJK character', () => {
    // `'text'` and `'words'` count the shared marks (“ ” ‘ ’ ·) only in
    // text with CJK: any other mark they cut is itself CJK text, so a string
    // with no CJK never has a cut.
    const outside: string[] = [];
    for (let cp = 0; cp <= 0x10FFFF; cp++) {
      if (cp >= 0xD800 && cp <= 0xDFFF) continue;
      if (isTrimmableMark(cp, false) && !hasCJK(String.fromCodePoint(cp))) outside.push(cp.toString(16));
    }
    expect(outside).toEqual([]);
  });
});
