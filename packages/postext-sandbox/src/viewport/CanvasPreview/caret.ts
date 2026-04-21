import type { VDTDocument } from 'postext';

/**
 * Resolve which block should host the caret given a source offset.
 * Prefers the block that actually contains the offset; otherwise falls back
 * to the first block starting at or after the offset (caret between paragraphs).
 */
export function findCaretBlockIdx(doc: VDTDocument, head: number): number {
  let caretBlockIdx = -1;
  for (let i = 0; i < doc.blocks.length; i++) {
    const b = doc.blocks[i]!;
    if (b.sourceStart === undefined || b.sourceEnd === undefined) continue;
    if (head >= b.sourceStart && head <= b.sourceEnd) { caretBlockIdx = i; break; }
  }
  if (caretBlockIdx === -1) {
    for (let i = 0; i < doc.blocks.length; i++) {
      const b = doc.blocks[i]!;
      if (b.sourceStart === undefined) continue;
      if (b.sourceStart >= head) { caretBlockIdx = i; break; }
    }
  }
  if (caretBlockIdx === -1 && doc.blocks.length > 0) {
    caretBlockIdx = doc.blocks.length - 1;
  }
  return caretBlockIdx;
}
