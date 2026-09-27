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
    const last = segments[segments.length - 1]!;
    return last.kind === 'text' && last.text.length > 0 ? tracking : 0;
  }
  return /\S$/.test(line.text) ? tracking : 0;
}
