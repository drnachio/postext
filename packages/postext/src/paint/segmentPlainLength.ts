// How many plain characters of its block a line segment stands for: the
// unit the lines' `plainStart`/`plainEnd` count in (#1388: one engine copy
// for the source map, the display list and the Sandbox).
import type { VDTLineSegment } from '../vdt.js';

/** The plain characters a segment stands for: none for what the layout
 *  added (a book title's brackets, a tab leader, the later runs of a
 *  reference set in pieces), one for a reference and a swatch, and its
 *  text less the tatweels kashida justification inserted, less the hyphen
 *  a break added at the line's end (`dropTrailingHyphen`) and the one a
 *  line repeats at its start (`dropLeadingHyphen`), for anything else. */
export function segmentPlainLength(seg: VDTLineSegment, dropTrailingHyphen: boolean, dropLeadingHyphen: boolean): number {
  if (seg.refContinues || seg.inserted || seg.leader !== undefined) return 0;
  if (seg.refResourceId !== undefined || seg.kind === 'swatch') return 1;
  let len = seg.text.length - (seg.kashida?.length ?? 0);
  if (dropLeadingHyphen && seg.text.startsWith('-')) len--;
  if (dropTrailingHyphen && seg.text.endsWith('-') && len > 0) len--;
  return Math.max(0, len);
}
