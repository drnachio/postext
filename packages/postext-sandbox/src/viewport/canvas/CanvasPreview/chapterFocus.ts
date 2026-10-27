import type { PendingEditorFocus } from '../../../context/SandboxContext.js';
import type { ComposedBook } from '../../../book/types.js';
import { fromBookOffset, segmentForChapter } from '../../../book/compose.js';

/** Map a document-offset selection to a chapter-local focus request. A
 *  drag whose head lands in another chapter is clamped to the anchor's
 *  chapter (one editor shows one chapter). */
export function toChapterFocus(
  source: ComposedBook | null,
  anchor: number,
  head: number,
  selectWord: boolean,
): PendingEditorFocus {
  if (!source || source.segments.length === 0) return { anchor, head, selectWord };
  const a = fromBookOffset(source, anchor);
  const h = fromBookOffset(source, head);
  let headLocal = h.offset;
  if (h.chapterId !== a.chapterId) {
    const seg = segmentForChapter(source, a.chapterId)!;
    headLocal = head > anchor ? seg.end - seg.start : 0;
  }
  return { chapterId: a.chapterId, anchor: a.offset, head: headLocal, selectWord };
}
