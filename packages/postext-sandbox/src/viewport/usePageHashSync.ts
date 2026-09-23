'use client';

import { useCallback, useEffect, useRef } from 'react';
import { useSandboxSelector } from '../context/SandboxContext';
import { readViewHash, writeViewHash } from '../storage/viewHash';

/** One layout of the viewer's document: its page count, its first page
 *  with content (the ones before it are parity padding), and a counter
 *  that advances with every layout so a same-sized relayout is still
 *  noticed. */
export interface ViewerLayout {
  pageCount: number;
  firstPage: number;
  /** Book page number printed on each page, by page index. */
  pageNumbers: readonly number[];
  version: number;
  /** Set when the document is the whole book: the chapter (position in
   *  the book) of every page, and the first content page of every chapter
   *  (-1 while it has none). */
  book?: BookPageMap;
}

export interface BookPageMap {
  pageChapters: readonly number[];
  chapterFirstPages: readonly number[];
}

/** Empty layout record, before the viewer's first document. */
export const EMPTY_VIEWER_LAYOUT: ViewerLayout = { pageCount: 0, firstPage: 0, pageNumbers: [], version: 0 };

/** Index of the page numbered `pageNumber` in the layout, or -1. */
export function pageIndexOf(layout: ViewerLayout, pageNumber: number): number {
  return layout.pageNumbers.indexOf(pageNumber);
}

/** Book page number of the page at `pageIndex` (falls back to `index + 1`
 *  while the layout is unknown). */
export function pageNumberAt(layout: ViewerLayout, pageIndex: number): number {
  return layout.pageNumbers[pageIndex] ?? pageIndex + 1;
}

/**
 * Keep a paged viewer in step with the `#chapter=C&page=P` URL fragment.
 *
 * A restore is pending on mount and again whenever the active chapter
 * changes. It settles on the next layout: when the fragment names the
 * active chapter (or no chapter at all), the viewer jumps to the page
 * carrying that number; any other chapter's page does not carry over, and
 * a fragment without a page means the chapter's first content page — where
 * a chapter switch lands. From then on every page the viewer reports is
 * written back to the fragment as its book page number — so a reload, or a
 * switch to another viewer (which mounts and restores from the same
 * fragment), lands where the reader was. Pages reported while a restore is pending are not written:
 * the layout's own first report, or a scroll of the outgoing chapter's
 * document, must not overwrite the target before it is read.
 *
 * A target page the layout does not have yet is waited for: the first
 * layout may run with fallback fonts and come out shorter than the real
 * one, which lands a moment later. The wait is bounded (`RESTORE_WAIT_MS`),
 * after which the last page is settled for and the fragment follows the
 * reader again.
 *
 * A layout of the whole book (`layout.book`) holds every chapter's pages:
 * the fragment's page carries over whichever chapter it names, the
 * fragment names the chapter of the page the reader is on, and a chapter
 * switch changes no document — the viewer jumps to the chapter's first
 * content page, unless the reader is on one of its pages already (a click
 * on the page switched the editor) or the fragment already names a page
 * of it (a link to a page of the contents).
 *
 * Returns the `onCurrentPageChange` callback to hand to the viewer.
 */
const RESTORE_WAIT_MS = 4000;

export function usePageHashSync(
  layout: ViewerLayout,
  jumpToPage: (pageIndex: number) => void,
): (pageIndex: number) => void {
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const bookVersion = useSandboxSelector((s) => s.bookVersion);
  const chapterIndex = useSandboxSelector((s) => s.chapters.findIndex((c) => c.id === activeChapterId));
  const chapterIndexRef = useRef(chapterIndex);
  chapterIndexRef.current = chapterIndex;
  const jumpRef = useRef(jumpToPage);
  jumpRef.current = jumpToPage;
  const layoutRef = useRef(layout);
  layoutRef.current = layout;

  // The page last reported by the viewer (the one nearest its centre).
  const lastPageRef = useRef(0);

  // Re-arm during render, before any effect of this commit can report a
  // page for the outgoing document. A whole-book document does not change
  // with the chapter: the switch is handled below instead — unless the
  // whole book was replaced (a preset loaded, a project opened), which is
  // a new document whichever the scope.
  const pendingRef = useRef(true);
  // When the wait for a missing target page started (null: not waiting).
  const waitingSinceRef = useRef<number | null>(null);
  const armedForRef = useRef({ bookVersion, activeChapterId });
  if (armedForRef.current.activeChapterId !== activeChapterId || armedForRef.current.bookVersion !== bookVersion) {
    const replaced = armedForRef.current.bookVersion !== bookVersion;
    armedForRef.current = { bookVersion, activeChapterId };
    if (!layoutRef.current.book || replaced) {
      pendingRef.current = true;
      waitingSinceRef.current = null;
    }
  }

  useEffect(() => {
    if (!pendingRef.current || layout.pageCount <= 0) return;
    const hash = readViewHash();
    const chapter = chapterIndexRef.current;
    const carried = !!layout.book || hash.chapter === null || hash.chapter === chapter;
    const wanted = carried && hash.page !== null ? hash.page : null;
    const wantedIndex = wanted === null ? -1 : pageIndexOf(layout, wanted);
    let target: number;
    if (wanted === null || (wantedIndex < 0 && wanted < pageNumberAt(layout, 0))) {
      target = layout.book ? chapterFirstPage(layout, hash.chapter ?? chapter) : layout.firstPage;
    } else if (wantedIndex >= 0) {
      target = wantedIndex;
    } else {
      // Not laid out yet: show the last page and keep the restore pending
      // for a later, taller layout — for a while.
      const now = Date.now();
      if (waitingSinceRef.current === null) waitingSinceRef.current = now;
      const left = RESTORE_WAIT_MS - (now - waitingSinceRef.current);
      if (left > 0) {
        jumpRef.current(layout.pageCount - 1);
        const id = window.setTimeout(() => {
          pendingRef.current = false;
          waitingSinceRef.current = null;
        }, left);
        return () => window.clearTimeout(id);
      }
      target = layout.pageCount - 1;
    }
    waitingSinceRef.current = null;
    jumpRef.current(target);
    writeViewHash({ chapter: chapterOfPage(layout, target, chapter), page: pageNumberAt(layout, target) });
    // Let the jump's own scroll report settle before the reader's position
    // becomes authoritative for the fragment. A timer, not an animation
    // frame: a background tab never runs frames, but must still restore.
    const id = window.setTimeout(() => {
      pendingRef.current = false;
    }, 0);
    return () => window.clearTimeout(id);
  }, [layout]);

  // A chapter switch under a whole-book document: to the chapter's first
  // content page, unless the reader is on one of its pages already or the
  // fragment names a page of it (a contents row was clicked).
  useEffect(() => {
    const current = layoutRef.current;
    const book = current.book;
    if (!book || current.pageCount <= 0 || pendingRef.current) return;
    const chapter = chapterIndexRef.current;
    const hash = readViewHash();
    if (hash.chapter === chapter && hash.page !== null) {
      const index = pageIndexOf(current, hash.page);
      if (index >= 0) {
        jumpRef.current(index);
        return;
      }
    }
    const here = lastPageRef.current;
    if (book.pageChapters[here] === chapter) {
      writeViewHash({ chapter, page: pageNumberAt(current, here) });
      return;
    }
    const first = chapterFirstPage(current, chapter);
    jumpRef.current(first);
    writeViewHash({ chapter, page: pageNumberAt(current, first) });
  }, [activeChapterId]);

  // A fragment edited by hand (or a back/forward step) moves the viewer too
  // when it names the active chapter (or any chapter, under a whole-book
  // document); a different chapter is switched to by the chapter sync, and
  // the pending restore then picks the page up. `history.replaceState`
  // writes never fire this event.
  useEffect(() => {
    const onHashChange = () => {
      const hash = readViewHash();
      if (hash.chapter !== null && hash.chapter !== chapterIndexRef.current && !layoutRef.current.book) return;
      if (hash.page === null) return;
      const index = pageIndexOf(layoutRef.current, hash.page);
      if (index >= 0) jumpRef.current(index);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return useCallback((pageIndex: number) => {
    lastPageRef.current = pageIndex;
    if (!pendingRef.current) {
      const current = layoutRef.current;
      writeViewHash({ chapter: chapterOfPage(current, pageIndex, chapterIndexRef.current), page: pageNumberAt(current, pageIndex) });
    }
  }, []);
}

/** The chapter a page of a whole-book layout belongs to; `fallback` for
 *  a chapter-only layout. */
function chapterOfPage(layout: ViewerLayout, pageIndex: number, fallback: number): number {
  return layout.book?.pageChapters[pageIndex] ?? fallback;
}

/** Where a chapter opens in a whole-book layout (its first content page),
 *  or the layout's first page when it has none. */
function chapterFirstPage(layout: ViewerLayout, chapter: number): number {
  const first = layout.book?.chapterFirstPages[chapter] ?? -1;
  return first >= 0 ? first : layout.firstPage;
}
