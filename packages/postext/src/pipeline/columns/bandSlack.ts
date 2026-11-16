// How much higher the level cut of a closing band could stand (#1600): read
// off a pass that delivered a trailing cap (see `BandPassReport.capSlack`).
import type { VDTColumn } from '../../vdt.js';

/** How many lines of `pitchPx` higher the cut of `cols` could stand: the
 *  whole lines each column leaves empty above its foot, summed and shared
 *  out among the columns. A column's content ends at its last line, or at
 *  the frame of a box (its bottom margin and grid snap are not content);
 *  room the balancing levers added is not content either. */
export function bandSlackLines(cols: readonly VDTColumn[], pitchPx: number): number {
  if (cols.length === 0) return 0;
  let free = 0;
  for (const c of cols) {
    let foot = c.bbox.y;
    // Room balancing added to fill the column up to the cut is not content.
    let added = 0;
    for (const b of c.blocks) {
      if (b.hidden || (b.containerId !== undefined && b.type !== 'callout')) continue;
      const line = b.type === 'callout' ? undefined : b.lines[b.lines.length - 1];
      foot = Math.max(foot, line ? line.bbox.y + line.bbox.height : b.bbox.y + b.bbox.height);
      if (b.balancing) added += b.balancing.spaceAbove + Math.max(0, b.balancing.extraLines ?? 0) * pitchPx;
    }
    free += Math.max(0, Math.floor((c.bbox.y + c.bbox.height - (foot - added) + 0.01) / pitchPx));
  }
  return Math.floor(free / cols.length);
}
