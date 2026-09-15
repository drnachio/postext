'use client';

import { useEffect, useRef } from 'react';
import { useSandboxDispatch, useSandboxSelector } from '../context/SandboxContext';
import { readViewHash, writeViewHash } from '../storage/viewHash';

/**
 * Keep the active chapter in step with the `#chapter=C` part of the URL
 * fragment (see {@link readViewHash}); the page part is the viewers' job
 * ({@link usePageHashSync}).
 *
 * The initial state already picks the chapter the fragment names (see the
 * provider), but the mount seeding may replace the whole book (first entry,
 * a locale switch, a private default preset), so once the store is ready
 * the chapter is applied again — unless the reader has picked one in the
 * meantime. Every other change of the active chapter (the chapter list,
 * the switcher, a project switch) is written back without a page: switching
 * chapters always lands on the chapter's first content page. Switches driven by the
 * fragment itself leave it alone, so the page it names is still there for
 * the viewer to restore.
 */
export function useChapterHashSync(): void {
  const dispatch = useSandboxDispatch();
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const storeReady = useSandboxSelector((s) => s.storeReady);

  // The fragment as the page was opened: the seeding below may rewrite it.
  const initialRef = useRef<ReturnType<typeof readViewHash> | null>(null);
  if (initialRef.current === null) initialRef.current = readViewHash();
  // Set right before a fragment-driven switch; cleared when it lands.
  const hashDrivenRef = useRef<string | null>(null);
  const userNavigatedRef = useRef(false);
  const prevRef = useRef({ chapters, activeChapterId });

  const selectFromHash = (chapter: number | null, restore?: { page: number | null }) => {
    if (chapter === null) return;
    const target = chapters[chapter];
    if (!target || target.id === activeChapterId) return;
    hashDrivenRef.current = target.id;
    if (restore) writeViewHash({ chapter, page: restore.page });
    dispatch({ type: 'SET_ACTIVE_CHAPTER', payload: target.id });
  };
  const selectRef = useRef(selectFromHash);
  selectRef.current = selectFromHash;

  useEffect(() => {
    const prev = prevRef.current;
    prevRef.current = { chapters, activeChapterId };
    if (prev.activeChapterId === activeChapterId) return;
    if (hashDrivenRef.current === activeChapterId) {
      hashDrivenRef.current = null;
      return;
    }
    // Same chapter list, other chapter: the reader picked it.
    if (prev.chapters === chapters) userNavigatedRef.current = true;
    const chapter = chapters.findIndex((c) => c.id === activeChapterId);
    writeViewHash({ chapter: chapter < 0 ? null : chapter, page: null });
  }, [chapters, activeChapterId]);

  useEffect(() => {
    if (!storeReady || userNavigatedRef.current) return;
    const initial = initialRef.current;
    if (initial) selectRef.current(initial.chapter, initial);
    // No viewer keeping the fragment (the PDF tab): name the chapter anyway.
    if (readViewHash().chapter === null) {
      const chapter = chapters.findIndex((c) => c.id === activeChapterId);
      if (chapter >= 0) writeViewHash({ chapter, page: null });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once, on hydration
  }, [storeReady]);

  useEffect(() => {
    const onHashChange = () => selectRef.current(readViewHash().chapter);
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);
}
