import type { VDTDocument } from 'postext';

/**
 * Resolve which block should host the caret given a source offset.
 * Prefers the block that actually contains the offset; otherwise falls back
 * to the first block starting at or after the offset (caret between paragraphs).
 *
 * `pages` narrows the search to the blocks of a page range (`[from, to)`):
 * a whole-book canvas holds every chapter's blocks with chapter offsets, so
 * the caret of the active chapter is looked up among its own pages only.
 */
export function findCaretBlockIdx(doc: VDTDocument, head: number, pages?: { from: number; to: number }): number {
  const inRange = (b: VDTDocument['blocks'][number]): boolean =>
    !pages || (b.pageIndex >= pages.from && b.pageIndex < pages.to);
  let caretBlockIdx = -1;
  let last = -1;
  for (let i = 0; i < doc.blocks.length; i++) {
    const b = doc.blocks[i]!;
    if (!inRange(b)) continue;
    // Text carried in from another chapter (#943) has that file's offsets.
    if (b.sourceChapter !== undefined) continue;
    last = i;
    if (b.sourceStart === undefined || b.sourceEnd === undefined) continue;
    if (head >= b.sourceStart && head <= b.sourceEnd) { caretBlockIdx = i; break; }
  }
  if (caretBlockIdx === -1) {
    for (let i = 0; i < doc.blocks.length; i++) {
      const b = doc.blocks[i]!;
      if (!inRange(b) || b.sourceStart === undefined || b.sourceChapter !== undefined) continue;
      if (b.sourceStart >= head) { caretBlockIdx = i; break; }
    }
  }
  if (caretBlockIdx === -1) caretBlockIdx = last;
  return caretBlockIdx;
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
