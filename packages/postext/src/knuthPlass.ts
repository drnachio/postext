/**
 * Knuth-Plass optimal paragraph line-breaking algorithm.
 *
 * Replaces the greedy first-fit line breaker with a dynamic-programming
 * approach that minimizes total demerits across all lines of a paragraph,
 * producing more even word-spacing and fewer "loose" lines.
 */

import type { PreparedTextWithSegments } from '@chenglou/pretext';
import type { VDTLine, VDTLineSegment } from './vdt';
import { createBoundingBox } from './vdt';
import type { TextAlign } from './types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const KP_INFINITY = 10000;
const HYPHEN_PENALTY = 50;
const DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT = 3000;
const DEFAULT_FITNESS_CLASS_DEMERIT = 100;
const BADNESS_CAP = 10000;
const MAX_STRETCH = Number.MAX_SAFE_INTEGER;

// ---------------------------------------------------------------------------
// Data model: Box / Glue / Penalty
// ---------------------------------------------------------------------------

export interface KPBox {
  type: 'box';
  width: number;
  sourceIndex: number;
  meta?: unknown;
}

export interface KPGlue {
  type: 'glue';
  width: number;
  stretch: number;
  shrink: number;
  sourceIndex: number;
  meta?: unknown;
}

export interface KPPenalty {
  type: 'penalty';
  width: number;
  penalty: number;
  flagged: boolean;
  sourceIndex: number;
  meta?: unknown;
}

export type KPItem = KPBox | KPGlue | KPPenalty;

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

export interface KPOptions {
  /** Available width for each line (varies with indent). */
  lineWidth: (lineIndex: number) => number;
  /** Normal space width for the font. */
  normalSpaceWidth: number;
  /** Max space stretch as multiplier of normalSpaceWidth (e.g. 1.5). */
  maxStretchRatio: number;
  /** Min space width as multiplier of normalSpaceWidth (e.g. 0.8). */
  minShrinkRatio: number;
  /** Penalty for two consecutive hyphenated lines. */
  consecutiveHyphenDemerit?: number;
  /** Penalty for adjacent lines of very different tightness. */
  fitnessClassDemerit?: number;
  /** Equivalent-badness added to the final line when it is shorter than
   *  `runtMinWidth` — enters the squared demerit formula on the same scale as
   *  `badness` (and hyphen penalties). 0 (default) disables runt avoidance.
   *  As a reference, `badness` saturates at 10000, so values ≳ 1000 will
   *  dominate most feasible layouts; values around 100–500 nudge. */
  runtPenalty?: number;
  /** Minimum content width (in px) the final line must have to avoid the runt
   *  penalty. Typically `runtMinCharacters * normalSpaceWidth`. */
  runtMinWidth?: number;
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
  /** Accumulated demerits. */
  totalDemerits: number;
  /** Pointer for traceback. */
  previous: ActiveNode | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Core DP: compute optimal breakpoints
// ---------------------------------------------------------------------------

export function computeBreakpoints(items: KPItem[], options: KPOptions): number[] {
  const {
    lineWidth,
    consecutiveHyphenDemerit = DEFAULT_CONSECUTIVE_HYPHEN_DEMERIT,
    fitnessClassDemerit = DEFAULT_FITNESS_CLASS_DEMERIT,
    runtPenalty = 0,
    runtMinWidth = 0,
  } = options;
  const terminalBreakPosition = items.length - 1;

  // Running totals up to current item
  let sumWidth = 0;
  let sumStretch = 0;
  let sumShrink = 0;

  // Prefix sums: sumWidthAt[i] = sum of widths of items 0..i-1
  // We build these incrementally and store for the range computations.
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
    // Penalties don't contribute to running width/stretch/shrink
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

  for (let i = 0; i < items.length; i++) {
    const item = items[i]!;

    // Determine if this position is a legal breakpoint
    let isLegalBreak = false;
    if (item.type === 'glue') {
      // Glue breaks if preceded by a box
      if (i > 0 && items[i - 1]!.type === 'box') {
        isLegalBreak = true;
      }
    } else if (item.type === 'penalty') {
      if (item.penalty < KP_INFINITY) {
        isLegalBreak = true;
      }
    }

    if (!isLegalBreak) continue;

    // Width contribution of breaking at this item
    const breakWidth = item.type === 'penalty' ? item.width : 0;
    const isFlagged = item.type === 'penalty' && item.flagged;

    // For glue breakpoints, the line content goes up to (but excluding) this glue.
    // For penalty breakpoints, the line content goes up to this penalty.
    // The content width from after active node a to break at i:
    //   If glue: sumWidthAt[i] - a.totalWidth  (excludes glue itself)
    //   If penalty: sumWidthAt[i] - a.totalWidth  (sumWidthAt doesn't include penalty width)
    // Plus breakWidth for penalties.

    // Compute the content width from the items between a.position and i.
    // After the break at active node a.position:
    //   - If a.position was a glue break, the next line starts at the item AFTER the glue
    //   - If a.position was a penalty break, the next line starts at the item AFTER the penalty
    //   - For the sentinel (-1), the line starts at item 0
    // Total width from start to just before item i (excluding this glue/penalty's own width):
    //   For a glue at i: line content = sumWidthAt[i] (which includes all box+glue widths before i)
    //     but we need to subtract the width of glues/boxes after the previous break.
    //     Actually sumWidthAt[i] already accounts for that.
    //   We subtract a.totalWidth which is sumWidthAt at the point right after a's break.

    const newNodes: ActiveNode[] = [];
    const toDeactivate = new Set<number>();

    for (let ai = 0; ai < activeNodes.length; ai++) {
      const a = activeNodes[ai]!;

      // Line content width: width of boxes and glues from after a's break to this break.
      // For glue break: content is items from (a.position+1) to (i-1) inclusive + breakWidth
      //   = sumWidthAt[i] - a.totalWidth
      // For penalty break: content is items from (a.position+1) to (i-1) inclusive + penalty.width
      //   = sumWidthAt[i] - a.totalWidth + breakWidth
      // Note: sumWidthAt[i] does NOT include item i if it's a penalty.
      // sumWidthAt[i] includes item i's width only for box/glue through the push.
      // Wait — re-examine: sumWidthAt[i] is the prefix sum BEFORE item i is processed.
      // Actually, sumWidthAt has length items.length + 1. sumWidthAt[0] = 0, sumWidthAt[k+1] includes item k.
      // So sumWidthAt[i] includes items 0..i-1, and sumWidthAt[i+1] includes items 0..i.

      // For a glue break at position i:
      //   The line goes from after a's break to just before this glue.
      //   Content width = sumWidthAt[i] - a.totalWidth
      //   (sumWidthAt[i] includes items 0..i-1, which covers everything up to but not including the glue)
      //
      // For a penalty break at position i:
      //   The line includes everything up to but not including the penalty, plus breakWidth
      //   Content width = sumWidthAt[i] - a.totalWidth + breakWidth

      const contentWidth = sumWidthAt[i]! - a.totalWidth + breakWidth;
      const available = lineWidth(a.line);
      const slack = available - contentWidth;

      // Stretch/shrink from the items on this line
      const lineStretch = sumStretchAt[i]! - a.totalStretch;
      const lineShrink = sumShrinkAt[i]! - a.totalShrink;

      let r: number;
      if (slack >= 0) {
        r = lineStretch > 0 ? slack / lineStretch : KP_INFINITY;
      } else {
        r = lineShrink > 0 ? slack / lineShrink : -KP_INFINITY;
      }

      // Deactivate nodes that are too far behind (line too wide, can't shrink enough)
      if (r < -1) {
        toDeactivate.add(ai);
        continue;
      }

      // Feasibility: don't allow extreme stretching
      // We allow r up to a generous threshold; the demerits will naturally penalize loose lines
      if (r > KP_INFINITY) {
        // Infeasible — too few items to fill the line
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

      // The total width/stretch/shrink after this break:
      // After a glue break: the glue is consumed. Next line starts at item i+1.
      //   totalWidth = sumWidthAt[i+1] (includes the glue's width — but we DON'T want it on the next line)
      //   Actually, for the "totalWidth" tracked in active nodes, it represents the cumulative
      //   width at the START of the next line. After a glue break at i, the next line starts at i+1.
      //   So totalWidth should be sumWidthAt[i+1], which includes the glue.
      //   When computing content width for the next line: sumWidthAt[j] - totalWidth
      //   This correctly excludes the consumed glue.
      //
      // After a penalty break: the penalty is not consumed as content on the next line.
      //   totalWidth = sumWidthAt[i+1] (which for penalties is same as sumWidthAt[i] since penalties
      //   don't add to sumWidth). Wait — let me re-check: penalties don't contribute to sumWidth,
      //   so sumWidthAt[i+1] == sumWidthAt[i] for a penalty at position i.
      //   But the next line starts at i+1. So totalWidth = sumWidthAt[i+1].

      const newTotalWidth = sumWidthAt[i + 1]!;
      const newTotalStretch = sumStretchAt[i + 1]!;
      const newTotalShrink = sumShrinkAt[i + 1]!;

      newNodes.push({
        position: i,
        line: a.line + 1,
        fitnessClass: fc,
        totalWidth: newTotalWidth,
        totalStretch: newTotalStretch,
        totalShrink: newTotalShrink,
        totalDemerits: totalDemerits,
        previous: a,
      });
    }

    // Remove deactivated nodes
    if (toDeactivate.size > 0) {
      activeNodes = activeNodes.filter((_, idx) => !toDeactivate.has(idx));
    }

    // Deduplicate new nodes by (line, fitnessClass): keep best demerits.
    // Different breakpoint positions must NOT be merged — only nodes at the
    // same position (which all newNodes share) can be compared.
    const deduped: ActiveNode[] = [];
    for (const node of newNodes) {
      const key = node.line * 4 + node.fitnessClass;
      let found = false;
      for (let di = 0; di < deduped.length; di++) {
        const existing = deduped[di]!;
        if (existing.line * 4 + existing.fitnessClass === key) {
          if (node.totalDemerits < existing.totalDemerits) {
            deduped[di] = node;
          }
          found = true;
          break;
        }
      }
      if (!found) {
        deduped.push(node);
      }
    }
    // Append all deduplicated nodes to the active set
    for (const node of deduped) {
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

// ---------------------------------------------------------------------------
// Adapter: pretext segments → KPItems
// ---------------------------------------------------------------------------

const SOFT_HYPHEN = '\u00AD';

export function pretextSegmentsToItems(
  prepared: PreparedTextWithSegments,
  normalSpaceWidth: number,
  maxStretchRatio: number,
  minShrinkRatio: number,
): KPItem[] {
  const items: KPItem[] = [];
  const segments = prepared.segments;
  const widths = (prepared as unknown as { widths: number[] }).widths;
  const kinds = (prepared as unknown as { kinds: string[] }).kinds;
  const discretionaryHyphenWidth =
    (prepared as unknown as { discretionaryHyphenWidth: number }).discretionaryHyphenWidth;

  const stretchPerSpace = normalSpaceWidth * (maxStretchRatio - 1);
  const shrinkPerSpace = normalSpaceWidth * (1 - minShrinkRatio);

  for (let i = 0; i < segments.length; i++) {
    const kind = kinds[i]!;
    const w = widths[i]!;

    switch (kind) {
      case 'text':
        items.push({ type: 'box', width: w, sourceIndex: i });
        break;
      case 'space':
      case 'glue':
        items.push({
          type: 'glue',
          width: w,
          stretch: stretchPerSpace,
          shrink: shrinkPerSpace,
          sourceIndex: i,
        });
        break;
      case 'soft-hyphen':
        items.push({
          type: 'penalty',
          width: discretionaryHyphenWidth,
          penalty: HYPHEN_PENALTY,
          flagged: true,
          sourceIndex: i,
        });
        break;
      case 'hard-break':
        items.push({
          type: 'penalty',
          width: 0,
          penalty: -KP_INFINITY,
          flagged: false,
          sourceIndex: i,
        });
        break;
      case 'zero-width-break':
        items.push({
          type: 'penalty',
          width: 0,
          penalty: 0,
          flagged: false,
          sourceIndex: i,
        });
        break;
      case 'preserved-space':
      case 'tab':
        items.push({ type: 'box', width: w, sourceIndex: i });
        break;
      default:
        items.push({ type: 'box', width: w, sourceIndex: i });
        break;
    }
  }

  // Final-line glue (infinite stretch) + forced break
  items.push({
    type: 'glue',
    width: 0,
    stretch: MAX_STRETCH,
    shrink: 0,
    sourceIndex: -1,
  });
  items.push({
    type: 'penalty',
    width: 0,
    penalty: -KP_INFINITY,
    flagged: false,
    sourceIndex: -1,
  });

  return items;
}

// ---------------------------------------------------------------------------
// Adapter: RichToken → KPItems
// ---------------------------------------------------------------------------

interface RichBreakPoint {
  charIndex: number;
  widthBefore: number;
}

interface RichToken {
  text: string;
  bold: boolean;
  italic: boolean;
  kind: 'text' | 'space';
  width: number;
  breakPoints?: RichBreakPoint[];
  hyphenWidth?: number;
  mathRender?: import('./math/types').MathRender;
}

export interface RichTokenMeta {
  bold: boolean;
  italic: boolean;
  originalTokenIndex: number;
  /** Character index within the original token where this sub-box starts. */
  subStart?: number;
  /** Character index within the original token where this sub-box ends. */
  subEnd?: number;
}

export function richTokensToItems(
  tokens: RichToken[],
  normalSpaceWidth: number,
  maxStretchRatio: number,
  minShrinkRatio: number,
): KPItem[] {
  const items: KPItem[] = [];
  const stretchPerSpace = normalSpaceWidth * (maxStretchRatio - 1);
  const shrinkPerSpace = normalSpaceWidth * (1 - minShrinkRatio);

  for (let t = 0; t < tokens.length; t++) {
    const token = tokens[t]!;
    const meta: RichTokenMeta = {
      bold: token.bold,
      italic: token.italic,
      originalTokenIndex: t,
    };

    if (token.kind === 'space') {
      items.push({
        type: 'glue',
        width: token.width,
        stretch: stretchPerSpace,
        shrink: shrinkPerSpace,
        sourceIndex: t,
        meta: { ...meta },
      });
      continue;
    }

    // Text token — may have soft-hyphen break points
    if (token.breakPoints && token.breakPoints.length > 0) {
      const hyphenW = token.hyphenWidth ?? 0;
      let prevCharIndex = 0;
      let prevWidth = 0;

      for (let bp = 0; bp < token.breakPoints.length; bp++) {
        const breakPoint = token.breakPoints[bp]!;
        const fragmentWidth = breakPoint.widthBefore - prevWidth;

        // Box for the fragment before this break point
        items.push({
          type: 'box',
          width: fragmentWidth,
          sourceIndex: t,
          meta: { ...meta, subStart: prevCharIndex, subEnd: breakPoint.charIndex },
        });

        // Penalty at the soft hyphen
        items.push({
          type: 'penalty',
          width: hyphenW,
          penalty: HYPHEN_PENALTY,
          flagged: true,
          sourceIndex: t,
          meta: { ...meta },
        });

        prevCharIndex = breakPoint.charIndex;
        prevWidth = breakPoint.widthBefore;
      }

      // Final fragment after last break point
      items.push({
        type: 'box',
        width: token.width - prevWidth,
        sourceIndex: t,
        meta: { ...meta, subStart: prevCharIndex, subEnd: token.text.length },
      });
    } else {
      // Simple text token without break points
      items.push({
        type: 'box',
        width: token.width,
        sourceIndex: t,
        meta: { ...meta, subStart: 0, subEnd: token.text.length },
      });
    }
  }

  // Final-line glue + forced break
  items.push({
    type: 'glue',
    width: 0,
    stretch: MAX_STRETCH,
    shrink: 0,
    sourceIndex: -1,
  });
  items.push({
    type: 'penalty',
    width: 0,
    penalty: -KP_INFINITY,
    flagged: false,
    sourceIndex: -1,
  });

  return items;
}

// ---------------------------------------------------------------------------
// Reconstruction: breakpoints → VDTLine[] (pretext path)
// ---------------------------------------------------------------------------

function cleanSoftHyphens(text: string): string {
  return text.replace(/\u00AD/g, '');
}

export function reconstructPretextLines(
  items: KPItem[],
  breaks: number[],
  prepared: PreparedTextWithSegments,
  lineHeightPx: number,
  lineWidthFn: (lineIndex: number) => number,
  lineIndentFn: (lineIndex: number) => number,
  normalSpaceWidth: number,
  textAlign: TextAlign,
): VDTLine[] {
  const segments = prepared.segments;
  const widths = (prepared as unknown as { widths: number[] }).widths;
  const discretionaryHyphenWidth =
    (prepared as unknown as { discretionaryHyphenWidth: number }).discretionaryHyphenWidth;

  const lines: VDTLine[] = [];
  let lineStart = 0; // item index where current line content starts

  for (let li = 0; li < breaks.length; li++) {
    const breakAt = breaks[li]!;
    const isLastLine = li === breaks.length - 1;
    const lineIndent = lineIndentFn(li);
    const lineMaxWidth = lineWidthFn(li);

    // Determine if this break is at a penalty (hyphenation)
    const breakItem = items[breakAt]!;
    const hyphenated = breakItem.type === 'penalty' && breakItem.flagged;

    // Collect segments for this line: items from lineStart to breakAt
    // For glue breaks: line content is items lineStart..breakAt-1 (exclude the breaking glue)
    // For penalty breaks: line content is items lineStart..breakAt-1 (exclude the penalty itself)
    const contentEnd = breakItem.type === 'glue' ? breakAt : breakAt;

    const lineSegments: VDTLineSegment[] = [];
    const textParts: string[] = [];

    for (let j = lineStart; j < contentEnd; j++) {
      const it = items[j]!;
      if (it.sourceIndex < 0) continue; // skip synthetic items

      if (it.type === 'box') {
        const seg = segments[it.sourceIndex]!;
        const w = widths[it.sourceIndex]!;
        if (seg === SOFT_HYPHEN) continue;
        const cleanText = cleanSoftHyphens(seg);
        lineSegments.push({ kind: 'text', text: cleanText, width: w });
        textParts.push(cleanText);
      } else if (it.type === 'glue') {
        const seg = segments[it.sourceIndex]!;
        const w = widths[it.sourceIndex]!;
        lineSegments.push({ kind: 'space', text: seg, width: w });
        textParts.push(seg);
      }
      // Penalties within the line are skipped (they're just potential break points)
    }

    // Trim trailing spaces
    while (lineSegments.length > 0 && lineSegments[lineSegments.length - 1]!.kind === 'space') {
      lineSegments.pop();
      textParts.pop();
    }

    // If hyphenated, append '-' to the last text segment
    if (hyphenated && lineSegments.length > 0) {
      const lastIdx = lineSegments.length - 1;
      const last = lineSegments[lastIdx]!;
      if (last.kind === 'text') {
        lineSegments[lastIdx] = {
          kind: 'text',
          text: last.text + '-',
          width: last.width + discretionaryHyphenWidth,
        };
        textParts[textParts.length - 1] = last.text + '-';
      }
    }

    const lineText = textParts.join('');
    const contentWidth = lineSegments.reduce((s, seg) => s + seg.width, 0);

    // Compute justifiedSpaceRatio
    let justifiedSpaceRatio: number | undefined;
    if (textAlign === 'justify' && !isLastLine && normalSpaceWidth > 0) {
      let wordWidth = 0;
      let spaceCount = 0;
      for (const seg of lineSegments) {
        if (seg.kind === 'space') spaceCount++;
        else wordWidth += seg.width;
      }
      if (spaceCount > 0) {
        const justifiedSpaceWidth = (lineMaxWidth - wordWidth) / spaceCount;
        justifiedSpaceRatio = justifiedSpaceWidth / normalSpaceWidth;
      }
    }

    lines.push({
      text: lineText,
      bbox: createBoundingBox(lineIndent, li * lineHeightPx, contentWidth, lineHeightPx),
      baseline: li * lineHeightPx + lineHeightPx * 0.8,
      hyphenated,
      segments: lineSegments,
      isLastLine,
      ...(justifiedSpaceRatio !== undefined ? { justifiedSpaceRatio } : {}),
    });

    // Next line starts after the break
    lineStart = breakAt + 1;
  }

  return lines;
}

// ---------------------------------------------------------------------------
// Reconstruction: breakpoints → VDTLine[] (rich text path)
// ---------------------------------------------------------------------------

export function reconstructRichLines(
  items: KPItem[],
  breaks: number[],
  tokens: RichToken[],
  lineHeightPx: number,
  lineWidthFn: (lineIndex: number) => number,
  lineIndentFn: (lineIndex: number) => number,
  normalSpaceWidth: number,
  textAlign: TextAlign,
): VDTLine[] {
  const lines: VDTLine[] = [];
  let lineStart = 0;

  for (let li = 0; li < breaks.length; li++) {
    const breakAt = breaks[li]!;
    const isLastLine = li === breaks.length - 1;
    const lineIndent = lineIndentFn(li);
    const lineMaxWidth = lineWidthFn(li);

    const breakItem = items[breakAt]!;
    const hyphenated = breakItem.type === 'penalty' && breakItem.flagged;

    const lineSegments: VDTLineSegment[] = [];
    const textParts: string[] = [];

    for (let j = lineStart; j < breakAt; j++) {
      const it = items[j]!;
      if (it.sourceIndex < 0) continue;
      const meta = it.meta as RichTokenMeta | undefined;

      if (it.type === 'box' && meta) {
        const token = tokens[meta.originalTokenIndex]!;
        const subText = meta.subStart !== undefined && meta.subEnd !== undefined
          ? token.text.slice(meta.subStart, meta.subEnd)
          : token.text;
        const cleanText = cleanSoftHyphens(subText);
        lineSegments.push({
          kind: token.mathRender ? 'math' : 'text',
          text: cleanText,
          width: it.width,
          bold: meta.bold || undefined,
          italic: meta.italic || undefined,
          ...(token.mathRender ? { mathRender: token.mathRender } : {}),
        });
        textParts.push(cleanText);
      } else if (it.type === 'glue' && meta) {
        const token = tokens[meta.originalTokenIndex]!;
        lineSegments.push({
          kind: 'space',
          text: token.text,
          width: it.width,
        });
        textParts.push(token.text);
      }
    }

    // Trim trailing spaces
    while (lineSegments.length > 0 && lineSegments[lineSegments.length - 1]!.kind === 'space') {
      lineSegments.pop();
      textParts.pop();
    }

    // If hyphenated, append '-' to the last text segment
    if (hyphenated && lineSegments.length > 0) {
      const breakMeta = breakItem.meta as RichTokenMeta | undefined;
      const hyphenW = breakMeta
        ? (tokens[breakMeta.originalTokenIndex]?.hyphenWidth ?? 0)
        : 0;
      const lastIdx = lineSegments.length - 1;
      const last = lineSegments[lastIdx]!;
      if (last.kind === 'text') {
        lineSegments[lastIdx] = {
          ...last,
          text: last.text + '-',
          width: last.width + hyphenW,
        };
        textParts[textParts.length - 1] = last.text + '-';
      }
    }

    const lineText = textParts.join('');
    const contentWidth = lineSegments.reduce((s, seg) => s + seg.width, 0);

    // Compute justifiedSpaceRatio
    let justifiedSpaceRatio: number | undefined;
    if (textAlign === 'justify' && !isLastLine && normalSpaceWidth > 0) {
      let wordWidth = 0;
      let spaceCount = 0;
      for (const seg of lineSegments) {
        if (seg.kind === 'space') spaceCount++;
        else wordWidth += seg.width;
      }
      if (spaceCount > 0) {
        const justifiedSpaceWidth = (lineMaxWidth - wordWidth) / spaceCount;
        justifiedSpaceRatio = justifiedSpaceWidth / normalSpaceWidth;
      }
    }

    lines.push({
      text: lineText,
      bbox: createBoundingBox(lineIndent, li * lineHeightPx, contentWidth, lineHeightPx),
      baseline: li * lineHeightPx + lineHeightPx * 0.8,
      hyphenated,
      segments: lineSegments,
      isLastLine,
      ...(justifiedSpaceRatio !== undefined ? { justifiedSpaceRatio } : {}),
    });

    lineStart = breakAt + 1;
  }

  return lines;
}
