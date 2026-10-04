/**
 * Core Knuth-Plass dynamic-programming breakpoint selection.
 */

import type { KPItem, KPOptions, KPPenalty } from './types';
import {
  BADNESS_CAP,
  COLUMN_END_HYPHEN_BADNESS,
  DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT,
  DEFAULT_FITNESS_CLASS_DEMERIT,
  KP_INFINITY,
  OVER_STRETCH_BADNESS,
  RAGGED_SPACE_RATIO,
  TRACKING_BADNESS,
} from './constants';

/** A line's adjustment ratio and the tracking it takes (see
 *  {@link adjustLine}). */
export interface LineAdjustment {
  /** Adjustment ratio of the word spaces once tracking has taken its part. */
  r: number;
  /** Tracking the line takes, px after every character; negative tightens. */
  tracking: number;
  /** Share of the line's tracking capacity it uses (0–1). */
  share: number;
}

/**
 * The adjustment ratio of a line whose content leaves `slack` px against
 * its measure (negative when it runs over), with `stretch` / `shrink` px of
 * word-space give. With `trackingPerChar` set and the line holding at least
 * one word space (`trackable`), the part of the adjustment beyond the
 * limits (a ratio above 1, or below -1) goes into tracking on its `chars`
 * characters, up to `trackingPerChar` each: a loose line's spaces come back
 * to the stretch limit, a tight one fits at the shrink limit. Shared by the
 * breaker and the line reconstruction, so both agree on every line.
 */
export function adjustLine(
  slack: number,
  stretch: number,
  shrink: number,
  chars: number,
  trackingPerChar: number,
  trackable: boolean,
): LineAdjustment {
  let r: number;
  if (slack >= 0) r = stretch > 0 ? slack / stretch : KP_INFINITY;
  else r = shrink > 0 ? slack / shrink : -KP_INFINITY;
  if (trackingPerChar <= 0 || !trackable || chars <= 0 || (r <= 1 && r >= -1)) return { r, tracking: 0, share: 0 };
  const capacity = trackingPerChar * chars;
  if (r > 1) {
    const excess = slack - stretch;
    const used = Math.min(excess, capacity);
    const left = excess - used;
    // Nothing left once the letters took their part: the spaces sit at their
    // limit (r = 1), even when they cannot stretch at all (maxWordSpacing 1).
    // A line of rigid spaces that fits exactly (0 over 0) needs no tracking.
    if (left <= 0) return used > 0 ? { r: 1, tracking: used / chars, share: used / capacity } : { r: 0, tracking: 0, share: 0 };
    return { r: stretch > 0 ? 1 + left / stretch : KP_INFINITY, tracking: used / chars, share: used / capacity };
  }
  const deficit = -slack - shrink;
  if (deficit > capacity) return { r, tracking: 0, share: 0 };
  return { r: -1, tracking: -deficit / chars, share: deficit / capacity };
}

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
  /** Accumulated characters, word spaces and untrackable boxes (tracking). */
  totalChars: number;
  totalSpaces: number;
  totalNoTracking: number;
  /** Accumulated demerits. */
  totalDemerits: number;
  /** Kept only for a negative `looseness` (0 otherwise): the widest word
   *  spacing, as a multiple of the normal space, of the chain's lines that
   *  stay justified (tracking taken), and how many of its lines stretch
   *  past `RAGGED_SPACE_RATIO` and so are set ragged. A shorter setting may
   *  not go past either (see `looseness`). A line with no word space (one
   *  word, a URL piece) is set at its natural width and counts in neither. */
  loosest: number;
  ragged: number;
  /** Word spaces (glue that is not the closing glue) and their natural
   *  width up to the start of the next line, for `loosest`. */
  totalWordSpaces: number;
  totalWordSpaceWidth: number;
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
    runtGraded = false,
  } = options;
  const trackingPerChar = options.trackingPerChar ?? 0;
  // A ragged setting: the right-hand glue every line gets (see
  // `KPOptions.raggedStretch`).
  const raggedStretch = options.raggedStretch !== undefined && options.raggedStretch > 0 ? options.raggedStretch : 0;
  const zone = options.hyphenationZone;
  const terminalBreakPosition = items.length - 1;
  // Merge nodes by fitness class alone once the line width is uniform: the
  // line count only matters for `lineWidth(line)` (and for a looseness
  // target, which needs every count kept apart). Lines that must not end on
  // a hyphen need their counts kept apart up to the last of them only:
  // past it no cost depends on the count, and merging is exact again.
  const avoidHyphenAt = options.avoidHyphenAtLines && options.avoidHyphenAtLines.length > 0
    ? new Set(options.avoidHyphenAtLines)
    : undefined;
  const lastAvoidedLine = avoidHyphenAt ? Math.max(...avoidHyphenAt) : 0;
  const fixedBreaks = options.fixedBreaks ?? [];
  const uniformFrom = (options.looseness ?? 0) !== 0 || options.lineWidthUniformFrom === undefined
    ? undefined
    : Math.max(options.lineWidthUniformFrom, lastAvoidedLine + 1, fixedBreaks.length + 1);

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
  // Tracking: characters, word spaces (the closing glue is none) and boxes
  // tracking may not reach, only kept when tracking is on.
  let sumChars = 0;
  let sumSpaces = 0;
  let sumNoTracking = 0;
  const sumCharsAt: number[] = [0];
  const sumSpacesAt: number[] = [0];
  const sumNoTrackingAt: number[] = [0];
  // A short looseness target weighs each line's word spacing (see
  // `ActiveNode.loosest`): word spaces and their natural width.
  // Ragged lines keep their word spaces: there is no word spacing to gate.
  const gateShort = (options.looseness ?? 0) < 0 && options.normalSpaceWidth > 0 && raggedStretch === 0;
  let sumWordSpaces = 0;
  let sumWordSpaceWidth = 0;
  const sumWordSpacesAt: number[] = [0];
  const sumWordSpaceWidthAt: number[] = [0];

  // For a zoned syllable (ragged hyphenation): the word space before its
  // word, where the line would end if the word went down whole, and the one
  // after it, where the word ends.
  const spaceBefore: number[] | undefined = zone !== undefined ? [] : undefined;
  const spaceAfter: number[] | undefined = zone !== undefined ? new Array<number>(items.length) : undefined;
  if (spaceAfter) {
    let next = items.length - 1;
    for (let k = items.length - 1; k >= 0; k--) {
      if (items[k]!.type === 'glue') next = k;
      spaceAfter[k] = next;
    }
  }
  let lastGlue = -1;
  for (let k = 0; k < items.length; k++) {
    const item = items[k]!;
    if (spaceBefore) {
      if (item.type === 'glue') lastGlue = k;
      spaceBefore.push(lastGlue);
    }
    if (item.type === 'box') {
      sumWidth += item.width;
      // An Arabic word's kashidas (absent on every other box).
      if (item.stretch !== undefined) sumStretch += item.stretch;
      if (trackingPerChar > 0) {
        sumChars += item.chars ?? 0;
        if (item.noTracking) sumNoTracking++;
      }
    } else if (item.type === 'glue') {
      sumWidth += item.width;
      sumStretch += item.stretch;
      sumShrink += item.shrink;
      if (trackingPerChar > 0 && item.sourceIndex >= 0) sumSpaces++;
      if (gateShort && item.sourceIndex >= 0) {
        sumWordSpaces++;
        sumWordSpaceWidth += item.width;
      }
    }
    sumWidthAt.push(sumWidth);
    sumStretchAt.push(sumStretch);
    sumShrinkAt.push(sumShrink);
    if (trackingPerChar > 0) {
      sumCharsAt.push(sumChars);
      sumSpacesAt.push(sumSpaces);
      sumNoTrackingAt.push(sumNoTracking);
    }
    if (gateShort) {
      sumWordSpacesAt.push(sumWordSpaces);
      sumWordSpaceWidthAt.push(sumWordSpaceWidth);
    }
  }

  // Seed active node list with a "start of paragraph" sentinel
  let activeNodes: ActiveNode[] = [{
    position: -1,
    line: 0,
    fitnessClass: 1,
    totalWidth: 0,
    totalStretch: 0,
    totalShrink: 0,
    totalChars: 0,
    totalSpaces: 0,
    totalNoTracking: 0,
    totalDemerits: 0,
    loosest: 0,
    ragged: 0,
    totalWordSpaces: 0,
    totalWordSpaceWidth: 0,
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
    // What the break adds at the start of the next line (a repeated hyphen).
    const postWidth = item.type === 'penalty' ? item.postWidth ?? 0 : 0;
    const postChars = item.type === 'penalty' ? item.postChars ?? 0 : 0;

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

      const lineStretch = sumStretchAt[i]! - a.totalStretch + raggedStretch;
      const lineShrink = sumShrinkAt[i]! - a.totalShrink;

      let r: number;
      if (slack >= 0) {
        r = lineStretch > 0 ? slack / lineStretch : KP_INFINITY;
      } else {
        r = lineShrink > 0 ? slack / lineShrink : -KP_INFINITY;
      }
      // Beyond the word-spacing limits, tracking (when on) takes its part.
      let trackingShare = 0;
      let trackedWidth = 0;
      if (trackingPerChar > 0 && (r > 1 || r < -1)) {
        const chars = sumCharsAt[i]! - a.totalChars + (item.type === 'penalty' ? item.chars ?? 0 : 0);
        const adjusted = adjustLine(
          slack,
          lineStretch,
          lineShrink,
          chars,
          trackingPerChar,
          sumSpacesAt[i]! - a.totalSpaces > 0 && sumNoTrackingAt[i]! - a.totalNoTracking === 0,
        );
        r = adjusted.r;
        trackingShare = adjusted.share;
        trackedWidth = adjusted.tracking * chars;
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

      // A line whose break is fixed ends there and nowhere else.
      if (a.line < fixedBreaks.length && i !== fixedBreaks[a.line]) {
        continue;
      }

      // Ragged hyphenation zone: a dictionary syllable only in a word that
      // does not fit the rest of the line, and only where the word, sent
      // down whole, would leave more than the zone empty (a word that opens
      // its line cannot go down).
      if (spaceBefore && spaceAfter && item.type === 'penalty' && item.zoned) {
        const available = lineWidth(a.line);
        if (sumWidthAt[spaceAfter[i]!]! - a.totalWidth <= available) continue;
        const g = spaceBefore[i]!;
        if (g > a.position && available - (sumWidthAt[g]! - a.totalWidth) <= zone!) continue;
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
      // Beyond the stretch limit: a soft preference must never buy this,
      // and the cost grows with the overshoot (× r²), so two lines a
      // little over the limit stay cheaper than one line far over it — a
      // flat cost made the count of loose lines matter more than how
      // loose they are, and bought a 3× line to keep a 2.2× one tight.
      const overStretch = r > 1 ? Math.max(OVER_STRETCH_BADNESS, 2 * runtPenalty) * r * r : 0;
      // Graded (opt-in): the penalty follows the shortfall, so a two-word
      // ending costs less than a one-word one and wins when a line above
      // can give a word up for it (EF-89).
      const runtCost = isRunt ? (runtGraded ? runtPenalty * (1 - contentWidth / runtMinWidth) : runtPenalty) : 0;
      // A hyphen ending a line that closes a column or a page (EF-86).
      const columnEndHyphen = isFlagged && avoidHyphenAt?.has(a.line + 1) ? COLUMN_END_HYPHEN_BADNESS : 0;
      const effectiveBadness = badness + overStretch + runtCost + columnEndHyphen
        + (trackingShare > 0 ? TRACKING_BADNESS * trackingShare * trackingShare : 0);

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

      // Word spacing of the line as the reconstruction sets it (what
      // `VDTLine.justifiedSpaceRatio` reports): its spaces' natural width
      // plus the slack the letters did not take, over the normal spaces.
      // The last line keeps its natural spacing (the closing glue takes the
      // slack) and counts in neither.
      let loosest = a.loosest;
      let ragged = a.ragged;
      if (gateShort && slack > 0 && i !== terminalBreakPosition) {
        const wordSpaces = sumWordSpacesAt[i]! - a.totalWordSpaces;
        if (wordSpaces > 0) {
          const spacing = (sumWordSpaceWidthAt[i]! - a.totalWordSpaceWidth + slack - trackedWidth)
            / (wordSpaces * options.normalSpaceWidth);
          if (spacing > RAGGED_SPACE_RATIO) ragged++;
          else if (spacing > loosest) loosest = spacing;
        }
      }

      // Keys of merged nodes (fc alone, 0–3) never collide with the
      // per-line keys, which start at 4.
      const key = uniformFrom !== undefined && a.line + 1 >= uniformFrom ? fc : (a.line + 1) * 4 + fc;
      const existing = bestNewNodeByKey.get(key);
      if (existing && existing.totalDemerits <= totalDemerits) {
        continue;
      }

      // Cumulative totals at the START of the next line. The next line begins
      // at item i+1, so sumWidthAt[i + 1] is correct for both break kinds: it
      // includes a broken-at glue (consumed, excluded by the subtraction
      // above) and adds nothing for a penalty. What a penalty adds at the
      // start of the next line (`postWidth`) is taken off, so that line
      // counts it.
      bestNewNodeByKey.set(key, {
        position: i,
        line: a.line + 1,
        fitnessClass: fc,
        totalWidth: sumWidthAt[i + 1]! - postWidth,
        totalStretch: sumStretchAt[i + 1]!,
        totalShrink: sumShrinkAt[i + 1]!,
        totalChars: trackingPerChar > 0 ? sumCharsAt[i + 1]! - postChars : 0,
        totalSpaces: trackingPerChar > 0 ? sumSpacesAt[i + 1]! : 0,
        totalNoTracking: trackingPerChar > 0 ? sumNoTrackingAt[i + 1]! : 0,
        totalDemerits,
        loosest,
        ragged,
        totalWordSpaces: gateShort ? sumWordSpacesAt[i + 1]! : 0,
        totalWordSpaceWidth: gateShort ? sumWordSpaceWidthAt[i + 1]! : 0,
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
        totalWidth: sumWidthAt[i + 1]! - postWidth,
        totalStretch: sumStretchAt[i + 1]!,
        totalShrink: sumShrinkAt[i + 1]!,
        totalChars: trackingPerChar > 0 ? sumCharsAt[i + 1]! - postChars : 0,
        totalSpaces: trackingPerChar > 0 ? sumSpacesAt[i + 1]! : 0,
        totalNoTracking: trackingPerChar > 0 ? sumNoTrackingAt[i + 1]! : 0,
        totalDemerits: 0,
        loosest: 0,
        ragged: 0,
        totalWordSpaces: gateShort ? sumWordSpacesAt[i + 1]! : 0,
        totalWordSpaceWidth: gateShort ? sumWordSpaceWidthAt[i + 1]! : 0,
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
  // lowest-demerit sequence with exactly (natural + looseness) lines — one
  // line long, to fill a short column, or one line short, to pull up a runt
  // last line or take a line out of a column that runs over. The DP never
  // merges nodes with different line counts, so when such a sequence is
  // feasible a final node for it exists here. A long sequence is gated on
  // chain quality so it never stretches a line beyond the user's limit. A
  // short one never shrinks a space past `minShrinkRatio` (such a break
  // never becomes a node), but it can stretch one: fitting the paragraph in
  // fewer lines may take a break sequence with a line far looser than any
  // the natural one sets. It is gated too (EF-65): none of its lines that
  // stay justified may be looser than `maxStretchRatio` or than the natural
  // sequence's loosest such line, whichever is looser, and it may not have
  // more lines past `RAGGED_SPACE_RATIO` (set ragged) than the natural one.
  // A line the natural sequence sets ragged does not raise the bar. When
  // nothing matches, the natural solution stands.
  const looseness = options.looseness ?? 0;
  if (looseness !== 0 && best) {
    const targetLine = best.line + looseness;
    const loosestAllowed = Math.max(options.maxStretchRatio, best.loosest) + 1e-9;
    let alternative: ActiveNode | null = null;
    for (const a of activeNodes) {
      if (a.position !== lastBreakPosition || a.line !== targetLine) continue;
      if (looseness > 0 && !chainWithinStretchLimit(a)) continue;
      if (gateShort && (a.loosest > loosestAllowed || a.ragged > best.ragged)) continue;
      if (alternative === null || a.totalDemerits < alternative.totalDemerits) alternative = a;
    }
    if (alternative) best = alternative;
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
