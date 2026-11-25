import type { VDTDocument } from 'postext';

/**
 * Resolve which block should host the caret given a source offset.
 * Prefers the block that actually contains the offset; a caret between two
 * blocks (a blank line, text the page has not laid out yet) goes to the
 * nearer one, and on a tie to the block before it: what is typed after a
 * paragraph shows at its end, never at the head of the next one.
 *
 * `pages` narrows the search to the blocks of a page range (`[from, to)`):
 * a whole-book canvas holds every chapter's blocks with chapter offsets, so
 * the caret of the active chapter is looked up among its own pages only.
 */
export function findCaretBlockIdx(doc: VDTDocument, head: number, pages?: { from: number; to: number }): number {
  const inRange = (b: VDTDocument['blocks'][number]): boolean =>
    !pages || (b.pageIndex >= pages.from && b.pageIndex < pages.to);
  let last = -1;
  let before = -1;
  let after = -1;
  for (let i = 0; i < doc.blocks.length; i++) {
    const b = doc.blocks[i]!;
    if (!inRange(b)) continue;
    // Text carried in from another chapter (#943) has that file's offsets.
    if (b.sourceChapter !== undefined) continue;
    last = i;
    if (b.sourceStart === undefined || b.sourceEnd === undefined) continue;
    if (head >= b.sourceStart && head <= b.sourceEnd) return i;
    // The block with lines wins over the box round it (same end or start).
    if (b.sourceEnd < head) {
      const held = doc.blocks[before];
      if (!held || b.sourceEnd > held.sourceEnd! || (b.sourceEnd === held.sourceEnd && b.lines.length > 0)) before = i;
    } else {
      const held = doc.blocks[after];
      if (!held || b.sourceStart < held.sourceStart! || (b.sourceStart === held.sourceStart && held.lines.length === 0 && b.lines.length > 0)) after = i;
    }
  }
  if (before === -1) return after === -1 ? last : after;
  if (after === -1) return before;
  return head - doc.blocks[before]!.sourceEnd! <= doc.blocks[after]!.sourceStart! - head ? before : after;
}

/**
 * The block of a story carried in from chapter `chapter` (#943, #988) that
 * holds the caret `head`, an offset in that chapter's file, on page
 * `pageIndex` (one with lines: not the box around them); -1 when none does.
 */
export function findCarriedCaretBlockIdx(doc: VDTDocument, head: number, chapter: number, pageIndex: number): number {
  for (let i = 0; i < doc.blocks.length; i++) {
    const b = doc.blocks[i]!;
    if (b.pageIndex !== pageIndex || b.sourceChapter !== chapter || b.lines.length === 0 || b.sourceStart === undefined || b.sourceEnd === undefined) continue;
    if (head >= b.sourceStart && head <= b.sourceEnd) return i;
  }
  return -1;
}
