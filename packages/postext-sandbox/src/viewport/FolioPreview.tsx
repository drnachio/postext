'use client';

import { forwardRef, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createFolioFromDocument, type FolioDocumentViewer, type FolioLabels } from 'postext-folio';
import { resolveColorValue, resolveDebugConfig, resolveDiagramStyleConfig, type PostextConfig, type VDTDocument } from 'postext';
import { useBookPlan, useSandboxChapterDocsRef, useSandboxDispatch, useSandboxDocRef, useSandboxDocSourceRef, useSandboxSelector, useLayoutSource } from '../context/SandboxContext';
import { composeBookMemo } from '../book/compose';
import { buildBookChapters, type HeldChapterDoc } from '../book/buildBook';
import { layoutCacheKey } from '../book/layoutKeys';
import { chapterLayoutFromDoc, leadingBlankPageCount } from '../book/pagination';
import { stitchDocuments, type StitchedBook } from '../book/stitch';
import { ensureConfigFontsLoaded, getConfigFontSpecs, loadVerticalTwins, verticalTwinsSettled } from '../controls/fontLoader';
import { ensureResourceImages } from '../controls/resourceImages';
import { useLayoutWorker } from '../worker/useLayoutWorker';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { defaultDocumentLocale } from './CanvasPreview/layoutUtils';
import type { BookPageMap } from './usePageHashSync';

interface FolioPreviewProps {
  onGeneratingChange?: (generating: boolean) => void;
  /** After every layout: the page count, the first page with content, the
   *  book page number of every page and, for the whole book, the chapter
   *  of every page. */
  onPageCountChange?: (count: number, firstContentPage: number, pageNumbers: readonly number[], book?: BookPageMap) => void;
  onCurrentPageChange?: (index: number) => void;
}

export interface FolioPreviewHandle {
  jumpToPage: (pageIndex: number) => void;
  regenerate: () => void;
}

/** A laid-out document with what tells its pages apart across layouts:
 *  the chapter (position in the book) of every page of a whole-book
 *  document, or the one chapter of a chapter's. */
interface ShownDoc {
  doc: VDTDocument;
  pageChapters: readonly number[] | null;
  chapter: number;
}

/** Where page `index` of `from` lies in `to`: the page of the same chapter
 *  carrying the same number (indexes differ between a chapter's document
 *  and the whole book's, and shift with an edit); -1 when `to` has none. */
function samePage(from: ShownDoc, index: number, to: ShownDoc): number {
  const page = from.doc.pages[index];
  if (!page) return -1;
  const chapter = from.pageChapters?.[index] ?? from.chapter;
  return to.doc.pages.findIndex((p, i) =>
    (to.pageChapters?.[i] ?? to.chapter) === chapter
    && p.pageNumberValue === page.pageNumberValue
    && p.pageNumberFormat === page.pageNumberFormat);
}

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/__(\w+)__/g, (m, key: string) => (key in values ? String(values[key]) : m));

/**
 * The book in 3D (`postext-folio`): the print layout the canvas shows —
 * the active chapter after the chapters before it, or under `canvasScope:
 * 'book'` every chapter stitched into one document — laid on a desk in
 * spreads, its leaves turned by hand. Pages are painted at the size they
 * are shown, only around the open spread.
 */
export const FolioPreview = forwardRef<FolioPreviewHandle, FolioPreviewProps>(function FolioPreview({ onGeneratingChange, onPageCountChange, onCurrentPageChange }, ref) {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxSelector((s) => s.labels);
  const sharedDocRef = useSandboxDocRef();
  const sharedDocSourceRef = useSandboxDocSourceRef();
  const chapterDocsRef = useSandboxChapterDocsRef();
  const layoutSource = useLayoutSource();
  const config = useSandboxSelector((s) => s.config);
  const resources = useSandboxSelector((s) => s.resources);
  const locale = useSandboxSelector((s) => s.locale);
  const canvasScope = useSandboxSelector((s) => s.canvasScope);
  const chapters = useSandboxSelector((s) => s.chapters);
  const chaptersRef = useRef(chapters);
  chaptersRef.current = chapters;
  const compact = useCompactLayout();
  const plan = useBookPlan();
  const planRef = useRef(plan);
  planRef.current = plan;
  const planKey = useMemo(
    () => plan.chapters.map((p) => `${p.chapterId}|${p.paginated ? 1 : 0}|${p.continuationKey}|${p.outlineKey}|${p.continuation?.pageIndexOffset ?? ''}|${p.continuation?.pageNumbering?.startAt ?? ''}|${p.continuation?.bookPageCount ?? ''}`).join('\n'),
    [plan],
  );
  const bookSource = useMemo(() => (canvasScope === 'book' ? { chapters, planKey } : null), [canvasScope, chapters, planKey]);
  const deferredBookSource = useDeferredValue(bookSource);
  const deferredSource = useDeferredValue(layoutSource);
  const deferredResources = useDeferredValue(resources);
  const rawDeferredConfig = useDeferredValue(config);
  // The document's language when it names none: the app's (as on the canvas).
  const deferredConfig = useMemo((): PostextConfig => {
    if (rawDeferredConfig.bodyText?.hyphenation?.locale || rawDeferredConfig.locale) return rawDeferredConfig;
    return {
      ...rawDeferredConfig,
      bodyText: {
        ...rawDeferredConfig.bodyText,
        hyphenation: { ...rawDeferredConfig.bodyText?.hyphenation, locale: defaultDocumentLocale(locale) },
      },
    };
  }, [rawDeferredConfig, locale]);
  const layoutWorker = useLayoutWorker('preview');
  const [rebuildKey, setRebuildKey] = useState(0);
  const [shownDoc, setDoc] = useState<ShownDoc | null>(null);
  const viewerDocRef = useRef<ShownDoc | null>(null);
  const [paintKey, setPaintKey] = useState(0);
  const heldDocsRef = useRef<Map<string, HeldChapterDoc>>(new Map());
  const stitchedRef = useRef<StitchedBook | null>(null);
  const hostRef = useRef<HTMLDivElement>(null);
  const viewerRef = useRef<FolioDocumentViewer | null>(null);
  const pendingJumpRef = useRef<number | null>(null);
  const callbacksRef = useRef({ onGeneratingChange, onPageCountChange, onCurrentPageChange });
  callbacksRef.current = { onGeneratingChange, onPageCountChange, onCurrentPageChange };

  useImperativeHandle(ref, () => ({
    jumpToPage: (pageIndex) => {
      if (viewerRef.current) viewerRef.current.goToPage(pageIndex);
      else pendingJumpRef.current = pageIndex;
    },
    regenerate: () => setRebuildKey((k) => k + 1),
  }), []);

  // A face that lands after the first measurement: lay out again.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const onLoadingDone = () => setRebuildKey((k) => k + 1);
    document.fonts.addEventListener('loadingdone', onLoadingDone);
    return () => document.fonts.removeEventListener('loadingdone', onLoadingDone);
  }, []);

  // BUILD: the same documents the canvas lays out, under the same cache keys.
  useEffect(() => {
    let cancelled = false;
    const { onGeneratingChange: generating, onPageCountChange: counted } = callbacksRef.current;
    if (typeof document !== 'undefined' && document.fonts) {
      const missing = getConfigFontSpecs(deferredConfig).filter((s) => !document.fonts.check(s));
      if (missing.length > 0) {
        generating?.(true);
        ensureConfigFontsLoaded(deferredConfig).then(() => {
          if (!cancelled) setRebuildKey((k) => k + 1);
        });
        return () => {
          cancelled = true;
        };
      }
    }
    if (!verticalTwinsSettled(deferredConfig)) {
      loadVerticalTwins(deferredConfig).then((added) => {
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
        setDoc({ doc: stitched.doc, pageChapters: stitched.pageChapters, chapter: -1 });
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
        { markdown: source.markdown, metadata: source.metadata, resources: deferredResources, continuation: deferredSource.continuation, outline: deferredSource.plan.outline },
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
      setDoc({ doc: built, pageChapters: null, chapter: Math.max(0, chaptersRef.current.findIndex((c) => c.id === deferredSource.chapterId)) });
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
  }, [deferredSource, deferredBookSource, deferredResources, deferredConfig, rawDeferredConfig, rebuildKey, dispatch, sharedDocRef, sharedDocSourceRef, chapterDocsRef, layoutWorker]);

  // Resource images decoded after the pages were painted: paint them again.
  const diagramInkHex = useMemo((): string | null => {
    const ds = resolveDiagramStyleConfig(deferredConfig.diagramStyle);
    if (!ds.singleInk) return null;
    return resolveColorValue(ds.inkColor, deferredConfig.colorPalette, ds.inkColor).hex;
  }, [deferredConfig]);
  useEffect(() => {
    let cancelled = false;
    ensureResourceImages(deferredResources, diagramInkHex)
      .then((changed) => {
        if (!cancelled && changed) setPaintKey((k) => k + 1);
      })
      .catch(() => { /* leave placeholders */ });
    return () => {
      cancelled = true;
    };
  }, [deferredResources, diagramInkHex]);

  const pageNegative = useMemo(() => resolveDebugConfig(deferredConfig.debug).pageNegative.enabled, [deferredConfig]);
  const folioLabels = useMemo((): FolioLabels => ({
    region: labels.folioRegion,
    prev: labels.folioPrev,
    next: labels.folioNext,
    count: (pages) => {
      const numbers = sharedDocRef.current?.pages;
      const n = (i: number) => numbers?.[i]?.pageNumberValue ?? i + 1;
      return pages.length > 1
        ? fill(labels.folioPages, { from: n(pages[0]!), to: n(pages[pages.length - 1]!) })
        : fill(labels.folioPage, { page: n(pages[0] ?? 0) });
    },
  }), [labels.folioRegion, labels.folioPrev, labels.folioNext, labels.folioPages, labels.folioPage, sharedDocRef]);
  const folioLabelsRef = useRef(folioLabels);
  folioLabelsRef.current = folioLabels;
  const pageAltRef = useRef(labels.folioPageAlt);
  pageAltRef.current = labels.folioPageAlt;

  // The viewer: made with the first document (and again when the reading
  // mode or the page negative changes), fed every later one.
  const mode = compact ? 'single' : 'auto';
  useEffect(() => {
    const host = hostRef.current;
    if (!host || !shownDoc) return;
    const doc = shownDoc.doc;
    const before = viewerDocRef.current;
    viewerDocRef.current = shownDoc;
    let viewer = viewerRef.current;
    if (!viewer) {
      const at = pendingJumpRef.current ?? leadingBlankPageCount(doc);
      pendingJumpRef.current = null;
      viewer = createFolioFromDocument(host, doc, {
        at,
        mode,
        pageNegative,
        labels: folioLabelsRef.current,
        alt: (i) => fill(pageAltRef.current, { page: viewerDocRef.current?.doc.pages[i]?.pageNumberValue ?? i + 1 }),
        onChange: (state) => {
          const page = state.pages[state.pages.length - 1];
          if (page !== undefined) callbacksRef.current.onCurrentPageChange?.(page);
        },
      });
      viewerRef.current = viewer;
      return;
    }
    // The same page in the new layout (another scope, or an edit that
    // moved the pages), else the same position.
    // Either page of the open spread will do (the whole book's spread may
    // straddle two chapters, a chapter's document holds one of them).
    let same = -1;
    if (before && before !== shownDoc) {
      for (const open of viewer.state.pages) {
        same = samePage(before, open, shownDoc);
        if (same >= 0) break;
      }
    }
    viewer.setDocument(doc, same >= 0 ? { at: same } : {});
    if (pendingJumpRef.current !== null) {
      viewer.goToPage(pendingJumpRef.current);
      pendingJumpRef.current = null;
    }
    // The page on show, in the new document's numbering, to the URL.
    const shown = viewer.state.pages[viewer.state.pages.length - 1];
    if (shown !== undefined) callbacksRef.current.onCurrentPageChange?.(shown);
  }, [shownDoc, paintKey, mode, pageNegative]);

  // A new reading mode or page negative: a new viewer, on the same page.
  const modeKey = `${mode}|${pageNegative}`;
  const modeKeyRef = useRef(modeKey);
  useEffect(() => {
    if (modeKeyRef.current === modeKey) return;
    modeKeyRef.current = modeKey;
    const viewer = viewerRef.current;
    if (!viewer) return;
    pendingJumpRef.current = viewer.state.pages[0] ?? 0;
    viewer.dispose();
    viewerRef.current = null;
    setPaintKey((k) => k + 1);
  }, [modeKey]);

  useEffect(() => {
    viewerRef.current?.setLabels(folioLabels);
  }, [folioLabels]);

  useEffect(() => () => {
    viewerRef.current?.dispose();
    viewerRef.current = null;
  }, []);

  return (
    <div
      ref={hostRef}
      className="h-full w-full overflow-hidden text-(--foreground)"
      style={{ backgroundColor: 'var(--surface)', '--postext-folio-accent': 'var(--brand)' } as React.CSSProperties}
    />
  );
});
