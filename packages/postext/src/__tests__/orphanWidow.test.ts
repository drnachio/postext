import { describe, it, expect } from 'vitest';
import {
  chooseParagraphSplit,
  DEFAULT_ORPHAN_PENALTY,
  DEFAULT_WIDOW_PENALTY,
  DEFAULT_SLACK_WEIGHT,
} from '../pipeline/orphanWidow';

const ON = {
  avoidOrphans: true,
  orphanMinLines: 2,
  orphanPenalty: DEFAULT_ORPHAN_PENALTY,
  avoidWidows: true,
  widowMinLines: 2,
  widowPenalty: DEFAULT_WIDOW_PENALTY,
  slackWeight: DEFAULT_SLACK_WEIGHT,
};
const OFF = {
  avoidOrphans: false,
  orphanMinLines: 2,
  orphanPenalty: DEFAULT_ORPHAN_PENALTY,
  avoidWidows: false,
  widowMinLines: 2,
  widowPenalty: DEFAULT_WIDOW_PENALTY,
  slackWeight: DEFAULT_SLACK_WEIGHT,
};

describe('chooseParagraphSplit', () => {
  it('places the whole paragraph when it fits entirely', () => {
    const { splitAt, demerit } = chooseParagraphSplit(5, 5, ON);
    expect(splitAt).toBe(5);
    expect(demerit).toBe(0);
  });

  it('splits greedily when no orphan/widow risk', () => {
    const { splitAt } = chooseParagraphSplit(10, 5, ON);
    expect(splitAt).toBe(5);
  });

  it('pulls one line back to avoid a 1-line orphan (tail=1)', () => {
    const { splitAt } = chooseParagraphSplit(10, 9, ON);
    expect(splitAt).toBe(8);
  });

  it('pushes whole paragraph to next column to avoid a widow (k=1)', () => {
    const { splitAt } = chooseParagraphSplit(3, 1, ON);
    expect(splitAt).toBe(0);
  });

  it('when both constraints are unsatisfiable, chooses the least-bad candidate (no crash)', () => {
    const { splitAt, demerit } = chooseParagraphSplit(3, 2, ON);
    expect(splitAt).toBe(0);
    expect(demerit).toBeLessThan(DEFAULT_WIDOW_PENALTY);
    expect(Number.isFinite(demerit)).toBe(true);
  });

  it('with toggles off, reproduces greedy behavior even when widow would occur', () => {
    const { splitAt, demerit } = chooseParagraphSplit(3, 1, OFF);
    expect(splitAt).toBe(1);
    expect(demerit).toBe(0);
  });

  it('with toggles off, greedy splits fully (no orphan penalty)', () => {
    const { splitAt, demerit } = chooseParagraphSplit(10, 9, OFF);
    expect(splitAt).toBe(9);
    expect(demerit).toBe(0);
  });

  it('respects higher orphanMinLines threshold', () => {
    const cfg = { ...ON, orphanMinLines: 3 };
    const { splitAt } = chooseParagraphSplit(10, 8, cfg);
    expect(splitAt).toBe(7);
  });

  it('respects higher widowMinLines threshold', () => {
    const cfg = { ...ON, widowMinLines: 3 };
    const { splitAt } = chooseParagraphSplit(10, 2, cfg);
    expect(splitAt).toBe(0);
  });

  it('returns splitAt=0 when there is no space remaining', () => {
    const { splitAt } = chooseParagraphSplit(5, 0, ON);
    expect(splitAt).toBe(0);
  });

  it('orphanPenalty=0 effectively disables the avoidance even if toggle is on', () => {
    // 10-line paragraph, 9 space. Defaults would pull to k=8 (tail=2) to avoid
    // orphan. With orphanPenalty=0, greedy k=9 (tail=1) wins (slack=0).
    const cfg = { ...ON, orphanPenalty: 0 };
    const { splitAt } = chooseParagraphSplit(10, 9, cfg);
    expect(splitAt).toBe(9);
  });

  it('widowPenalty=0 effectively disables widow avoidance', () => {
    // 3-line paragraph, 1 space. Default config pushes (k=0). With widowPenalty=0,
    // greedy k=1 wins (slack=0).
    const cfg = { ...ON, widowPenalty: 0 };
    const { splitAt } = chooseParagraphSplit(3, 1, cfg);
    expect(splitAt).toBe(1);
  });

  it('higher orphanPenalty overrides larger slack cost', () => {
    // 10-line paragraph, 9 space, orphan threshold 2. At penalty=DEFAULT=3000,
    // helper pulls to k=8. At penalty=100 (low), slack cost of k=8 (slack=1,
    // cost=10) vs penalty 100 — k=9 still has slack=0 and penalty=100; k=8
    // has slack=1 penalty=10 → k=8 still wins. So bump penalty search further.
    const low = chooseParagraphSplit(10, 9, { ...ON, orphanPenalty: 5 });
    expect(low.splitAt).toBe(9); // penalty too small, greedy wins
    const high = chooseParagraphSplit(10, 9, { ...ON, orphanPenalty: 3000 });
    expect(high.splitAt).toBe(8); // penalty strong enough to pull back
  });

  it('slackWeight=0 means no pressure to fill current column', () => {
    // 10-line paragraph, 5 space, no orphan/widow risk. With slackWeight=0,
    // pushing (k=0) has demerit 0, same as filling (k=5). Helper picks the
    // first-best — tie-breaking by iteration order (k=0 evaluated first).
    const cfg = { ...ON, slackWeight: 0 };
    const { splitAt, demerit } = chooseParagraphSplit(10, 5, cfg);
    expect(demerit).toBe(0);
    // With slackWeight=0, all non-penalized splits tie at 0 demerit. The helper
    // picks the first such k found (k=0 since we iterate 0..maxFit).
    expect(splitAt).toBe(0);
  });
});
