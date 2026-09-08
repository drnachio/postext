'use client';

import { useCallback, useEffect, useRef } from 'react';
import { readPageHash, writePageHash } from '../storage/pageHash';

/**
 * Keep a paged viewer in step with the `#page=N` URL fragment.
 *
 * On mount the fragment is read once; as soon as the viewer reports a page
 * count, the viewer jumps to that page (when it exists). From then on every
 * page the viewer reports is written back to the fragment, so a reload — or
 * a switch to another viewer, which mounts and reads the same fragment —
 * lands on the page the reader was on. Pages reported before the restore
 * settles (the initial scroll position, the jump itself) are not written.
 *
 * Returns the `onCurrentPageChange` callback to hand to the viewer.
 */
export function usePageHashSync(
  pageCount: number,
  jumpToPage: (pageIndex: number) => void,
): (pageIndex: number) => void {
  const targetRef = useRef<number | null>(null);
  const readRef = useRef(false);
  const restoredRef = useRef(false);
  const jumpRef = useRef(jumpToPage);
  jumpRef.current = jumpToPage;

  if (!readRef.current && typeof window !== 'undefined') {
    // Read during the first client render so it precedes any page report.
    readRef.current = true;
    targetRef.current = readPageHash();
  }

  useEffect(() => {
    if (restoredRef.current || pageCount <= 0) return;
    const target = targetRef.current;
    if (target !== null && target < pageCount) jumpRef.current(target);
    // Let the jump's own scroll report settle before the reader's position
    // becomes authoritative for the fragment. A timer, not an animation
    // frame: a background tab never runs frames, but must still restore.
    const id = window.setTimeout(() => {
      restoredRef.current = true;
    }, 0);
    return () => window.clearTimeout(id);
  }, [pageCount]);

  // A fragment edited by hand (or a back/forward step) moves the viewer too.
  // `history.replaceState` writes never fire this event.
  useEffect(() => {
    const onHashChange = () => {
      const page = readPageHash();
      if (page !== null) jumpRef.current(page);
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return useCallback((pageIndex: number) => {
    if (restoredRef.current) writePageHash(pageIndex);
  }, []);
}
