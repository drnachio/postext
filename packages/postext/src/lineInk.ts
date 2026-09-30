import type { VDTLine } from './vdt';

/**
 * The tracking a flow line's measured width carries after its last glyph:
 * `tracking` (the block's `letterSpacing` plus the line's) when the line
 * ends on text, else 0. Canvas, CSS and PDF add tracking after every
 * character, the last one included; that last share is advance, not ink,
 * so a centred or right-aligned line leaves it out, as design text does
 * (EF-153). A line that ends on a formula, a chip, a swatch or a space
 * keeps its width as it is.
 */
export function lineTrailingTracking(line: VDTLine, tracking: number): number {
  if (tracking === 0) return 0;
  const segments = line.segments;
  if (segments && segments.length > 0) {
    let i = segments.length - 1;
    // A mark hung past the line's end is outside it (CJK only).
    while (i > 0 && segments[i]!.hangs) i--;
    const last = segments[i]!;
    return last.kind === 'text' && last.text.length > 0 ? tracking : 0;
  }
  return /\S$/.test(line.text) ? tracking : 0;
}

/**
 * The advance a line is aligned on and what it hangs past it: `width` is
 * the sum of its segments' widths less the hung marks
 * (`VDTLineSegment.hangs`, `cjk.hangingPunctuation`) and less the
 * trailing tracking (see {@link lineTrailingTracking}); `hang` is the
 * advance of the hung marks after it. Centred and right-aligned lines are
 * placed on `width`, and the column clip grows by `hang`. A line without
 * segments is `bbox.width` wide.
 */
export function lineInkExtent(line: VDTLine, tracking: number): { width: number; hang: number } {
  const segments = line.segments;
  if (!segments || segments.length === 0) return { width: line.bbox.width - lineTrailingTracking(line, tracking), hang: 0 };
  let width = 0;
  let hang = 0;
  for (const seg of segments) {
    if (seg.hangs) hang += seg.width;
    else width += seg.width;
  }
  return { width: width - lineTrailingTracking(line, tracking), hang };
}
