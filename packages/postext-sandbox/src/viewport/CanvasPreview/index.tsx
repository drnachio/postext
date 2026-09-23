'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState, useDeferredValue, useMemo } from 'react';
import { useBookPlan, useSandboxChapterDocsRef, useSandboxDispatch, useSandboxDocRef, useSandboxDocSourceRef, useSandboxSelector, useLayoutSource, type EditorSelection } from '../../context/SandboxContext';
import { composeBookMemo, toBookSelection } from '../../book/compose';
import { chapterLayoutFromDoc, leadingBlankPageCount } from '../../book/pagination';
import { stitchDocuments, type StitchedBook, type StitchedChapter } from '../../book/stitch';
import type { ChapterLayout, ComposedBook } from '../../book/types';
import { renderPageToCanvas, resolveDebugConfig, resolveDiagramStyleConfig, resolveColorValue } from 'postext';
import type { LayoutContinuation, NumeralStyle, VDTDocument, PostextConfig, RenderPageOptions } from 'postext';
import { clearOverlay, drawOverlay } from './overlay';
import { findResourceLocation } from './geometry';
import type { BookPageMap } from '../usePageHashSync';
import { ensureConfigFontsLoaded, getConfigFontSpecs } from '../../controls/fontLoader';
import { ensureResourceImages } from '../../controls/resourceImages';
import { useLayoutWorker } from '../../worker/useLayoutWorker';
import { layoutCacheKey, stableStringify } from '../../book/layoutKeys';
import { perfSpan, type PerfSpan } from '../../perf/marks';
import {
  LOCALE_TO_HYPHENATION,
  PAGE_GAP,
  PAGE_PADDING,
  type FitMode,
  type GeomSnapshot,
  type ViewMode,
} from './layoutUtils';
import { findCaretBlockIdx } from './caret';

const NO_SELECTION: EditorSelection = { from: -1, to: -1, head: -1 };
/** Painted page bitmaps kept at once (~16 pages of 21×28 cm at 300 dpi);
 *  beyond it the pages farthest from the reader are released and repainted
 *  on their next entry. */
const PAINTED_PAGES_BUDGET_BYTES = 512 * 1024 * 1024;
/** Bitmaps are painted at the size the page is shown (× device pixels),
 *  never above the page's own resolution. A repaint is worth it when the
 *  page grows past this factor (it would blur) or shrinks below the other
 *  (the bitmap would waste memory). */
const BITMAP_GROW_REPAINT = 1.15;
const BITMAP_SHRINK_REPAINT = 0.5;
/** Never trim below this many pages, whatever their size. */
const MIN_PAINTED_PAGES = 6;
import { buildPagesDom } from './pageDom';
import { usePageNavigator } from '../usePageNavigator';

interface CanvasPreviewProps {
  zoom: number;
  viewMode: ViewMode;
  fitMode: FitMode;
  onGeneratingChange?: (generating: boolean) => void;
  /** After every layout: the page count and the first page with content
   *  (the ones before it are parity padding) — and, for the whole book,
   *  which chapter every page belongs to. */
  onPageCountChange?: (count: number, firstContentPage: number, pageNumbers: readonly number[], firstPageRecto: boolean, book?: BookPageMap) => void;
  onCurrentPageChange?: (index: number) => void;
}

export interface CanvasPreviewHandle {
  regenerate: () => void;
  jumpToPage: (pageIndex: number) => void;
}

/** One chapter's document as last built for the whole-book canvas, with
 *  the key of everything it was built from (a hit spares the worker). */
interface HeldChapterDoc {
  key: string;
  doc: VDTDocument;
  source: ComposedBook;
}

/**
 * Canvas preview that renders the document using the postext layout engine.
 * Builds a VDT at the configured DPI (default 300), then lazily renders
 * only the pages visible in the scroll viewport via IntersectionObserver.
 *
 * The document is the active chapter (continued after the chapters before
 * it) or, under `canvasScope: 'book'`, the whole book: every chapter laid
 * out on its own, in order, each after the pages the ones before it came
 * to, and the documents stitched into one (`book/stitch.ts`). A chapter
 * whose inputs did not change is kept from the last build, so an edit
 * re-lays out its chapter and the ones after it only when their first
 * page moved.
 */
export const CanvasPreview = forwardRef<CanvasPreviewHandle, CanvasPreviewProps>(
function CanvasPreview({ zoom, viewMode, fitMode, onGeneratingChange, onPageCountChange, onCurrentPageChange }, ref) {
  const dispatch = useSandboxDispatch();
  const sharedDocRef = useSandboxDocRef();
  const layoutSource = useLayoutSource();
  const { chapterId: activeChapterId } = layoutSource;
  const sharedDocSourceRef = useSandboxDocSourceRef();
  const config = useSandboxSelector((s) => s.config);
  const resources = useSandboxSelector((s) => s.resources);
  const locale = useSandboxSelector((s) => s.locale);
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const editorSelection = useSandboxSelector((s) => s.selection);
  const editorFocused = useSandboxSelector((s) => s.editorFocused);
  const resourceSelection = useSandboxSelector((s) => s.resourceSelection);
  const containerRef = useRef<HTMLDivElement>(null);
  // Refs used by click handlers so changing panel/dispatch identity doesn't
  // force a full DOM rebuild of the page slots.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const activePanelRef = useRef(activePanel);
  activePanelRef.current = activePanel;
  const resourcesRef = useRef(resources);
  resourcesRef.current = resources;
  // Whole-book mode: the chapter of every page of the stitched document,
  // and the book a page's offsets belong to (its chapter's).
  const chapterOfPageRef = useRef<((pageIndex: number) => number) | null>(null);
  const pageSourceRef = useRef<((pageIndex: number) => ComposedBook | null) | null>(null);
  const navigateRef = usePageNavigator(chapterOfPageRef);
  const docRef = useRef<VDTDocument | null>(null);
  const stitchedRef = useRef<StitchedBook | null>(null);
  const heldDocsRef = useRef<Map<string, HeldChapterDoc>>(new Map());
  const lastStitchedDocsRef = useRef<VDTDocument[]>([]);
  // Pages whose overlay was last drawn with a selection (whole-book mode
  // redraws the active chapter's pages only; the others are cleared once).
  const drawnOverlaysRef = useRef<Set<number>>(new Set());
  const chapterDocsRef = useSandboxChapterDocsRef();
  const canvasScope = useSandboxSelector((s) => s.canvasScope);
  const chapters = useSandboxSelector((s) => s.chapters);
  const plan = useBookPlan();
  const planRef = useRef(plan);
  planRef.current = plan;
  // What a whole-book build depends on besides text, config and resources,
  // as a string: the plan is re-derived (new objects) on every layout
  // record, and only its content should start a build.
  const planKey = useMemo(
    () => plan.chapters.map((p) => `${p.chapterId}|${p.paginated ? 1 : 0}|${p.continuationKey}|${p.outlineKey}|${p.continuation?.pageIndexOffset ?? ''}|${p.continuation?.pageNumbering?.startAt ?? ''}`).join('\n'),
    [plan],
  );
  const bookSource = useMemo(() => (canvasScope === 'book' ? { chapters, planKey } : null), [canvasScope, chapters, planKey]);
  const deferredBookSource = useDeferredValue(bookSource);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const canvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const overlayMapRef = useRef<Map<number, SVGSVGElement>>(new Map());
  const renderedPagesRef = useRef<Set<number>>(new Set());
  // Rendered pages whose bitmap shows an older document. A rebuild repaints
  // only what is in view and marks the rest stale, to be repainted when
  // they next scroll near — a chapter's worth of 300 dpi pages repainted
  // at once blocks the main thread for about a second per rebuild.
  const stalePagesRef = useRef<Set<number>>(new Set());
  // Pages within the observer's margin of the viewport right now.
  const visiblePagesRef = useRef<Set<number>>(new Set());
  const lastGeomRef = useRef<GeomSnapshot | null>(null);
  // Tracks the docVersion last painted into the canvas bitmaps so we can
  // skip bitmap repaints on pure CSS-size changes (window/sidebar resize).
  // The canvas internal pixel size is fixed at page dimensions, so browser
  // scaling handles size changes with no paint cost.
  const lastPaintedDocVersionRef = useRef(-1);
  // Bitmap pixels per page pixel of the painted pages, and the options the
  // last layout painted with (so a rescale can repaint without React).
  const bitmapScaleRef = useRef(1);
  const renderOptsRef = useRef<RenderPageOptions>({});
  const paintOptions = (): RenderPageOptions => ({ ...renderOptsRef.current, scale: bitmapScaleRef.current });
  const paintOptionsRef = useRef(paintOptions);
  paintOptionsRef.current = paintOptions;
  /** The scale a page shown `displayWidth` CSS px wide wants, capped at
   *  the page's own resolution. */
  const wantedBitmapScale = (displayWidth: number, pageWidthPx: number): number => {
    const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
    return Math.min(1, (displayWidth * dpr) / pageWidthPx);
  };
  const needsRescale = (wanted: number): boolean => {
    const current = bitmapScaleRef.current;
    return wanted > current * BITMAP_GROW_REPAINT || wanted < current * BITMAP_SHRINK_REPAINT;
  };
  // Dev perf: the span from a build's start to the paint of its pages, and
  // the chapter the last build was for (a build of another chapter is a
  // chapter switch; of the same one, an edit).
  const paintSpanRef = useRef<PerfSpan | null>(null);
  const lastBuiltChapterRef = useRef<string | null>(null);
  const perfInputsRef = useRef<{ source: unknown; resources: unknown; config: unknown; rebuildKey: number }>({ source: null, resources: null, config: null, rebuildKey: -1 });
  const deferredSource = useDeferredValue(layoutSource);
  // The book the current `docRef` was built from (offsets in the document
  // are offsets into its markdown).
  const builtSourceRef = useRef<ComposedBook | null>(null);
  const deferredResources = useDeferredValue(resources);
  const rawDeferredConfig = useDeferredValue(config);
  // Inject app-locale-derived hyphenation locale when user hasn't set one explicitly
  const deferredConfig = useMemo((): PostextConfig => {
    if (rawDeferredConfig.bodyText?.hyphenation?.locale) return rawDeferredConfig;
    const hypLocale = LOCALE_TO_HYPHENATION[locale] ?? 'en-us';
    return {
      ...rawDeferredConfig,
      bodyText: {
        ...rawDeferredConfig.bodyText,
        hyphenation: {
          ...rawDeferredConfig.bodyText?.hyphenation,
          locale: hypLocale,
        },
      },
    };
  }, [rawDeferredConfig, locale]);
  const layoutWorker = useLayoutWorker('preview');
  // `rebuildKey` only bumps for events that invalidate measurements (fonts
  // loaded, math engine ready). Container resize does NOT bump this — the
  // VDT is in PT units and is independent of the CSS display size.
  const [rebuildKey, setRebuildKey] = useState(0);
  const appliedRebuildKeyRef = useRef(0);
  // Container size lives in a ref, NOT state — resize must never trigger a
  // React re-render. The ResizeObserver below imperatively updates canvas /
  // overlay CSS dimensions in place, so the main thread stays idle during
  // window/sidebar drags.
  const containerSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  // Incremented whenever a structural rebuild is needed (new doc, viewMode
  // toggle). Resize does NOT bump this.
  const [layoutKey, setLayoutKey] = useState(0);
  const [docVersion, setDocVersion] = useState(0);
  // Incremented when the pixels of the current document change without
  // its layout changing — resource images decoded after the pages were
  // painted with placeholders. The LAYOUT effect then repaints the pages
  // in view and marks the rest stale, exactly as for a new docVersion.
  const [paintKey, setPaintKey] = useState(0);
  const lastPaintedPaintKeyRef = useRef(0);
  // The rebuildKey whose build last reached the pages: a whole-book build
  // that keeps every chapter document (nothing it depends on changed) still
  // owes a repaint when a rebuild-invalidating event triggered it.
  const paintedRebuildKeyRef = useRef(0);

  // Stable (only touches refs and DOM), so effects can depend on it without
  // re-running every render.
  const applyDisplaySize = useCallback((displayWidth: number, displayHeight: number) => {
    const container = containerRef.current;
    if (!container) return;
    const prev = lastGeomRef.current;
    if (prev && prev.displayWidth === displayWidth && prev.displayHeight === displayHeight) return;
    const pagesPerRow = prev?.viewMode === 'spread' ? 2 : 1;
    for (const [, canvas] of canvasMapRef.current) {
      canvas.style.width = `${displayWidth}px`;
      canvas.style.height = `${displayHeight}px`;
    }
    for (const [, overlay] of overlayMapRef.current) {
      overlay.style.width = `${displayWidth}px`;
      overlay.style.height = `${displayHeight}px`;
    }
    const spacers = container.querySelectorAll<HTMLDivElement>('[data-spread-spacer="1"]');
    for (const spacer of spacers) spacer.style.width = `${displayWidth}px`;
    // Rows carry a minHeight sized to the canvas so ragged last pages don't
    // pull the row up. It must be recomputed on resize, otherwise shrinking
    // leaves rows taller than their canvases and the spread drifts apart
    // vertically.
    const rows = container.querySelectorAll<HTMLDivElement>('[data-page-row="1"]');
    const totalRows = rows.length;
    rows.forEach((rowDiv, rowIdx) => {
      const paddingTop = rowIdx === 0 ? PAGE_PADDING : PAGE_GAP / 2;
      const paddingBottom = rowIdx === totalRows - 1 ? PAGE_PADDING : PAGE_GAP / 2;
      rowDiv.style.minHeight = `${displayHeight + paddingTop + paddingBottom}px`;
    });
    const innerDiv = container.firstChild as HTMLDivElement | null;
    if (innerDiv) {
      innerDiv.style.width = `${displayWidth * pagesPerRow + PAGE_GAP * (pagesPerRow - 1) + PAGE_PADDING * 2}px`;
    }
    if (prev) {
      prev.displayWidth = displayWidth;
      prev.displayHeight = displayHeight;
      // Shown much larger (or much smaller) than painted: repaint what is
      // in view at the new size; the rest repaints when it next scrolls in.
      const wanted = wantedBitmapScale(displayWidth, prev.pageWidthPx);
      const doc = docRef.current;
      if (doc && needsRescale(wanted)) {
        bitmapScaleRef.current = wanted;
        const opts = paintOptionsRef.current();
        for (const pageIndex of renderedPagesRef.current) {
          if (!visiblePagesRef.current.has(pageIndex)) {
            stalePagesRef.current.add(pageIndex);
            continue;
          }
          const canvas = canvasMapRef.current.get(pageIndex);
          const page = doc.pages[pageIndex];
          if (canvas && page) renderPageToCanvas(page, doc, canvas, opts);
        }
      }
    }
  }, []);

  const computeDisplaySize = (containerW: number, containerH: number) => {
    const isSpread = viewMode === 'spread';
    const doc = docRef.current;
    const firstPage = doc?.pages[0];
    const aspectRatio = firstPage ? firstPage.height / firstPage.width : 1;
    let displayWidth: number;
    if (fitMode === 'width') {
      displayWidth = isSpread
        ? (containerW - PAGE_PADDING * 2 - PAGE_GAP) / 2
        : containerW - PAGE_PADDING * 2;
    } else if (fitMode === 'height') {
      const containerInnerH = containerH - PAGE_PADDING * 2;
      displayWidth = containerInnerH / aspectRatio;
      if (isSpread) {
        const maxPerPage = (containerW - PAGE_PADDING * 2 - PAGE_GAP) / 2;
        displayWidth = Math.min(displayWidth, maxPerPage);
      }
    } else {
      const base = Math.min(containerW - PAGE_PADDING * 2, 800);
      displayWidth = base * zoom;
    }
    displayWidth = Math.max(displayWidth, 50);
    return { displayWidth, displayHeight: displayWidth * aspectRatio };
  };
  // The ResizeObserver is registered once at mount, so its handler captures
  // a stale `computeDisplaySize` (and therefore a stale viewMode / fitMode /
  // zoom). Mirror the latest function through a ref so window resizes always
  // use the current viewMode — otherwise spread-mode resize collapses to the
  // single-page calculation.
  const computeDisplaySizeRef = useRef(computeDisplaySize);
  computeDisplaySizeRef.current = computeDisplaySize;

  // ResizeObserver updates the container-size ref and imperatively resizes
  // the existing page DOM. No React state is touched, so resize costs a
  // single synchronous CSS write per page — no rebuild, no re-render.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let rafId = 0;
    const apply = () => {
      rafId = 0;
      const rect = container.getBoundingClientRect();
      if (rect.width === containerSizeRef.current.width && rect.height === containerSizeRef.current.height) return;
      const hadNoSize = containerSizeRef.current.width === 0;
      containerSizeRef.current = { width: rect.width, height: rect.height };
      const { displayWidth, displayHeight } = computeDisplaySizeRef.current(rect.width, rect.height);
      applyDisplaySize(displayWidth, displayHeight);
      // The LAYOUT effect bails out while the container has no size, so a
      // document that arrived before the first real measurement would never
      // get its page DOM. Re-run the layout once the size is known.
      if (rect.width > 0 && (hadNoSize || (docRef.current && lastGeomRef.current === null))) {
        setLayoutKey((k) => k + 1);
      }
    };
    const observer = new ResizeObserver(() => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(apply);
    });
    observer.observe(container);
    const rect = container.getBoundingClientRect();
    containerSizeRef.current = { width: rect.width, height: rect.height };
    // Kick off initial layout after first measure.
    setLayoutKey((k) => k + 1);
    return () => {
      observer.disconnect();
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [applyDisplaySize]);

  // When zoom or fit mode change, recompute display size imperatively. Reads
  // computeDisplaySize through its ref mirror — the props it closes over
  // (zoom/fitMode) are already in the dependency list.
  useEffect(() => {
    const { width, height } = containerSizeRef.current;
    if (width === 0) return;
    const { displayWidth, displayHeight } = computeDisplaySizeRef.current(width, height);
    applyDisplaySize(displayWidth, displayHeight);
  }, [zoom, fitMode, applyDisplaySize]);

  // Rebuild when any font finishes loading after the initial layout.
  // document.fonts.ready only waits for *currently pending* faces; a face
  // requested later (or one that slips past the preload) can land after the
  // first measurement, poisoning the cache with fallback metrics. Bumping
  // rebuildKey on loadingdone invalidates the measurement cache and triggers
  // a fresh buildDocument with the now-loaded glyph widths.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const onLoadingDone = () => setRebuildKey((k) => k + 1);
    document.fonts.addEventListener('loadingdone', onLoadingDone);
    return () => document.fonts.removeEventListener('loadingdone', onLoadingDone);
  }, []);

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
    if (typeof document !== 'undefined' && document.fonts) {
      const missing = getConfigFontSpecs(deferredConfig).filter((s) => !document.fonts.check(s));
      if (missing.length > 0) {
        onGeneratingChangeRef.current?.(true);
        ensureConfigFontsLoaded(deferredConfig).then(() => {
          if (!cancelled) setRebuildKey((k) => k + 1);
        });
        return () => {
          cancelled = true;
        };
      }
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
        const held = heldDocsRef.current;
        const next = new Map<string, HeldChapterDoc>();
        const built: StitchedChapter[] = [];
        const records: ChapterLayout[] = [];
        let offset = 0;
        let nextNumbering: { format: NumeralStyle; startAt: number } | null = null;
        for (const chapter of snapshotChapters) {
          const chapterPlan = currentPlan.byId[chapter.id];
          // The plan lags behind a chapter just added: the next one starts
          // this build over.
          if (!chapterPlan) return;
          const source = composeBookMemo(snapshotChapters, chapter.id);
          const continuation: LayoutContinuation | undefined = chapterPlan.index === 0
            ? undefined
            : { ...chapterPlan.continuation, pageIndexOffset: offset, ...(nextNumbering ? { pageNumbering: nextNumbering } : {}) };
          const keyInput = { markdown: source.markdown, metadata: source.metadata, config: deferredConfig, resources: deferredResources, continuation, outlineKey: chapterPlan.outlineKey };
          // What the chapter was built from, whatever the records say: the
          // counters and pages it actually continues.
          const key = layoutCacheKey({ ...keyInput, continuationKey: `stitched:${stableStringify(continuation ?? null)}` });
          const hit = held.get(chapter.id);
          let doc: VDTDocument;
          if (hit && hit.key === key) {
            doc = hit.doc;
          } else {
            doc = await layoutWorker.build(
              { markdown: source.markdown, metadata: source.metadata, resources: deferredResources, continuation, outline: chapterPlan.outline },
              deferredConfig,
              // Under the key the paginator and the PDF tab use, when the
              // plan's page chain agrees with the actual one, so the
              // worker's cache is shared.
              { cacheKey: layoutCacheKey({ ...keyInput, continuationKey: chapterPlan.paginated ? chapterPlan.continuationKey : `stitched:${stableStringify(continuation ?? null)}` }) },
            );
            if (cancelled) return;
          }
          next.set(chapter.id, { key, doc, source });
          built.push({ chapterId: chapter.id, doc });
          // Its layout record — when the plan already starts it where the
          // chapters before it actually end (the records before it are
          // current); the others are recorded as the plan catches up.
          if (chapterPlan.paginated && (chapterPlan.continuation?.pageIndexOffset ?? 0) === offset) {
            const layout = chapterLayoutFromDoc(doc, chapterPlan, { markdown: chapter.markdown, config: rawDeferredConfig, resources: deferredResources });
            if (layout) records.push(layout);
          }
          offset += doc.pages.length;
          const last = doc.pages[doc.pages.length - 1];
          if (last) nextNumbering = { format: last.pageNumberFormat, startAt: last.pageNumberValue + 1 };
        }
        if (cancelled) return;
        heldDocsRef.current = next;
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
    )
      .then((doc) => {
        if (cancelled) return;
        lastBuiltChapterRef.current = deferredSource.chapterId;
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
  }, [deferredSource, deferredBookSource, deferredResources, deferredConfig, rawDeferredConfig, rebuildKey, dispatch, sharedDocRef, sharedDocSourceRef, layoutWorker, chapterDocsRef]);

  // Single-ink diagram colour: when diagramStyle.singleInk is on, SVG resources
  // decode through a recolouring pass keyed on the resolved ink hex.
  const diagramInkHex = useMemo((): string | null => {
    const ds = resolveDiagramStyleConfig(deferredConfig.diagramStyle);
    if (!ds.singleInk) return null;
    return resolveColorValue(ds.inkColor, deferredConfig.colorPalette, ds.inkColor).hex;
  }, [deferredConfig]);

  // Decode resource image payloads (bitmaps/SVGs) from IndexedDB and register
  // them with the canvas backend, then repaint. The worker lays out from the
  // resource metadata (intrinsic dims), so the layout is not at stake — only
  // the pixels: pages painted before a decode landed show placeholders, and
  // a rebuild would not reach them (a whole-book build keeps every chapter
  // document unchanged and skips the paint). A decode still in flight when
  // the resources change keeps registering: the images it lands are painted
  // by the repaint of the call that supersedes it, or of the next build.
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

  // LAYOUT effect — (re)builds the page DOM and repaints visible pages.
  // Runs when a new doc is produced, or when view mode changes. Resize is
  // handled imperatively by the ResizeObserver and does NOT trigger this.
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const doc = docRef.current;
    if (!doc) return;
    const { width: containerW, height: containerH } = containerSizeRef.current;
    if (containerW === 0) return;

    if (doc.pages.length === 0) {
      while (container.firstChild) container.removeChild(container.firstChild);
      observerRef.current?.disconnect();
      canvasMapRef.current.clear();
      overlayMapRef.current.clear();
      renderedPagesRef.current.clear();
      stalePagesRef.current.clear();
      visiblePagesRef.current.clear();
      lastGeomRef.current = null;
      return;
    }

    const firstPage = doc.pages[0]!;
    // Through the ref mirror: the props it closes over (zoom/viewMode/fitMode)
    // are already dependencies of this effect.
    const { displayWidth, displayHeight } = computeDisplaySizeRef.current(containerW, containerH);

    const debugConfig = resolveDebugConfig(deferredConfig.debug);
    renderOptsRef.current = { pageNegative: debugConfig.pageNegative.enabled };
    const pageWidthPx = firstPage.width;
    const pageHeightPx = firstPage.height;
    const wantedScale = wantedBitmapScale(displayWidth, pageWidthPx);
    // A structural rebuild repaints everything anyway: take the exact
    // scale. A repaint of the same structure keeps the bitmaps unless the
    // page is shown much larger or smaller than they were painted.
    if (needsRescale(wantedScale) || lastGeomRef.current === null) bitmapScaleRef.current = wantedScale;
    const renderOpts: RenderPageOptions = paintOptions();

    const geom: GeomSnapshot = {
      pageCount: doc.pages.length,
      pageWidthPx,
      pageHeightPx,
      displayWidth,
      displayHeight,
      viewMode,
    };
    const prev = lastGeomRef.current;
    const structureSame = !!prev
      && prev.pageCount === geom.pageCount
      && prev.pageWidthPx === geom.pageWidthPx
      && prev.pageHeightPx === geom.pageHeightPx
      && prev.viewMode === geom.viewMode
      && canvasMapRef.current.size === geom.pageCount;

    if (structureSame) {
      applyDisplaySize(displayWidth, displayHeight);
      // Only repaint bitmaps when the doc itself changed, or when its pixels
      // did (images decoded after the paint). CSS scaling handles pure size
      // changes (window/sidebar resize) at zero bitmap cost.
      if (lastPaintedDocVersionRef.current !== docVersion || lastPaintedPaintKeyRef.current !== paintKey) {
        // The pages in view repaint now; the others keep their old pixels
        // and repaint on their next entry (see the observer below).
        let painted = 0;
        for (const pageIndex of renderedPagesRef.current) {
          if (!visiblePagesRef.current.has(pageIndex)) {
            stalePagesRef.current.add(pageIndex);
            continue;
          }
          const canvas = canvasMapRef.current.get(pageIndex);
          const page = doc.pages[pageIndex];
          if (canvas && page) {
            renderPageToCanvas(page, doc, canvas, renderOpts);
            stalePagesRef.current.delete(pageIndex);
            painted++;
          }
        }
        lastPaintedDocVersionRef.current = docVersion;
        lastPaintedPaintKeyRef.current = paintKey;
        paintSpanRef.current?.end({ pages: doc.pages.length, painted, rebuilt: false, bitmapScale: Math.round(bitmapScaleRef.current * 100) / 100 });
        paintSpanRef.current = null;
      }
      lastGeomRef.current = geom;
      return;
    }

    // Structure changed — tear down and rebuild the page DOM. Keep the old
    // DOM in place until the new one is fully built and painted so fast
    // typing doesn't flash blank.
    bitmapScaleRef.current = wantedScale;
    renderOpts.scale = wantedScale;
    observerRef.current?.disconnect();
    canvasMapRef.current.clear();
    overlayMapRef.current.clear();
    const previouslyVisible = visiblePagesRef.current;
    renderedPagesRef.current = new Set();
    stalePagesRef.current = new Set();
    visiblePagesRef.current = new Set();

    const { innerDiv, allSlots } = buildPagesDom(
      doc,
      viewMode,
      displayWidth,
      displayHeight,
      pageWidthPx,
      pageHeightPx,
      canvasMapRef.current,
      overlayMapRef.current,
      docRef,
      dispatchRef,
      activePanelRef,
      builtSourceRef,
      navigateRef,
      resourcesRef,
      pageSourceRef,
    );
    drawnOverlaysRef.current = new Set();

    // Pre-render the pages that were in view in the previous document so
    // the swap from old DOM to new DOM shows already-painted pixels. Pages
    // that were painted but scrolled away are left to the observer.
    const renderedSet = new Set<number>();
    for (const pageIndex of previouslyVisible) {
      const canvas = canvasMapRef.current.get(pageIndex);
      const page = doc.pages[pageIndex];
      if (!canvas || !page) continue;
      renderPageToCanvas(page, doc, canvas, renderOpts);
      renderedSet.add(pageIndex);
    }
    renderedPagesRef.current = renderedSet;
    lastPaintedDocVersionRef.current = docVersion;
    lastPaintedPaintKeyRef.current = paintKey;
    paintSpanRef.current?.end({ pages: doc.pages.length, painted: renderedSet.size, rebuilt: true, bitmapScale: Math.round(bitmapScaleRef.current * 100) / 100 });
    paintSpanRef.current = null;

    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(innerDiv);

    // Rasterize on entry (and re-rasterize a stale page on re-entry); leaving
    // the viewport releases nothing by itself, so scrolling back and forth
    // never repaints and resize is free (the browser scales the bitmap).
    // Only when the painted bitmaps exceed the memory budget is the page
    // farthest from the one just painted released — a 300 dpi page is
    // ~30 MB, and a long chapter kept whole would starve the GPU.
    const pageBytes = () => {
      const s = bitmapScaleRef.current;
      return Math.round(pageWidthPx * s) * Math.round(pageHeightPx * s) * 4;
    };
    const trimPaintedPages = (anchor: number) => {
      const rendered = renderedPagesRef.current;
      while (rendered.size * pageBytes() > PAINTED_PAGES_BUDGET_BYTES && rendered.size > MIN_PAINTED_PAGES) {
        let victim = -1;
        let farthest = -1;
        for (const idx of rendered) {
          if (visiblePagesRef.current.has(idx)) continue;
          const dist = Math.abs(idx - anchor);
          if (dist > farthest) {
            farthest = dist;
            victim = idx;
          }
        }
        if (victim < 0) return;
        const canvas = canvasMapRef.current.get(victim);
        if (canvas) {
          canvas.width = 1;
          canvas.height = 1;
        }
        rendered.delete(victim);
        stalePagesRef.current.delete(victim);
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const idx = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (!entry.isIntersecting) {
            visiblePagesRef.current.delete(idx);
            continue;
          }
          visiblePagesRef.current.add(idx);
          if (renderedPagesRef.current.has(idx) && !stalePagesRef.current.has(idx)) continue;
          const canvas = canvasMapRef.current.get(idx);
          if (!canvas || !docRef.current) continue;
          renderPageToCanvas(docRef.current.pages[idx]!, docRef.current, canvas, paintOptionsRef.current());
          renderedPagesRef.current.add(idx);
          stalePagesRef.current.delete(idx);
          trimPaintedPages(idx);
        }
      },
      { root: container, rootMargin: '200px 0px 200px 0px' },
    );
    observerRef.current = observer;
    for (const slot of allSlots) observer.observe(slot);
    lastGeomRef.current = geom;
  }, [navigateRef, docVersion, paintKey, layoutKey, zoom, viewMode, fitMode, deferredConfig, applyDisplaySize]);

  // Draw cursor/selection overlays whenever selection or debug config changes.
  // The viewport follows the caret only when the SELECTION moves (the reader
  // placed it in the editor); a relayout, a focus change or a redraw with the
  // same selection must not pull the page back to it, or the reader could
  // never scroll away from a selected block.
  const lastFollowedRef = useRef<string | null>(null);
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const debug = resolveDebugConfig(config.debug);
    // The editor selection is chapter-local; the document is the composed
    // book — or, stitched from every chapter, a document whose offsets are
    // chapter offsets: the selection then maps through the chapter's own
    // book and shows on the chapter's pages alone.
    const stitched = stitchedRef.current;
    const chapterDoc = stitched ? chapterDocsRef.current.get(activeChapterId) : undefined;
    const source = stitched ? chapterDoc?.source ?? null : builtSourceRef.current;
    const mapped = source ? toBookSelection(source, activeChapterId, editorSelection) : stitched ? null : editorSelection;
    const selection: EditorSelection = mapped ?? NO_SELECTION;
    const focused = editorFocused && mapped !== null;
    let chapterPages: { from: number; to: number } | undefined;
    if (stitched) {
      let from = -1;
      let to = -1;
      stitched.pageChapterIds.forEach((id, i) => {
        if (id !== activeChapterId) return;
        if (from < 0) from = i;
        to = i + 1;
      });
      chapterPages = from >= 0 ? { from, to } : { from: 0, to: 0 };
    }
    const caretBlockIdx = findCaretBlockIdx(doc, selection.head, chapterPages);
    // A resource editor's selection paints on the page holding the resource.
    const resourcePage = stitched && resourceSelection ? findResourceLocation(doc, resourceSelection.resourceId)?.pageIndex ?? -1 : -1;

    let activeCursorRect: SVGRectElement | null = null;
    const drawn = drawnOverlaysRef.current;
    for (const [pageIndex, overlay] of overlayMapRef.current) {
      const page = doc.pages[pageIndex];
      if (!page) continue;
      if (chapterPages && (pageIndex < chapterPages.from || pageIndex >= chapterPages.to) && pageIndex !== resourcePage) {
        if (drawn.delete(pageIndex)) clearOverlay(overlay);
        continue;
      }
      const rect = drawOverlay(overlay, doc, pageIndex, selection, debug, focused, caretBlockIdx, resourceSelection);
      drawn.add(pageIndex);
      if (rect) activeCursorRect = rect;
    }

    const container = containerRef.current;
    const isCollapsed = selection.from === selection.to;
    const scrollEnabled = isCollapsed
      ? debug.cursorSync.enabled
      : debug.selectionSync.enabled;
    const followKey = focused ? `${activeChapterId}:${selection.from}:${selection.to}:${selection.head}` : null;
    const selectionMoved = followKey !== null && followKey !== lastFollowedRef.current;
    if (focused) lastFollowedRef.current = followKey;
    if (
      activeCursorRect &&
      container &&
      focused &&
      scrollEnabled &&
      selectionMoved
    ) {
      const padding = 16;
      const cr = activeCursorRect.getBoundingClientRect();
      const cn = container.getBoundingClientRect();
      if (cr.top < cn.top + padding) {
        container.scrollTop += cr.top - cn.top - padding;
      } else if (cr.bottom > cn.bottom - padding) {
        container.scrollTop += cr.bottom - cn.bottom + padding;
      }
      if (cr.left < cn.left + padding) {
        container.scrollLeft += cr.left - cn.left - padding;
      } else if (cr.right > cn.right - padding) {
        container.scrollLeft += cr.right - cn.right + padding;
      }
    }
  }, [editorSelection, activeChapterId, config.debug, editorFocused, resourceSelection, docVersion, chapterDocsRef]);

  // Imperative API: regenerate by bumping rebuildKey; jumpToPage by scrolling
  // the slot element with the matching data-page-index into view.
  useImperativeHandle(ref, () => ({
    regenerate: () => setRebuildKey((k) => k + 1),
    jumpToPage: (pageIndex: number) => {
      const container = containerRef.current;
      if (!container) return;
      const slot = container.querySelector<HTMLElement>(
        `[data-page-index="${pageIndex}"]`,
      );
      if (!slot) return;
      const slotRect = slot.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();
      container.scrollTop += slotRect.top - containerRect.top - PAGE_PADDING;
    },
  }), []);

  // Current-page tracking: find the slot whose vertical center is closest to
  // the container's vertical center. Emits on scroll and when the doc changes.
  const onCurrentPageChangeRef = useRef(onCurrentPageChange);
  onCurrentPageChangeRef.current = onCurrentPageChange;
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let rafId = 0;
    const compute = () => {
      rafId = 0;
      const slots = container.querySelectorAll<HTMLElement>('[data-page-index]');
      if (slots.length === 0) return;
      const cRect = container.getBoundingClientRect();
      const viewportCenter = cRect.top + cRect.height / 2;
      let bestIdx = 0;
      let bestDist = Infinity;
      slots.forEach((slot) => {
        const r = slot.getBoundingClientRect();
        const center = r.top + r.height / 2;
        const dist = Math.abs(center - viewportCenter);
        if (dist < bestDist) {
          bestDist = dist;
          bestIdx = Number(slot.dataset.pageIndex);
        }
      });
      onCurrentPageChangeRef.current?.(bestIdx);
    };
    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(compute);
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    compute();
    return () => {
      container.removeEventListener('scroll', onScroll);
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [docVersion, viewMode]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: 'var(--surface)', overflow: 'auto', scrollbarGutter: 'stable' }}
    />
  );
});
