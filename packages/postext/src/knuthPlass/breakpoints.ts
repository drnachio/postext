/**
 * Core Knuth-Plass dynamic-programming breakpoint selection.
 */

import type { KPItem, KPOptions, KPPenalty } from './types';
import {
  BADNESS_CAP,
  DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT,
  DEFAULT_FITNESS_CLASS_DEMERIT,
  KP_INFINITY,
} from './constants';

// ---------------------------------------------------------------------------
// Active-node structure for the DP
// ---------------------------------------------------------------------------

interface ActiveNode {
  /** Index in the KPItem array where this breakpoint occurs (-1 = paragraph start). */
  position: number;
  /** Line number that starts AFTER this break (0 = paragraph start). */
  line: number;
  /** Fitness class of the line ending at this break (0-3). */
  fitnessClass: number;
  /** Accumulated width from paragraph start to just after this break. */
  totalWidth: number;
  /** Accumulated stretch capacity. */
  totalStretch: number;
  /** Accumulated shrink capacity. */
  totalShrink: number;
  /** Accumulated demerits. */
  totalDemerits: number;
  /** Pointer for traceback. */
  previous: ActiveNode | null;
}

function classifyFitness(r: number): number {
  if (r < -0.5) return 0; // tight
  if (r < 0.5) return 1;  // normal
  if (r < 1.0) return 2;  // loose
  return 3;                // very loose
}

function computeBadness(r: number): number {
  const absR = Math.abs(r);
  const b = Math.round(100 * absR * absR * absR);
  return Math.min(b, BADNESS_CAP);
}

/** Quality gate for the looseness target: every line in the chain must stay
 *  within the stretch limit (fitness class ≤ 2, i.e. adjustment ratio < 1.0
 *  — word spacing strictly below `maxStretchRatio`). The paragraph's last
 *  line never trips this: its closing glue has near-infinite stretch, so its
 *  ratio is ≈ 0. */
function chainWithinStretchLimit(node: ActiveNode): boolean {
  for (let n: ActiveNode | null = node; n !== null && n.position >= 0; n = n.previous) {
    if (n.fitnessClass === 3) return false;
  }
  return true;
}

export function computeBreakpoints(items: KPItem[], options: KPOptions): number[] {
  const {
    lineWidth,
    consecutiveHyphenDemerit = DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT,
    fitnessClassDemerit = DEFAULT_FITNESS_CLASS_DEMERIT,
    runtPenalty = 0,
    runtMinWidth = 0,
  } = options;
  const terminalBreakPosition = items.length - 1;

  // Prefix sums over box/glue widths and glue stretch/shrink.
  // sumWidthAt has length items.length + 1: sumWidthAt[k] covers items 0..k-1,
  // so a penalty at position i (which adds no width) satisfies
  // sumWidthAt[i] === sumWidthAt[i + 1].
  let sumWidth = 0;
  let sumStretch = 0;
  let sumShrink = 0;
  const sumWidthAt: number[] = [0];
  const sumStretchAt: number[] = [0];
  const sumShrinkAt: number[] = [0];

  for (const item of items) {
    if (item.type === 'box') {
      sumWidth += item.width;
    } else if (item.type === 'glue') {
      sumWidth += item.width;
      sumStretch += item.stretch;
      sumShrink += item.shrink;
    }
    sumWidthAt.push(sumWidth);
    sumStretchAt.push(sumStretch);
    sumShrinkAt.push(sumShrink);
  }

  // Seed active node list with a "start of paragraph" sentinel
  let activeNodes: ActiveNode[] = [{
    position: -1,
    line: 0,
    fitnessClass: 1,
    totalWidth: 0,
    totalStretch: 0,
    totalShrink: 0,
    totalDemerits: 0,
    previous: null,
  }];

  // Candidate nodes for the current breakpoint, deduplicated on the fly by
  // (line, fitnessClass): only the lowest-demerit node per key survives.
  // Nodes at different breakpoint positions are never merged — every entry
  // here shares the current position `i`. Hoisted out of the loop and
  // cleared per breakpoint to avoid one Map allocation per legal break.
  const bestNewNodeByKey = new Map<number, ActiveNode>();

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;

    // Determine if this position is a legal breakpoint: glue preceded by a
    // box, or a penalty below infinity.
    let isLegalBreak = false;
    if (item.type === 'glue') {
      if (i > 0 && items[i - 1]!.type === 'box') {
        isLegalBreak = true;
      }
    } else if (item.type === 'penalty') {
      if (item.penalty < KP_INFINITY) {
        isLegalBreak = true;
      }
    }

    if (!isLegalBreak) continue;

    // A glue break excludes the glue itself from the line; a penalty break
    // adds the penalty's width (e.g. a discretionary hyphen).
    const breakWidth = item.type === 'penalty' ? item.width : 0;
    const isFlagged = item.type === 'penalty' && item.flagged;

    bestNewNodeByKey.clear();

    // Iterate the active set, compacting it in place: nodes whose line can
    // no longer shrink enough to fit (r < -1) are dropped permanently.
    let keepCount = 0;
    for (let ai = 0; ai < activeNodes.length; ai++) {
      const a = activeNodes[ai]!;

      // Line content from after a's break up to this break. a.totalWidth is
      // the prefix sum at the start of a's line, so the subtraction excludes
      // everything already consumed (including a broken-at glue).
      const contentWidth = sumWidthAt[i]! - a.totalWidth + breakWidth;
      const available = lineWidth(a.line);
      const slack = available - contentWidth;

      const lineStretch = sumStretchAt[i]! - a.totalStretch;
      const lineShrink = sumShrinkAt[i]! - a.totalShrink;

      let r: number;
      if (slack >= 0) {
        r = lineStretch > 0 ? slack / lineStretch : KP_INFINITY;
      } else {
        r = lineShrink > 0 ? slack / lineShrink : -KP_INFINITY;
      }

      // Too far behind: the line is overfull beyond shrinkability. Drop the
      // node (do not copy it into the surviving prefix).
      if (r < -1) {
        continue;
      }
      activeNodes[keepCount++] = a;

      // Infeasible — too few items to fill the line.
      if (r > KP_INFINITY) {
        continue;
      }

      const badness = computeBadness(r);
      const pen = item.type === 'penalty' ? item.penalty : 0;

      // Runt: when this break closes the paragraph with a too-short final
      // line, inject `runtPenalty` as equivalent badness — so it enters the
      // squared demerit formula alongside `badness`, on the same scale as
      // hyphen penalties. Applied linearly (old behavior) it was dwarfed by
      // badness² (up to 10001² ≈ 1e8) from any stretched alternative.
      const isRunt =
        runtPenalty > 0 &&
        i === terminalBreakPosition &&
        contentWidth > 0 &&
        contentWidth < runtMinWidth;
      const effectiveBadness = isRunt ? badness + runtPenalty : badness;

      let d: number;
      if (pen >= 0) {
        d = (1 + effectiveBadness + pen) * (1 + effectiveBadness + pen);
      } else if (pen > -KP_INFINITY) {
        d = (1 + effectiveBadness) * (1 + effectiveBadness) - pen * pen;
      } else {
        d = (1 + effectiveBadness) * (1 + effectiveBadness);
      }

      // Consecutive hyphen demerit
      const prevIsFlagged = a.position >= 0 &&
        items[a.position]!.type === 'penalty' &&
        (items[a.position]! as KPPenalty).flagged;
      if (isFlagged && prevIsFlagged) {
        d += consecutiveHyphenDemerit;
      }

      // Fitness class demerit
      const fc = classifyFitness(r);
      if (Math.abs(fc - a.fitnessClass) > 1) {
        d += fitnessClassDemerit;
      }

      const totalDemerits = a.totalDemerits + d;

      const key = (a.line + 1) * 4 + fc;
      const existing = bestNewNodeByKey.get(key);
      if (existing && existing.totalDemerits <= totalDemerits) {
        continue;
      }

      // Cumulative totals at the START of the next line. The next line begins
      // at item i+1, so sumWidthAt[i + 1] is correct for both break kinds: it
      // includes a broken-at glue (consumed, excluded by the subtraction
      // above) and adds nothing for a penalty.
      bestNewNodeByKey.set(key, {
        position: i,
        line: a.line + 1,
        fitnessClass: fc,
        totalWidth: sumWidthAt[i + 1]!,
        totalStretch: sumStretchAt[i + 1]!,
        totalShrink: sumShrinkAt[i + 1]!,
        totalDemerits,
        previous: a,
      });
    }
    activeNodes.length = keepCount;

    for (const node of bestNewNodeByKey.values()) {
      activeNodes.push(node);
    }

    // Forced breaks: when penalty = -INFINITY, remove all active nodes that
    // are NOT at this position. The break is mandatory — no line can skip it.
    if (item.type === 'penalty' && item.penalty <= -KP_INFINITY) {
      activeNodes = activeNodes.filter((a) => a.position === i);
    }

    // Emergency fallback: if active set is empty, force a break here
    if (activeNodes.length === 0) {
      activeNodes.push({
        position: i,
        line: 1, // We lost track — start fresh
        fitnessClass: 1,
        totalWidth: sumWidthAt[i + 1]!,
        totalStretch: sumStretchAt[i + 1]!,
        totalShrink: sumShrinkAt[i + 1]!,
        totalDemerits: 0,
        previous: null,
      });
    }
  }

  // Find best final node: only consider nodes at the last breakpoint position
  // (the forced penalty at the end of the paragraph).
  const lastBreakPosition = items.length - 1;
  let best: ActiveNode | null = null;
  for (const a of activeNodes) {
    if (a.position !== lastBreakPosition) continue;
    if (best === null || a.totalDemerits < best.totalDemerits) {
      best = a;
    }
  }

  // Looseness (TeX \looseness): among the surviving final nodes, prefer the
  // lowest-demerit sequence with exactly (natural + looseness) lines — used
  // by column balancing to run a paragraph one line long. The DP never
  // merges nodes with different line counts, so when such a sequence is
  // feasible a final node for it exists here. Gated on chain quality so the
  // loose solution never stretches any line beyond the user's limit; when no
  // acceptable node matches, the natural solution stands.
  const looseness = options.looseness ?? 0;
  if (looseness > 0 && best) {
    const targetLine = best.line + looseness;
    let loose: ActiveNode | null = null;
    for (const a of activeNodes) {
      if (a.position !== lastBreakPosition || a.line !== targetLine) continue;
      if (!chainWithinStretchLimit(a)) continue;
      if (loose === null || a.totalDemerits < loose.totalDemerits) loose = a;
    }
    if (loose) best = loose;
  }
  // Fallback: if no node reached the final position, take any node with the
  // highest position (nearest to the end).
  if (!best) {
    for (const a of activeNodes) {
      if (a.position < 0) continue;
      if (best === null || a.position > best.position ||
          (a.position === best.position && a.totalDemerits < best.totalDemerits)) {
        best = a;
      }
    }
  }

  if (!best) return [];

  // Traceback
  const breaks: number[] = [];
  let node: ActiveNode | null = best;
  while (node !== null && node.position >= 0) {
    breaks.push(node.position);
    node = node.previous;
  }
  breaks.reverse();
  return breaks;
}
