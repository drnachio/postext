'use client';

import { forwardRef, useDeferredValue, useEffect, useImperativeHandle, useMemo, useRef, useState } from 'react';
import { createFolioFromDocument, type FolioDocumentViewer, type FolioInteraction, type FolioLabels } from 'postext-folio';
import { resolveColorValue, resolveDebugConfig, resolveDiagramStyleConfig, type PostextConfig, type VDTDocument } from 'postext';
import { useBookPlan, useSandboxChapterDocsRef, useSandboxDispatch, useSandboxDocRef, useSandboxDocSourceRef, useSandboxSelector, useLayoutSource } from '../context/SandboxContext';
import { composeBookMemo } from '../book/compose';
import { buildBookChapters, type HeldChapterDoc } from '../book/buildBook';
import { layoutCacheKey } from '../book/layoutKeys';
import { chapterLayoutFromDoc, leadingBlankPageCount } from '../book/pagination';
import { stitchDocuments, type StitchedBook } from '../book/stitch';
import { ensureConfigFontsLoaded, getConfigFontSpecs, loadVerticalTwins, verticalTwinsSettled } from '../controls/fontLoader';
import { ensureResourceImages } from '../controls/resourceImages';
import { getBlob } from '../storage/blobStore';
import { useLayoutWorker } from '../worker/useLayoutWorker';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { defaultDocumentLocale } from './CanvasPreview/layoutUtils';
import type { BookPageMap } from './usePageHashSync';
import { FolioLoading } from './FolioLoading';
import { useFolioSelection } from './useFolioSelection';

interface FolioPreviewProps {
  /** What the left button does on the book. */
  interaction?: FolioInteraction;
  onGeneratingChange?: (generating: boolean) => void;
  /** After every layout: the page count, the first page with content, the
   *  book page number of every page and, for the whole book, the chapter
   *  of every page. */
  onPageCountChange?: (count: number, firstContentPage: number, pageNumbers: readonly number[], book?: BookPageMap) => void;
  onCurrentPageChange?: (index: number) => void;
  /** The pages of the spread the book is sent to (as soon as it is sent,
   *  and again once its leaves have landed). */
  onSpreadChange?: (pages: readonly number[]) => void;
  /** Whether the book is bound on the right (its leaves turn leftward). */
  onBindingChange?: (rightToLeft: boolean) => void;
}

export interface FolioPreviewHandle {
  jumpToPage: (pageIndex: number) => void;
  /** Turns the book to the spread holding page `pageIndex`: leaf by leaf
   *  to a near one, the whole block of leaves in one move to a far one. */
  turnToPage: (pageIndex: number) => void;
  prev: () => void;
  next: () => void;
  /** Eases the view back to the one the settings give. */
  resetView: () => void;
  /** The view as it is seen now, in degrees; null without the 3D book. */
  getView: () => { tilt: number; yaw: number } | null;
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

/** The scanned desk textures the site serves (apps/web/public). */
const FOLIO_TEXTURES = '/folio/textures';

const fill = (template: string, values: Record<string, string | number>) =>
  template.replace(/__(\w+)__/g, (m, key: string) => (key in values ? String(values[key]) : m));

/**
 * The book in 3D (`postext-folio`): the print layout the canvas shows —
 * the active chapter after the chapters before it, or under `canvasScope:
 * 'book'` every chapter stitched into one document — laid on a desk in
 * spreads, its leaves turned by hand. Pages are painted at the size they
 * are shown, only around the open spread.
 */
export const FolioPreview = forwardRef<FolioPreviewHandle, FolioPreviewProps>(function FolioPreview({ interaction = 'hand', onGeneratingChange, onPageCountChange, onCurrentPageChange, onSpreadChange, onBindingChange }, ref) {
  const dispatch = useSandboxDispatch();
  const labels = useSandboxSelector((s) => s.labels);
  const sharedDocRef = useSandboxDocRef();
  const sharedDocSourceRef = useSandboxDocSourceRef();
  const chapterDocsRef = useSandboxChapterDocsRef();
  const layoutSource = useLayoutSource();
  const config = useSandboxSelector((s) => s.config);
  // How the book is presented (paper, binding, desk, light): handed to the
  // viewer as it changes, never laid out.
  const folioConfig = config.folio;
  const folioConfigRef = useRef(folioConfig);
  folioConfigRef.current = folioConfig;
  const resources = useSandboxSelector((s) => s.resources);
  // The picture on the spine (none on a saddle stitch): its stored image,
  // handed to the viewer as an object URL.
  const spineId = folioConfig?.binding?.type === 'saddleStitch' ? undefined : folioConfig?.binding?.spineImage;
  const spineFileId = useMemo(() => {
    const r = spineId ? resources.find((x) => x.id === spineId) : undefined;
    return r?.bitmap?.fileId ?? r?.svg?.fileId;
  }, [resources, spineId]);
  const [spineUrl, setSpineUrl] = useState<string | undefined>(undefined);
  const spineUrlRef = useRef(spineUrl);
  spineUrlRef.current = spineUrl;
  useEffect(() => {
    if (!spineFileId) {
      setSpineUrl(undefined);
      return;
    }
    let live = true;
    let url: string | undefined;
    void getBlob(spineFileId).then((rec) => {
      if (!live || !rec) return;
      url = URL.createObjectURL(new Blob([rec.bytes], { type: rec.contentType }));
      setSpineUrl(url);
    });
    return () => {
      live = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [spineFileId]);
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
  const paintedKeyRef = useRef(paintKey);
  const [opened, setOpened] = useState(false);
  const interactionRef = useRef(interaction);
  interactionRef.current = interaction;
  // The document the viewer shows, for the page interaction.
  const viewerVdtRef = useRef<VDTDocument | null>(null);
  viewerVdtRef.current = shownDoc?.doc ?? null;
  const selection = useFolioSelection({
    viewerRef,
    docRef: viewerVdtRef,
    stitchedRef,
    chapterDocsRef,
    sourceRef: sharedDocSourceRef,
    interactionRef,
    docKey: shownDoc,
  });
  const selectionRef = useRef(selection);
  selectionRef.current = selection;
  const callbacksRef = useRef({ onGeneratingChange, onPageCountChange, onCurrentPageChange, onSpreadChange, onBindingChange });
  callbacksRef.current = { onGeneratingChange, onPageCountChange, onCurrentPageChange, onSpreadChange, onBindingChange };

  useImperativeHandle(ref, () => ({
    jumpToPage: (pageIndex) => {
      // A restored or linked position opens there; the reader turns pages.
      if (viewerRef.current) viewerRef.current.goToPage(pageIndex, { instant: true });
      else pendingJumpRef.current = pageIndex;
    },
    turnToPage: (pageIndex) => {
      const viewer = viewerRef.current;
      if (!viewer) {
        pendingJumpRef.current = pageIndex;
        return;
      }
      viewer.goToPage(pageIndex);
    },
    prev: () => viewerRef.current?.prev(),
    next: () => viewerRef.current?.next(),
    resetView: () => viewerRef.current?.resetView(),
    getView: () => viewerRef.current?.getView() ?? null,
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
        { markdown: source.markdown, metadata: source.metadata, resources: deferredResources, continuation: deferredSource.continuation, outline: deferredSource.plan.outline, ...(deferredSource.plan.citations ? { citations: deferredSource.plan.citations } : {}) },
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
    callbacksRef.current.onBindingChange?.(doc.binding === 'right');
    let viewer = viewerRef.current;
    if (!viewer) {
      const at = pendingJumpRef.current ?? leadingBlankPageCount(doc);
      pendingJumpRef.current = null;
      viewer = createFolioFromDocument(host, doc, {
        at,
        mode,
        pageNegative,
        // The page is in the URL; the count is only announced.
        showCount: false,
        // The tab's own bar turns the pages (and takes a page number).
        controls: false,
        labels: folioLabelsRef.current,
        interaction: interactionRef.current,
        appearance: { folio: folioConfigRef.current, textureBaseUrl: FOLIO_TEXTURES, spineImage: spineUrlRef.current },
        alt: (i) => fill(pageAltRef.current, { page: viewerDocRef.current?.doc.pages[i]?.pageNumberValue ?? i + 1 }),
        decorate: (index, ctx) => selectionRef.current.decorate(index, ctx),
        onTarget: (state) => {
          callbacksRef.current.onSpreadChange?.(state.pages);
          selectionRef.current.onSpread();
        },
        onChange: (state) => {
          callbacksRef.current.onSpreadChange?.(state.pages);
          selectionRef.current.onSpread();
          const page = state.pages[state.pages.length - 1];
          if (page !== undefined) callbacksRef.current.onCurrentPageChange?.(page);
        },
      });
      viewerRef.current = viewer;
      selectionRef.current.attach(viewer);
      callbacksRef.current.onSpreadChange?.(viewer.state.pages);
      paintedKeyRef.current = paintKey;
      setOpened(true);
      return;
    }
    // Images decoded since the pages were painted: paint them all again.
    // Otherwise a page that reads as before keeps its painting.
    const repaint = paintedKeyRef.current !== paintKey;
    paintedKeyRef.current = paintKey;
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
    viewer.setDocument(doc, { ...(same >= 0 ? { at: same } : {}), repaint });
    if (pendingJumpRef.current !== null) {
      viewer.goToPage(pendingJumpRef.current, { instant: true });
      pendingJumpRef.current = null;
    }
    // The page on show, in the new document's numbering, to the URL.
    callbacksRef.current.onSpreadChange?.(viewer.state.pages);
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
    viewerRef.current?.setInteraction(interaction);
  }, [interaction]);

  useEffect(() => {
    viewerRef.current?.setLabels(folioLabels);
  }, [folioLabels]);

  useEffect(() => {
    viewerRef.current?.setAppearance({ folio: folioConfig, spineImage: spineUrl });
  }, [folioConfig, spineUrl]);

  useEffect(() => () => {
    viewerRef.current?.dispose();
    viewerRef.current = null;
  }, []);

  return (
    <>
      <div
        ref={hostRef}
        className="h-full w-full overflow-hidden text-(--foreground)"
        style={{ backgroundColor: 'var(--surface)', '--postext-folio-accent': 'var(--brand)' } as React.CSSProperties}
      />
      {!opened && <FolioLoading />}
    </>
  );
});
