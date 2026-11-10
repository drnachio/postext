// Stacks marked on the page (#1463): a band behind what two lines in a row
// repeat at their end or start, on each of the two lines, screen only.
// Drawn while `bodyText.stacks` is 'warn' or 'avoid', from the engine's
// `findStacks`, the same stacks the Review panel lists.

import { findStacks, type VDTBlock, type VDTDocument, type VDTLine, type StackRange } from 'postext';
import { placeLineSegments, xInPlaced } from './geometry/placement.js';
import type { GlyphMark } from './glyphMarks.js';

/** The band behind a stack's repeated text. */
export const STACK_FILL = 'rgba(234, 88, 12, 0.28)';

/** The bands of one line's ranges. */
function lineBands(block: VDTBlock, line: VDTLine, ranges: StackRange[], mirrored: boolean): GlyphMark[] {
  const placed = placeLineSegments(block, line, mirrored, false);
  if (!placed) return [];
  const out: GlyphMark[] = [];
  for (const r of ranges) {
    const seg = line.segments?.[r.segment];
    const p = placed.find((q) => q.seg === seg);
    if (!p) continue;
    const a = xInPlaced(p, Math.min(p.plainLen, r.from));
    const b = xInPlaced(p, Math.min(p.plainLen, r.to));
    out.push({ x: Math.min(a, b), y: line.bbox.y, width: Math.max(1, Math.abs(b - a)), height: line.bbox.height, fill: STACK_FILL, block });
  }
  return out;
}

/** The bands to draw on page `pageIndex` of `doc`, in its flow frame;
 *  none while the document allows stacks. */
export function stackMarks(doc: VDTDocument, pageIndex: number, mirrored: boolean): GlyphMark[] {
  if (doc.config.bodyText.stacks === 'allow') return [];
  const out: GlyphMark[] = [];
  for (const s of findStacks(doc, { pageIndex })) {
    out.push(...lineBands(s.block, s.block.lines[s.line]!, s.ranges[0], mirrored));
    out.push(...lineBands(s.block, s.block.lines[s.line + 1]!, s.ranges[1], mirrored));
  }
  return out;
}
