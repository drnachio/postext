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
  version: number;
}

/**
 * Keep a paged viewer in step with the `#chapter=C&page=P` URL fragment.
 *
 * A restore is pending on mount and again whenever the active chapter
 * changes. It settles on the next layout: when the fragment names the
 * active chapter (or no chapter at all), the viewer jumps to its page; any
 * other chapter's page does not carry over, and a fragment without a page
 * means the chapter's first content page — where a chapter switch lands. From then on every page the viewer reports is
 * written back to the fragment — so a reload, or a switch to another viewer
 * (which mounts and restores from the same fragment), lands where the
 * reader was. Pages reported while a restore is pending are not written:
 * the layout's own first report, or a scroll of the outgoing chapter's
 * document, must not overwrite the target before it is read.
 *
 * A target page the layout does not have yet is waited for: the first
 * layout may run with fallback fonts and come out shorter than the real
 * one, which lands a moment later. The wait is bounded (`RESTORE_WAIT_MS`),
 * after which the last page is settled for and the fragment follows the
 * reader again.
 *
 * Returns the `onCurrentPageChange` callback to hand to the viewer.
 */
const RESTORE_WAIT_MS = 4000;

export function usePageHashSync(
  layout: ViewerLayout,
  jumpToPage: (pageIndex: number) => void,
): (pageIndex: number) => void {
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const chapterIndex = useSandboxSelector((s) => s.chapters.findIndex((c) => c.id === activeChapterId));
  const chapterIndexRef = useRef(chapterIndex);
  chapterIndexRef.current = chapterIndex;
  const jumpRef = useRef(jumpToPage);
  jumpRef.current = jumpToPage;

  // Re-arm during render, before any effect of this commit can report a
  // page for the outgoing document.
  const pendingRef = useRef(true);
  // When the wait for a missing target page started (null: not waiting).
  const waitingSinceRef = useRef<number | null>(null);
  const armedForRef = useRef(activeChapterId);
  if (armedForRef.current !== activeChapterId) {
    armedForRef.current = activeChapterId;
    pendingRef.current = true;
    waitingSinceRef.current = null;
  }

  useEffect(() => {
    if (!pendingRef.current || layout.pageCount <= 0) return;
    const hash = readViewHash();
    const chapter = chapterIndexRef.current;
    const carried = hash.chapter === null || hash.chapter === chapter;
    const wanted = carried && hash.page !== null ? hash.page : null;
    let target: number;
    if (wanted === null) {
      target = layout.firstPage;
    } else if (wanted < layout.pageCount) {
      target = wanted;
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
    writeViewHash({ chapter, page: target });
    // Let the jump's own scroll report settle before the reader's position
    // becomes authoritative for the fragment. A timer, not an animation
    // frame: a background tab never runs frames, but must still restore.
    const id = window.setTimeout(() => {
      pendingRef.current = false;
    }, 0);
    return () => window.clearTimeout(id);
  }, [layout]);

  // A fragment edited by hand (or a back/forward step) moves the viewer too
  // when it names the active chapter; a different chapter is switched to by
  // the chapter sync, and the pending restore then picks the page up.
  // `history.replaceState` writes never fire this event.
  useEffect(() => {
    const onHashChange = () => {
      const hash = readViewHash();
      if (hash.chapter !== null && hash.chapter !== chapterIndexRef.current) return;
      if (hash.page !== null) jumpRef.current(hash.page);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return useCallback((pageIndex: number) => {
    if (!pendingRef.current) writeViewHash({ chapter: chapterIndexRef.current, page: pageIndex });
  }, []);
}
