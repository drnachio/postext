// A line's adjustment ratio and tracking, shared by the breaker and the line
// reconstruction.
import { KP_INFINITY } from '../constants.js';

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
