'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useDeferredValue, useMemo } from 'react';
import { useBookPlan, useSandboxChapterDocsRef, useSandboxDispatch, useSandboxDocRef, useSandboxDocSourceRef, useSandboxSelector, useLayoutSource } from '../../../context/SandboxContext.js';
import { type StitchedBook } from '../../../book/stitch.js';
import type { ComposedBook } from '../../../book/types.js';
import { type HeldChapterDoc } from '../../../book/buildBook.js';
import type { PrintPreview } from 'postext';
import { previewFor, printsGrayscale, usePrintSetup } from '../../../print/printSetup.js';
import { usePrintPreview } from '../../../print/printPreviewToggle.js';
import type { VDTDocument, PostextConfig, RenderPageOptions } from 'postext';
import { createPaintedPages, type PaintedPages } from './pageReuse.js';
import { useTemplateEditorHost } from '../../../templates/useTemplateEditorHost.js';
import type { BookPageMap } from '../../usePageHashSync.js';
import { createFontGate } from '../../../controls/fonts/fontLoader.js';
import { useLayoutWorker } from '../../../worker/useLayoutWorker.js';
import { type PerfSpan } from '../../../perf/marks.js';
import {
  defaultDocumentLocale,
  PAGE_PADDING, type FitMode,
  type GeomSnapshot, type ViewMode
} from './layoutUtils.js';
import { useAutoCover, type FirstChapterDoc } from '../../../covers/useAutoCover.js';
import { usePageNavigator } from '../../usePageNavigator.js';
import { useDisplaySize } from './hooks/useDisplaySize.js';
import { useLayoutBuild } from './hooks/useLayoutBuild.js';
import { usePagePaint } from './hooks/usePagePaint.js';
import { useOverlays } from './hooks/useOverlays.js';

/** Bitmaps are painted at the size the page is shown (× device pixels),
 *  never above the page's own resolution. A repaint is worth it when the
 *  page grows past this factor (it would blur) or shrinks below the other
 *  (the bitmap would waste memory). */
const BITMAP_GROW_REPAINT = 1.15;
const BITMAP_SHRINK_REPAINT = 0.5;

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
  const pageLabelTemplate = useSandboxSelector((s) => s.labels.canvasPageLabel);
  const regionLabel = useSandboxSelector((s) => s.labels.canvasPreviewRegion);
  const pageLabelRef = useRef(pageLabelTemplate);
  pageLabelRef.current = pageLabelTemplate;
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
  // Read by the follow below (it changes with the selection it describes).
  const selectionFromViewerRef = useRef(false);
  selectionFromViewerRef.current = useSandboxSelector((s) => s.selectionFromViewer);
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
  const labels = useSandboxSelector((s) => s.labels);
  const labelsRef = useRef(labels);
  labelsRef.current = labels;
  // The page-template editor reads and writes the book through the canvas (#863).
  useTemplateEditorHost();
  const uiLocaleRef = useRef(locale);
  uiLocaleRef.current = locale;
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
    () => plan.chapters.map((p) => `${p.chapterId}|${p.paginated ? 1 : 0}|${p.continuationKey}|${p.outlineKey}|${p.continuation?.pageIndexOffset ?? ''}|${p.continuation?.pageNumbering?.startAt ?? ''}|${p.continuation?.bookPageCount ?? ''}`).join('\n'),
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
  /** What each canvas holds: a composed page a relayout left as it was
   *  keeps its pixels (#857). */
  const paintedPagesRef = useRef<PaintedPages>(createPaintedPages());
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
  // Inject app-locale-derived hyphenation locale when the document names no
  // language (neither a hyphenation locale nor its `locale`)
  const deferredConfig = useMemo((): PostextConfig => {
    if (rawDeferredConfig.bodyText?.hyphenation?.locale || rawDeferredConfig.locale) return rawDeferredConfig;
    const hypLocale = defaultDocumentLocale(locale);
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
  const [fontGate] = useState(createFontGate);
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
  // The print preview (#606): the soft proof of the output profile on the
  // paper's white, the print alone (#802). Repaints, never relays.
  const [printPreviewOn] = usePrintPreview();
  const printSetup = usePrintSetup(config.print, printPreviewOn);
  const printPreviewRef = useRef<PrintPreview | undefined>(undefined);
  // A PDF forced to grayscale prints in black alone (#800).
  const printGray = printsGrayscale(config.pdfGeneration, printSetup);
  const printPreviewKey = printPreviewOn ? `${printSetup.transform ? 'ready' : 'loading'}|${printGray}|${JSON.stringify(printSetup.print)}` : 'off';
  useEffect(() => {
    if (!printPreviewOn || !printSetup.transform) {
      printPreviewRef.current = undefined;
    } else {
      printPreviewRef.current = previewFor(printSetup, (config.page?.dpi as number | undefined) ?? 300, true, printGray);
    }
    setPaintKey((k) => k + 1);
    // The key says when the preview changes; the setup object is new on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printPreviewKey]);
  const lastPaintedPaintKeyRef = useRef(0);
  // The book's first chapter as last laid out here, for its cover (a book
  // without one gets a picture of its first page once it is painted).
  const firstChapterDocRef = useRef<FirstChapterDoc | null>(null);
  useAutoCover(firstChapterDocRef, `${docVersion}:${paintKey}`);
  // The rebuildKey whose build last reached the pages: a whole-book build
  // that keeps every chapter document (nothing it depends on changed) still
  // owes a repaint when a rebuild-invalidating event triggered it.
  const paintedRebuildKeyRef = useRef(0);

  const {
    gapsRef, applyDisplaySize, computeDisplaySizeRef
  } = useDisplaySize({
    zoom, viewMode, fitMode, config, containerRef, docRef, canvasMapRef, overlayMapRef,
    renderedPagesRef, stalePagesRef, paintedPagesRef, visiblePagesRef, lastGeomRef, bitmapScaleRef,
    paintOptionsRef, wantedBitmapScale, needsRescale, setRebuildKey, containerSizeRef, setLayoutKey
  });

  useLayoutBuild({
    onGeneratingChange, onPageCountChange, dispatch, sharedDocRef, sharedDocSourceRef,
    chapterOfPageRef, pageSourceRef, docRef, stitchedRef, heldDocsRef, lastStitchedDocsRef,
    chapterDocsRef, planRef, deferredBookSource, paintSpanRef, lastBuiltChapterRef, perfInputsRef,
    deferredSource, builtSourceRef, deferredResources, rawDeferredConfig, deferredConfig,
    layoutWorker, rebuildKey, setRebuildKey, fontGate, appliedRebuildKeyRef, setDocVersion,
    setPaintKey, firstChapterDocRef, paintedRebuildKeyRef
  });

  usePagePaint({
    zoom, viewMode, fitMode, pageLabelRef, containerRef, dispatchRef, activePanelRef, resourcesRef,
    labelsRef, pageSourceRef, navigateRef, docRef, drawnOverlaysRef, observerRef, canvasMapRef,
    overlayMapRef, renderedPagesRef, stalePagesRef, paintedPagesRef, visiblePagesRef, lastGeomRef,
    lastPaintedDocVersionRef, bitmapScaleRef, renderOptsRef, paintOptions, paintOptionsRef,
    wantedBitmapScale, needsRescale, paintSpanRef, builtSourceRef, deferredResources, deferredConfig,
    containerSizeRef, layoutKey, docVersion, paintKey, setPaintKey, printPreviewRef,
    lastPaintedPaintKeyRef, gapsRef, applyDisplaySize, computeDisplaySizeRef
  });

  useOverlays({
    activeChapterId, config, editorSelection, editorFocused, selectionFromViewerRef,
    resourceSelection, containerRef, dispatchRef, activePanelRef, labelsRef, uiLocaleRef,
    pageSourceRef, docRef, stitchedRef, drawnOverlaysRef, chapterDocsRef, overlayMapRef,
    builtSourceRef, docVersion
  });

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

  // The scroller is a named region that takes the keyboard (arrow keys,
  // Page Up/Down, Home/End scroll it): the pages are bitmaps, so nothing
  // inside it can take focus (WCAG 2.1.1). Left to right whatever the
  // interface's direction: the page geometry is physical, and a
  // right-to-left book already lays its spreads out right to left.
  return (
    <div
      ref={containerRef}
      dir="ltr"
      role="region"
      aria-label={regionLabel}
      tabIndex={0}
      className="h-full w-full focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--brand)"
      style={{ backgroundColor: 'var(--surface)', overflow: 'auto', scrollbarGutter: 'stable' }}
    />
  );
});
