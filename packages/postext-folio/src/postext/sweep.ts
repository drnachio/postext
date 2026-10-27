// The pages a turn sweeps past, and the painting budget while leaves are in
// the air (#1276: split out of postext.ts).
import { BLOCK_PAGES } from '../pageFlip.js';

/** Pages a turn paints for its leaves, at most. */
const MAX_SWEEP = 160;

/** A run of turns, from the spread at rest to the book's next rest: where
 *  its leaves started and, when it opened with a block jump, the spread
 *  that block lands on. */
export interface SweepRun {
  from: number[];
  block: number[] | null;
}

/**
 * The pages a turn to `target` sweeps past, in the order its leaves lift,
 * and the run it belongs to. A turn set at rest (`run` null) more than
 * `BLOCK_PAGES` away goes over as one block, as the renderer turns it: it
 * keeps only the pages on show (the block's top face), the target's being
 * painted with it. A target set while leaves are in the air carries the
 * run on leaf by leaf (the renderer lifts a block only with no leaf in
 * the air), so every page from where the run started (or its block
 * lands) to the target is swept, a run of fast clicks included.
 */
export function sweepFor(run: SweepRun | null, settled: number[], target: number[], count: number): { run: SweepRun; pages: number[] } {
  if (!run) {
    const from = settled.length ? settled : [0];
    if (Math.abs((target[0] ?? 0) - (from[0] ?? 0)) > BLOCK_PAGES) return { run: { from, block: target }, pages: [...from] };
    run = { from, block: null };
  }
  const from = run.block ?? run.from;
  const lo = Math.max(0, Math.min(...from, ...target) - 1);
  const hi = Math.min(count - 1, Math.max(...from, ...target) + 1);
  const pages: number[] = [];
  for (let i = lo; i <= hi; i++) pages.push(i);
  if ((target[0] ?? 0) < (from[0] ?? 0)) pages.reverse();
  // The block's top face stays until it lands.
  const swept = run.block ? [...run.from, ...pages] : pages;
  return { run, pages: swept.slice(0, MAX_SWEEP) };
}
/** Painting time per frame while leaves are in the air. */
export const SWEEP_BUDGET_MS = 8;
