// The Folio preview's build effect: the same documents the canvas lays out,
// under the same cache keys (#1276: split out of FolioPreview.tsx).
import { useEffect } from 'react';
import { verticalTwinsSettled, loadVerticalTwins, standInsSettled, declareStandIns } from '../../../controls/fonts/fontLoader.js';
import { buildBookChapters, type HeldChapterDoc } from '../../../book/buildBook.js';
import { stitchDocuments, type StitchedBook } from '../../../book/stitch.js';
import { composeBookMemo } from '../../../book/compose.js';
import { leadingBlankPageCount, chapterLayoutFromDoc } from '../../../book/pagination.js';
import { planContent } from '../../../book/jumps.js';
import { layoutCacheKey } from '../../../book/layoutKeys.js';
import { pagesAround, type ShownDoc } from './pages.js';
import type { SandboxAction } from '../../../context/SandboxContext/state.js';
import type { VDTDocument, PostextConfig, Resource } from 'postext';
import type { ComposedBook, Chapter, BookPlan } from '../../../book/types.js';
import type { ChapterDocument, LayoutSource } from '../../../context/SandboxContext/hooks.js';
import type { LayoutWorkerApi } from '../../../worker/useLayoutWorker.js';
import type { FontGate } from '../../../controls/fonts/fontLoader/loading.js';
import type { BookPageMap } from '../../usePageHashSync.js';

/** What useFolioBuild takes from the Folio preview. */
export interface UseFolioBuildDeps {
  dispatch: React.Dispatch<SandboxAction>;
  sharedDocRef: React.MutableRefObject<VDTDocument | null>;
  sharedDocSourceRef: React.MutableRefObject<ComposedBook | null>;
  chapterDocsRef: React.MutableRefObject<Map<string, ChapterDocument>>;
  chaptersRef: React.RefObject<Chapter[]>;
  deferredBookVersion: number;
  planRef: React.RefObject<BookPlan>;
  deferredBookSource: { chapters: Chapter[]; planKey: string; } | null;
  deferredSource: LayoutSource;
  deferredResources: Resource[];
  rawDeferredConfig: PostextConfig;
  deferredConfig: PostextConfig;
  layoutWorker: LayoutWorkerApi;
  rebuildKey: number;
  setRebuildKey: React.Dispatch<React.SetStateAction<number>>;
  fontGate: FontGate;
  setDoc: React.Dispatch<React.SetStateAction<ShownDoc | null>>;
  heldDocsRef: React.RefObject<Map<string, HeldChapterDoc>>;
  stitchedRef: React.RefObject<StitchedBook | null>;
  callbacksRef: React.RefObject<{ onGeneratingChange: ((generating: boolean) => void) | undefined; onPageCountChange: ((count: number, firstContentPage: number, pageNumbers: readonly number[], book?: BookPageMap) => void) | undefined; onCurrentPageChange: ((index: number) => void) | undefined; onSpreadChange: ((pages: readonly number[]) => void) | undefined; onBindingChange: ((rightToLeft: boolean) => void) | undefined; }>;
}

export function useFolioBuild(deps: UseFolioBuildDeps) {
  const {
    dispatch, sharedDocRef, sharedDocSourceRef, chapterDocsRef, chaptersRef, deferredBookVersion,
    planRef, deferredBookSource, deferredSource, deferredResources, rawDeferredConfig,
    deferredConfig, layoutWorker, rebuildKey, setRebuildKey, fontGate, setDoc, heldDocsRef,
    stitchedRef, callbacksRef
  } = deps;
  // BUILD: the same documents the canvas lays out, under the same cache keys.
  useEffect(() => {
    let cancelled = false;
    const { onGeneratingChange: generating, onPageCountChange: counted } = callbacksRef.current;
    // The text decides some faces too (a comic page letters in its own).
    const fontText = deferredBookSource ? deferredBookSource.chapters.map((c) => c.markdown) : deferredSource.book.markdown;
    // Each missing face holds the build once, as in the canvas (#659).
    if (typeof document !== 'undefined' && document.fonts) {
      if (fontGate.pending(deferredConfig, fontText).length > 0) {
        generating?.(true);
        fontGate.wait(deferredConfig, fontText).then(() => {
          if (!cancelled) setRebuildKey((k) => k + 1);
        });
        return () => {
          cancelled = true;
        };
      }
    }
    if (!verticalTwinsSettled(deferredConfig, fontText)) {
      loadVerticalTwins(deferredConfig, fontText).then((added) => {
        if (added && !cancelled) setRebuildKey((k) => k + 1);
      });
    }
    // Stand-in faces (#688), as in the canvas.
    if (!standInsSettled(deferredConfig, fontText)) {
      declareStandIns(deferredConfig, fontText).then((added) => {
        if (added && !cancelled) setRebuildKey((k) => k + 1);
      });
    }
    generating?.(true);

    const run = async () => {
      if (deferredBookSource) {
        const snapshotChapters = deferredBookSource.chapters;
        const result = await buildBookChapters({
          chapters: snapshotChapters,
          plan: planRef.current,
          config: deferredConfig,
          rawConfig: rawDeferredConfig,
          resources: deferredResources,
          held: heldDocsRef.current,
          build: layoutWorker.build,
          cancelled: () => cancelled,
        });
        if (!result) return;
        heldDocsRef.current = result.held;
        const stitched = stitchDocuments(result.built);
        if (!stitched) return;
        stitchedRef.current = stitched;
        chapterDocsRef.current = new Map([...result.held].map(([id, h]) => [id, { doc: h.doc, source: h.source }]));
        sharedDocRef.current = stitched.doc;
        sharedDocSourceRef.current = composeBookMemo(snapshotChapters);
        for (const layout of result.records) dispatch({ type: 'SET_CHAPTER_LAYOUT', payload: layout });
        dispatch({ type: 'BUMP_DOC_VERSION' });
        setDoc({ doc: stitched.doc, pageChapters: stitched.pageChapters, chapter: -1, book: deferredBookVersion });
        counted?.(
          stitched.doc.pages.length,
          leadingBlankPageCount(stitched.doc),
          stitched.doc.pages.map((p) => p.pageNumberValue),
          { pageChapters: stitched.pageChapters, chapterFirstPages: stitched.chapterFirstPages },
        );
        return;
      }
      const source = deferredSource.book;
      const built = await layoutWorker.build(
        { markdown: source.markdown, metadata: source.metadata, resources: deferredResources, continuation: deferredSource.continuation, ...planContent(deferredSource.plan) },
        deferredConfig,
        {
          cacheKey: layoutCacheKey({
            markdown: source.markdown,
            metadata: source.metadata,
            config: deferredConfig,
            resources: deferredResources,
            continuation: deferredSource.continuation,
            continuationKey: deferredSource.plan.continuationKey,
            outlineKey: deferredSource.plan.outlineKey,
          }),
        },
      );
      if (cancelled) return;
      stitchedRef.current = null;
      chapterDocsRef.current = new Map();
      sharedDocRef.current = built;
      sharedDocSourceRef.current = source;
      const layout = chapterLayoutFromDoc(built, deferredSource.plan, { markdown: deferredSource.chapterMarkdown, config: rawDeferredConfig, resources: deferredResources });
      if (layout) dispatch({ type: 'SET_CHAPTER_LAYOUT', payload: layout });
      dispatch({ type: 'BUMP_DOC_VERSION' });
      setDoc({
        doc: built,
        pageChapters: null,
        chapter: Math.max(0, chaptersRef.current.findIndex((c) => c.id === deferredSource.chapterId)),
        extraPages: pagesAround(built, planRef.current, deferredSource.chapterId),
        book: deferredBookVersion,
      });
      counted?.(built.pages.length, leadingBlankPageCount(built), built.pages.map((p) => p.pageNumberValue));
    };
    run()
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        console.error('[FolioPreview] Layout error:', err);
      })
      .finally(() => {
        if (!cancelled) generating?.(false);
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSource, deferredBookSource, deferredResources, deferredConfig, rawDeferredConfig, deferredBookVersion, rebuildKey, fontGate, dispatch, sharedDocRef, sharedDocSourceRef, chapterDocsRef, layoutWorker]);
  return {
  };
}
