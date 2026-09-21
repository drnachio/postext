'use client';

import { useEffect, useMemo, useRef } from 'react';
import { useBookPlan, useSandboxDispatch, useSandboxSelector } from '../context/SandboxContext';
import { composeBookMemo } from '../book/compose';
import { chapterLayoutFromDoc } from '../book/pagination';
import { withHyphenationLocale } from '../controls/hyphenation';
import { useDebouncedValue } from '../hooks/useDebouncedValue';
import { useLayoutWorker } from '../worker/useLayoutWorker';

/** Pause before a preceding chapter is laid out in the background (ms). */
const PAGINATION_DEBOUNCE_MS = 300;

/** Renderless. The previews lay out only the active chapter, whose first
 *  page number depends on the page counts of the chapters before it (and
 *  the chapter list shows every chapter's page range). Those counts come
 *  from the layout that last showed each chapter — or, for a chapter never
 *  visited (or edited since), from a background layout done here, one
 *  chapter at a time in book order, on a worker of its own. Once every
 *  chapter is paginated, a chapter printing the contents with rows that
 *  went stale (a page count before it changed) is laid out again, once:
 *  its pages hold meanwhile, so nothing after it moves. */
export function ChapterPaginator() {
  const dispatch = useSandboxDispatch();
  const plan = useBookPlan();
  const chapters = useSandboxSelector((s) => s.chapters);
  const activeChapterId = useSandboxSelector((s) => s.activeChapterId);
  const activeViewport = useSandboxSelector((s) => s.activeViewport);
  const config = useSandboxSelector((s) => s.config);
  const resources = useSandboxSelector((s) => s.resources);
  const locale = useSandboxSelector((s) => s.locale);
  const storeReady = useSandboxSelector((s) => s.storeReady);
  const layoutWorker = useLayoutWorker();

  // The active chapter is left to the canvas when that is the tab shown:
  // it lays the chapter out at print geometry and records the layout on
  // every rebuild. The HTML tab lays out for the screen and the PDF tab
  // only on request, so under those the active chapter is handled here.
  const pending = plan.pendingChapterId ? plan.byId[plan.pendingChapterId] : undefined;
  const leftToPreview = activeViewport === 'canvas' && pending?.chapterId === activeChapterId;
  const pendingId = storeReady && pending && pending.paginated && !leftToPreview ? pending.chapterId : null;
  const pendingKey = pendingId ? `${pendingId}|${plan.byId[pendingId]!.continuationKey}|${plan.byId[pendingId]!.outlineKey}` : null;
  const chapterMarkdown = pendingId ? chapters.find((c) => c.id === pendingId)?.markdown : undefined;
  // What a background build is keyed on — the chapter, what it inherits
  // and its text — as one value, debounced as one: a chapter landing moves
  // the pending one on, and both its key and its text change at once. A
  // trigger per field would fire the effect twice (the old key with the
  // new text first), building the chapter that just landed once more.
  const trigger = useMemo(
    () => (pendingKey && chapterMarkdown !== undefined ? { key: pendingKey, markdown: chapterMarkdown } : null),
    [pendingKey, chapterMarkdown],
  );
  const debounced = useDebouncedValue(trigger, PAGINATION_DEBOUNCE_MS);

  // The latest inputs, read when a build starts so typing in the active
  // chapter (which re-plans the book) does not restart a build in flight.
  const latest = useRef({ plan, chapters, config, resources, locale });
  latest.current = { plan, chapters, config, resources, locale };

  useEffect(() => {
    if (!debounced) return;
    const id = debounced.key.slice(0, debounced.key.indexOf('|'));
    const { plan: currentPlan, chapters: currentChapters, config: currentConfig, resources: currentResources, locale: currentLocale } = latest.current;
    const chapterPlan = currentPlan.byId[id];
    const target = currentChapters.find((c) => c.id === id);
    if (!chapterPlan || !chapterPlan.paginated || !target) return;
    let cancelled = false;
    const book = composeBookMemo(currentChapters, id);
    layoutWorker.build(
      { markdown: book.markdown, metadata: book.metadata, resources: currentResources, continuation: chapterPlan.continuation, outline: chapterPlan.outline },
      withHyphenationLocale(currentConfig, currentLocale),
    )
      .then((doc) => {
        if (cancelled) return;
        const layout = chapterLayoutFromDoc(doc, chapterPlan, { markdown: target.markdown, config: currentConfig, resources: currentResources });
        if (layout) dispatch({ type: 'SET_CHAPTER_LAYOUT', payload: layout });
      })
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        console.error('[ChapterPaginator] Layout error:', err);
      });
    return () => {
      cancelled = true;
    };
  }, [debounced, config, resources, locale, layoutWorker, dispatch]);

  return null;
}
