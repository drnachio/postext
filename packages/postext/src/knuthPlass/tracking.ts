/**
 * Justification tracking (`bodyText.maxJustifyTracking`, EF-65): the
 * tracking a line of a found break sequence takes, worked out again from
 * its items exactly as the breaker weighed it (see `adjustLine`), and spread
 * on the widths of its letters.
 */

import type { VDTLineSegment } from '../vdt';
import type { KPItem } from './types';
import { adjustLine } from './breakpoints';
import { graphemeCount } from '../measure/graphemes';

/**
 * Tracking (px after every character; negative tightens) of the line made
 * of `items[lineStart..breakAt)` broken at `breakAt`, `lineWidth` px wide,
 * with `trackingPerChar` px a character at most. 0 when its word spaces
 * alone set it within their limits, or it may take none.
 */
export function lineTracking(items: readonly KPItem[], lineStart: number, breakAt: number, lineWidth: number, trackingPerChar: number): number {
  let width = 0;
  let stretch = 0;
  let shrink = 0;
  let chars = 0;
  let spaces = 0;
  let noTracking = false;
  for (let j = lineStart; j < breakAt; j++) {
    const it = items[j]!;
    if (it.type === 'box') {
      width += it.width;
      chars += it.chars ?? 0;
      if (it.noTracking) noTracking = true;
    } else if (it.type === 'glue') {
      width += it.width;
      stretch += it.stretch;
      shrink += it.shrink;
      if (it.sourceIndex >= 0) spaces++;
    }
  }
  const brk = items[breakAt];
  if (brk?.type === 'penalty') {
    width += brk.width;
    chars += brk.chars ?? 0;
  }
  // What the break before the line added at its start (a repeated hyphen).
  const before = items[lineStart - 1];
  if (before?.type === 'penalty') {
    width += before.postWidth ?? 0;
    chars += before.postChars ?? 0;
  }
  return adjustLine(lineWidth - width, stretch, shrink, chars, trackingPerChar, spaces > 0 && !noTracking).tracking;
}

/** Add `tracking` px a grapheme to the width of every text segment (word,
 *  reference, script run) of a line; spaces, formulas, swatches and chips
 *  keep theirs. Two stacked scripts advance as far as the longer run: the
 *  first keeps its zero width, the second takes the tracking of the longer
 *  of the two (as the breaker counted their characters). Returns the width
 *  added to the line. The change is linear in `tracking`, so the same call
 *  with `-tracking` undoes it exactly (`raggedLooseLines`). */
export function trackSegments(segments: VDTLineSegment[], tracking: number): number {
  let added = 0;
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]!;
    if (seg.kind !== 'text') continue;
    const next = segments[i + 1];
    if (seg.stacked && next?.kind === 'text') {
      const delta = tracking * Math.max(graphemeCount(seg.text), graphemeCount(next.text));
      next.width += delta;
      added += delta;
      i++;
      continue;
    }
    const delta = tracking * graphemeCount(seg.text);
    seg.width += delta;
    added += delta;
  }
  return added;
}
