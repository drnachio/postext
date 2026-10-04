/**
 * Line order on right-to-left pages (`VDTMirroredFlowFrame`).
 *
 * The measurer gives every line the order of its segments as they stand
 * on the sheet from left to right (`VDTLine.order`, absent when that is
 * the logical order). A right-to-left page lays its flow out mirrored and
 * renderers advance along the flow's x axis, which runs from the sheet's
 * right edge to its left: there the segments advance in the reverse of
 * their visual order. This pass turns the order of every line set in the
 * flow of a mirrored page once the pages exist, so the measurer stays
 * blind to the frame (its lines, cached and shared, are the same in any
 * frame).
 *
 * A line of Arabic words, whose visual order is the reverse of the
 * logical one, ends with no `order` at all; a line of Latin words on such
 * a page gets the reversed order, so its first word is painted at the
 * flow's left, the sheet's right… of the words that follow it on the
 * sheet, which reads "first second third" from left to right again.
 *
 * Measured lines are shared (the measurement cache, resource blocks laid
 * out once and placed on several passes), so the pass never changes a
 * line in place: it gives the block, resource block or table cell that
 * holds one a new line object and a new array, and remembers the lines it
 * made so that a block met twice is not turned back.
 */

import {
  pageIsMirrored,
  type ResolvedResourceBlock,
  type VDTBlock,
  type VDTDocument,
  type VDTLine,
  type VDTLineSegment,
  type VDTPage,
} from '../vdt';

/** Lines this pass made (already in flow order). */
const oriented = new WeakSet<VDTLine>();

/** The flow order of a line of `n` segments on a mirrored page, given its
 *  visual order (`undefined` = 0 … n − 1): its reverse, or `undefined`
 *  when that is the logical order. */
export function mirroredLineOrder(order: readonly number[] | undefined, n: number): number[] | undefined {
  const visual = order ?? Array.from({ length: n }, (_, i) => i);
  const flow = [...visual].reverse();
  return flow.every((v, i) => v === i) ? undefined : flow;
}

/** The line's segments with the run order of each chip of two or more
 *  runs turned for the mirrored frame (`VDTChip.order`: the chip painter
 *  advances through its runs along the flow's x axis too), or undefined
 *  when no chip changes. */
function orientChips(segments: readonly VDTLineSegment[]): VDTLineSegment[] | undefined {
  let out: VDTLineSegment[] | undefined;
  segments.forEach((seg, i) => {
    const chip = seg.chip;
    if (!chip || chip.runs.length < 2) return;
    const order = mirroredLineOrder(chip.order, chip.runs.length);
    if (!order && !chip.order) return;
    const next = { ...chip };
    if (order) next.order = order;
    else delete next.order;
    out ??= [...segments];
    out[i] = { ...seg, chip: next };
  });
  return out;
}

function orientLine(line: VDTLine): VDTLine {
  if (oriented.has(line)) return line;
  const n = line.segments?.length ?? 0;
  const segments = n > 0 ? orientChips(line.segments!) : undefined;
  // A line of one segment (or painted from its text) has no order to turn,
  // only, perhaps, its chip's.
  if (n < 2 && !segments) return line;
  const next: VDTLine = { ...line };
  if (n >= 2) {
    const order = mirroredLineOrder(line.order, n);
    if (order) next.order = order;
    else delete next.order;
  }
  if (segments) next.segments = segments;
  oriented.add(next);
  return next;
}

function orientLines(lines: VDTLine[]): VDTLine[] {
  let changed = false;
  const out = lines.map((l) => {
    const o = orientLine(l);
    if (o !== l) changed = true;
    return o;
  });
  return changed ? out : lines;
}

function orientResourceBlock(rb: ResolvedResourceBlock): ResolvedResourceBlock {
  const captionLines = orientLines(rb.captionLines);
  const noteLines = orientLines(rb.noteLines);
  const continuesLines = orientLines(rb.continuesLines);
  let table = rb.table;
  if (table) {
    let changed = false;
    const cells = table.cells.map((cell) => {
      const lines = orientLines(cell.lines);
      if (lines === cell.lines) return cell;
      changed = true;
      return { ...cell, lines };
    });
    if (changed) table = { ...table, cells };
  }
  if (captionLines === rb.captionLines && noteLines === rb.noteLines && continuesLines === rb.continuesLines && table === rb.table) return rb;
  return { ...rb, captionLines, noteLines, continuesLines, ...(table ? { table } : {}) };
}

function orientBlock(block: VDTBlock): void {
  block.lines = orientLines(block.lines);
  if (block.resourceBlock) block.resourceBlock = orientResourceBlock(block.resourceBlock);
}

/** Turn the line order of everything set in the flow of `page` when its
 *  flow is mirrored (columns, floats, margin notes); see the module
 *  comment. Design slots are left alone. */
export function orientPageLinesToFrame(page: VDTPage): void {
  if (!pageIsMirrored(page)) return;
  for (const col of page.columns) for (const block of col.blocks) orientBlock(block);
  for (const block of page.floats ?? []) orientBlock(block);
  for (const block of page.marginNotes) orientBlock(block);
}

/** {@link orientPageLinesToFrame} on every page of `doc`. */
export function orientLinesToFrames(doc: VDTDocument): void {
  for (const page of doc.pages) orientPageLinesToFrame(page);
  // Blocks the pages do not list (none today) are turned with their page.
  for (const block of doc.blocks) {
    const page = block.pageIndex >= 0 ? doc.pages[block.pageIndex] : undefined;
    if (page && pageIsMirrored(page)) orientBlock(block);
  }
}
