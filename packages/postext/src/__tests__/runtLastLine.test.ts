import { describe, it, expect } from 'vitest';
import { measureBlock } from '../measure/plain';
import { isRuntLastLine } from '../measure/runts';
import type { VDTLine } from '../vdt';

// Deterministic text measurement stub (no DOM in the node test env).
class StubCtx {
  font = '';
  measureText(s: string): { width: number } {
    return { width: s.length * 7 };
  }
}
(globalThis as unknown as { OffscreenCanvas: unknown }).OffscreenCanvas = class {
  getContext(): StubCtx {
    return new StubCtx();
  }
};

const line = (width: number, hyphenated = false): VDTLine => ({
  text: 'x', bbox: { x: 0, y: 0, width, height: 12 }, baseline: 10, hyphenated,
});

const OPTIONS = {
  textAlign: 'justify' as const,
  optimal: true,
  runtPenalty: 1000,
  runtMinCharacters: 20,
};

describe('runt last lines', () => {
  it('is a runt only when the paragraph ends short of the threshold', () => {
    // 20 characters at the stub's 7px each.
    expect(isRuntLastLine([line(300), line(60)], 140)).toBe(true);
    expect(isRuntLastLine([line(300), line(200)], 140)).toBe(false);
    // A single line has nothing above it to pull the words up from, and a
    // hyphenated line means the paragraph runs on.
    expect(isRuntLastLine([line(60)], 140)).toBe(false);
    expect(isRuntLastLine([line(300), line(60, true)], 140)).toBe(false);
    // Runt avoidance off (no threshold).
    expect(isRuntLastLine([line(300), line(60)], 0)).toBe(false);
  });

  it('is reported by the measurer when the penalty cannot avoid it', () => {
    // Two twenty-character words fill the 300px measure; the two-letter
    // tail has nowhere to go — pulling a word down with it would stretch
    // the first line past the limit, so no other break is feasible.
    const long = 'a'.repeat(20);
    const short = measureBlock(`${long} ${long} ay`, '12px serif', 300, 14, OPTIONS);
    expect(short.lines.length).toBe(2);
    expect(short.lastLineRunt).toBe(true);

    const even = measureBlock(`${long} ${long} ${long}`, '12px serif', 300, 14, OPTIONS);
    expect(even.lastLineRunt).toBeUndefined();
  });
});
