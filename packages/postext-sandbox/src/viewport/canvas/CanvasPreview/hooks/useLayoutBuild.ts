// The canvas preview's build effect: a new document when the text, the
// configuration or a rebuild event changes (#1276: split out of
// CanvasPreview/index.tsx).
import { useRef, useEffect } from 'react';
import { verticalTwinsSettled, loadVerticalTwins, standInsSettled, declareStandIns } from '../../../../controls/fonts/fontLoader.js';
import { composeBookMemo } from '../../../../book/compose.js';
import { perfSpan, type PerfSpan } from '../../../../perf/marks.js';
import { buildBookChapters, type HeldChapterDoc } from '../../../../book/buildBook.js';
import { stitchDocuments, type StitchedBook } from '../../../../book/stitch.js';
import { leadingBlankPageCount, chapterLayoutFromDoc } from '../../../../book/pagination.js';
import { planContent } from '../../../../book/jumps.js';
import { layoutCacheKey } from '../../../../book/layoutKeys.js';
import type { BookPageMap } from '../../../usePageHashSync.js';
import type { SandboxAction } from '../../../../context/SandboxContext/state.js';
import type { VDTDocument, PostextConfig, Resource } from 'postext';
import type { ComposedBook, BookPlan, Chapter } from '../../../../book/types.js';
import type { ChapterDocument, LayoutSource } from '../../../../context/SandboxContext/hooks.js';
import type { LayoutWorkerApi } from '../../../../worker/useLayoutWorker.js';
import type { FontGate } from '../../../../controls/fonts/fontLoader/loading.js';
import type { FirstChapterDoc } from '../../../../covers/useAutoCover.js';

/** What useLayoutBuild takes from the canvas preview. */
export interface UseLayoutBuildDeps {
  onGeneratingChange: ((generating: boolean) => void) | undefined;
  onPageCountChange: ((count: number, firstContentPage: number, pageNumbers: readonly number[], firstPageRecto: boolean, book?: BookPageMap) => void) | undefined;
  dispatch: React.Dispatch<SandboxAction>;
  sharedDocRef: React.MutableRefObject<VDTDocument | null>;
  sharedDocSourceRef: React.MutableRefObject<ComposedBook | null>;
  chapterOfPageRef: React.RefObject<((pageIndex: number) => number) | null>;
  pageSourceRef: React.RefObject<((pageIndex: number) => ComposedBook | null) | null>;
  docRef: React.RefObject<VDTDocument | null>;
  stitchedRef: React.RefObject<StitchedBook | null>;
  heldDocsRef: React.RefObject<Map<string, HeldChapterDoc>>;
  lastStitchedDocsRef: React.RefObject<VDTDocument[]>;
  chapterDocsRef: React.MutableRefObject<Map<string, ChapterDocument>>;
  planRef: React.RefObject<BookPlan>;
  deferredBookSource: { chapters: Chapter[]; planKey: string; } | null;
  paintSpanRef: React.RefObject<PerfSpan | null>;
  lastBuiltChapterRef: React.RefObject<string | null>;
  perfInputsRef: React.RefObject<{ source: unknown; resources: unknown; config: unknown; rebuildKey: number; }>;
  deferredSource: LayoutSource;
  builtSourceRef: React.RefObject<ComposedBook | null>;
  deferredResources: Resource[];
  rawDeferredConfig: PostextConfig;
  deferredConfig: PostextConfig;
  layoutWorker: LayoutWorkerApi;
  rebuildKey: number;
  setRebuildKey: React.Dispatch<React.SetStateAction<number>>;
  fontGate: FontGate;
  appliedRebuildKeyRef: React.RefObject<number>;
  setDocVersion: React.Dispatch<React.SetStateAction<number>>;
  setPaintKey: React.Dispatch<React.SetStateAction<number>>;
  firstChapterDocRef: React.RefObject<FirstChapterDoc | null>;
  paintedRebuildKeyRef: React.RefObject<number>;
}

export function useLayoutBuild(deps: UseLayoutBuildDeps) {
  const {
    onGeneratingChange, onPageCountChange, dispatch, sharedDocRef, sharedDocSourceRef,
    chapterOfPageRef, pageSourceRef, docRef, stitchedRef, heldDocsRef, lastStitchedDocsRef,
    chapterDocsRef, planRef, deferredBookSource, paintSpanRef, lastBuiltChapterRef, perfInputsRef,
    deferredSource, builtSourceRef, deferredResources, rawDeferredConfig, deferredConfig,
    layoutWorker, rebuildKey, setRebuildKey, fontGate, appliedRebuildKeyRef, setDocVersion,
    setPaintKey, firstChapterDocRef, paintedRebuildKeyRef
  } = deps;
  // BUILD effect — produces a new VDT document when the markdown, config, or
  // a rebuild-invalidating event (fonts loaded, math ready) changes. Does
  // NOT depend on container size: VDT coordinates are in PT and independent
  // of viewport dimensions. Resize only rescales the canvas at paint time.
  const onGeneratingChangeRef = useRef(onGeneratingChange);
  onGeneratingChangeRef.current = onGeneratingChange;
  const onPageCountChangeRef = useRef(onPageCountChange);
  onPageCountChangeRef.current = onPageCountChange;
  useEffect(() => {
    let cancelled = false;
    // Gate on main-thread font availability — the canvas repaint path still
    // uses `fillText` against the document's FontFaceSet, so we must hold off
    // the first build until faces are loaded. The worker loads its own copy
    // of the same fonts separately (see `useLayoutWorker`).
    // The text decides some faces too (a comic page letters in its own).
    const fontText = deferredBookSource ? deferredBookSource.chapters.map((c) => c.markdown) : deferredSource.book.markdown;
    // Each missing face holds the build once (#659): this effect runs
    // again when the wait ends, and a face the wait ended without (a file
    // that fails, or one the wait did not ask for) would hold it again,
    // wait after wait, with no build ever started.
    if (typeof document !== 'undefined' && document.fonts) {
      if (fontGate.pending(deferredConfig, fontText).length > 0) {
        onGeneratingChangeRef.current?.(true);
        fontGate.wait(deferredConfig, fontText).then(() => {
          if (!cancelled) setRebuildKey((k) => k + 1);
        });
        return () => {
          cancelled = true;
        };
      }
    }

    // Vertical text: the canvas paints brackets and punctuation with the
    // fonts' vertical forms, through twin faces loaded once per family; the
    // pages are painted again when they land (with the fallbacks meanwhile).
    if (!verticalTwinsSettled(deferredConfig, fontText)) {
      loadVerticalTwins(deferredConfig, fontText).then((added) => {
        if (added && !cancelled) setRebuildKey((k) => k + 1);
      });
    }

    // A bold or an italic a family has no file for is painted with the
    // family's own face, declared beside its faces (#688): when the wait
    // above had nothing to load they are declared here, and the pages
    // painted again once they are in.
    if (!standInsSettled(deferredConfig, fontText)) {
      declareStandIns(deferredConfig, fontText).then((added) => {
        if (added && !cancelled) setRebuildKey((k) => k + 1);
      });
    }

    // Track rebuildKey so worker fonts are re-registered when main-thread
    // fonts land after the first build. The worker's own cache is keyed on
    // measurement-relevant config bits, so unchanged builds stay cheap.
    appliedRebuildKeyRef.current = rebuildKey;

    onGeneratingChangeRef.current?.(true);
    paintSpanRef.current?.end({ superseded: true });

    if (deferredBookSource) {
      // The whole book: every chapter after the pages the ones before it
      // came to, kept from the last build when nothing it depends on
      // changed, then stitched into one document.
      const snapshotChapters = deferredBookSource.chapters;
      const currentPlan = planRef.current;
      const composition = composeBookMemo(snapshotChapters);
      paintSpanRef.current = perfSpan('canvas.book→paint', { chapters: snapshotChapters.length, md: composition.markdown.length });
      (async () => {
        const result = await buildBookChapters({
          chapters: snapshotChapters,
          plan: currentPlan,
          config: deferredConfig,
          rawConfig: rawDeferredConfig,
          resources: deferredResources,
          held: heldDocsRef.current,
          build: layoutWorker.build,
          cancelled: () => cancelled,
        });
        if (!result) return;
        const { held: next, built, records } = result;
        heldDocsRef.current = next;
        const firstChapter = snapshotChapters[0];
        const firstDoc = firstChapter ? next.get(firstChapter.id)?.doc : undefined;
        if (firstChapter && firstDoc) firstChapterDocRef.current = { chapterId: firstChapter.id, markdown: firstChapter.markdown, doc: firstDoc };
        chapterDocsRef.current = new Map([...next].map(([id, h]) => [id, { doc: h.doc, source: h.source }]));
        pageSourceRef.current = (pageIndex) => {
          const id = stitchedRef.current?.pageChapterIds[pageIndex];
          return id ? next.get(id)?.source ?? null : null;
        };
        const previous = lastStitchedDocsRef.current;
        const same = previous.length === built.length && previous.every((d, i) => d === built[i]!.doc);
        if (!same) {
          const stitched = stitchDocuments(built);
          if (!stitched) return;
          lastStitchedDocsRef.current = built.map((b) => b.doc);
          stitchedRef.current = stitched;
          chapterOfPageRef.current = (pageIndex) => stitched.pageChapters[pageIndex] ?? -1;
          lastBuiltChapterRef.current = null;
          docRef.current = stitched.doc;
          builtSourceRef.current = composition;
          sharedDocRef.current = stitched.doc;
          sharedDocSourceRef.current = composition;
        }
        for (const layout of records) dispatch({ type: 'SET_CHAPTER_LAYOUT', payload: layout });
        if (same) {
          // Every chapter kept: the pages are laid out as before, but a
          // build a rebuildKey bump asked for (fonts landed after the first
          // measurement) must still reach the bitmaps.
          if (paintedRebuildKeyRef.current !== rebuildKey) {
            paintedRebuildKeyRef.current = rebuildKey;
            setPaintKey((k) => k + 1);
            return;
          }
          paintSpanRef.current?.end({ unchanged: true });
          paintSpanRef.current = null;
          return;
        }
        const doc = docRef.current!;
        paintedRebuildKeyRef.current = rebuildKey;
        dispatch({ type: 'BUMP_DOC_VERSION' });
        setDocVersion((v) => v + 1);
        onPageCountChangeRef.current?.(
          doc.pages.length,
          leadingBlankPageCount(doc),
          doc.pages.map((p) => p.pageNumberValue),
          true,
          { pageChapters: stitchedRef.current!.pageChapters, chapterFirstPages: stitchedRef.current!.chapterFirstPages },
        );
      })()
        .catch((err: unknown) => {
          if ((err as { name?: string } | null)?.name === 'AbortError') return;
          console.error('[CanvasPreview] Layout error:', err);
        })
        .finally(() => {
          if (!cancelled) onGeneratingChangeRef.current?.(false);
        });
      return () => {
        cancelled = true;
      };
    }

    const source = deferredSource.book;
    const switching = lastBuiltChapterRef.current !== deferredSource.chapterId;
    const prevInputs = perfInputsRef.current;
    const changed = [
      prevInputs.source !== deferredSource && 'source',
      prevInputs.resources !== deferredResources && 'resources',
      prevInputs.config !== deferredConfig && 'config',
      prevInputs.rebuildKey !== rebuildKey && 'rebuildKey',
    ].filter(Boolean).join('+');
    perfInputsRef.current = { source: deferredSource, resources: deferredResources, config: deferredConfig, rebuildKey };
    paintSpanRef.current = perfSpan(switching ? 'canvas.chapter→paint' : 'canvas.edit→paint', {
      chapter: deferredSource.chapterId.slice(-24),
      changed,
      offset: deferredSource.continuation?.pageIndexOffset,
      startAt: deferredSource.continuation?.pageNumbering?.startAt,
      ck: deferredSource.plan.continuationKey.slice(0, 16),
      ok: deferredSource.plan.outlineKey.slice(0, 8),
      md: source.markdown.length,
    });
    layoutWorker.build(
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
    )
      .then((doc) => {
        if (cancelled) return;
        lastBuiltChapterRef.current = deferredSource.chapterId;
        if (deferredSource.plan.index === 0) {
          firstChapterDocRef.current = { chapterId: deferredSource.chapterId, markdown: deferredSource.chapterMarkdown, doc };
        }
        stitchedRef.current = null;
        lastStitchedDocsRef.current = [];
        chapterOfPageRef.current = null;
        pageSourceRef.current = null;
        chapterDocsRef.current = new Map();
        docRef.current = doc;
        builtSourceRef.current = source;
        sharedDocRef.current = doc;
        sharedDocSourceRef.current = source;
        // Record the chapter's page count so the chapters after it know
        // where they start (keyed on the state config, not the derived one).
        const layout = chapterLayoutFromDoc(doc, deferredSource.plan, { markdown: deferredSource.chapterMarkdown, config: rawDeferredConfig, resources: deferredResources });
        if (layout) dispatch({ type: 'SET_CHAPTER_LAYOUT', payload: layout });
        dispatch({ type: 'BUMP_DOC_VERSION' });
        setDocVersion((v) => v + 1);
        onPageCountChangeRef.current?.(
          doc.pages.length,
          leadingBlankPageCount(doc),
          doc.pages.map((p) => p.pageNumberValue),
          (doc.pageIndexOffset ?? 0) % 2 === 0,
        );
      })
      .catch((err: unknown) => {
        if ((err as { name?: string } | null)?.name === 'AbortError') return;
        console.error('[CanvasPreview] Layout error:', err);
      })
      .finally(() => {
        if (!cancelled) onGeneratingChangeRef.current?.(false);
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredSource, deferredBookSource, deferredResources, deferredConfig, rawDeferredConfig, rebuildKey, fontGate, dispatch, sharedDocRef, sharedDocSourceRef, layoutWorker, chapterDocsRef]);
  return {
  };
}
