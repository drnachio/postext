// Which pages each chapter occupies in a laid-out book. Pure over the built
// document; mirrors the engine's chapter attribution: the parity-padding
// blank pages before a chapter's first block belong to that chapter.

import type { VDTDocument } from 'postext';
import type { BookPages, ComposedBook } from './types';

export function computeBookPages(doc: VDTDocument, book: ComposedBook): BookPages {
  const out: BookPages = {};
  const pageCount = doc.pages.length;
  if (pageCount === 0) return out;
  const firstPages: number[] = [];
  let blockCursor = 0;
  const blocks = doc.blocks;
  for (const seg of book.segments) {
    // First block that starts inside this segment (blocks are in flow order).
    let page = -1;
    while (blockCursor < blocks.length) {
      const b = blocks[blockCursor]!;
      const start = b.sourceStart;
      if (start !== undefined && start >= seg.start) {
        if (start < seg.end || seg.end === seg.start) page = b.pageIndex;
        break;
      }
      blockCursor++;
    }
    firstPages.push(page);
  }
  // Empty chapters (no block) inherit the next chapter's start, else the
  // previous one's, so ranges stay contiguous.
  for (let i = firstPages.length - 1; i >= 0; i--) {
    if (firstPages[i]! < 0) firstPages[i] = i + 1 < firstPages.length ? firstPages[i + 1]! : pageCount;
  }
  let lastStart = 0;
  for (let i = 0; i < firstPages.length; i++) {
    if (firstPages[i]! < lastStart) firstPages[i] = lastStart;
    lastStart = firstPages[i]!;
  }
  // A chapter that opens with a heading owns the blank parity page pushed in
  // front of it (the engine's `{chapterTitle}` rule).
  for (let i = 1; i < firstPages.length; i++) {
    const p = firstPages[i]!;
    if (p > 0 && p - 1 > firstPages[i - 1]! && isBlankPage(doc, p - 1)) firstPages[i] = p - 1;
  }
  book.segments.forEach((seg, i) => {
    const start = firstPages[i]!;
    const next = i + 1 < firstPages.length ? Math.min(firstPages[i + 1]!, pageCount) : pageCount;
    const pageIndex = Math.min(start, pageCount - 1);
    out[seg.chapterId] = {
      pageIndex,
      pageNumberValue: doc.pages[pageIndex]?.pageNumberValue ?? pageIndex + 1,
      pageCount: Math.max(0, next - start),
    };
  });
  return out;
}

function isBlankPage(doc: VDTDocument, pageIndex: number): boolean {
  return !doc.blocks.some((b) => b.pageIndex === pageIndex);
}
