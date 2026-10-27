// The canvas preview's resource images and its layout effect: the page DOM
// built again and the visible pages painted (#1276: split out of
// CanvasPreview/index.tsx).
import { useMemo, useEffect } from 'react';
import { resolveDiagramStyleConfig, resolveColorValue, resolveDebugConfig, type RenderPageOptions, renderPageToCanvas, type VDTDocument, type PostextConfig, type PrintPreview, type Resource } from 'postext';
import { ensureResourceImages } from '../../../../controls/media/resourceImages.js';
import { type GeomSnapshot, sameStructure, type ViewMode, type FitMode, type PageGaps } from '../layoutUtils.js';
import { buildPagesDom } from '../pageDom.js';
import { PAINTED_PAGES_BUDGET_BYTES, MIN_PAINTED_PAGES } from './constants.js';
import type { SandboxAction } from '../../../../context/SandboxContext/state.js';
import type { PanelId } from '../../../../types/props.js';
import type { SandboxLabels } from '../../../../types/labels.js';
import type { ComposedBook } from '../../../../book/types.js';
import type { PageNavigator } from '../interaction/types.js';
import type { PaintedPages } from '../pageReuse.js';
import type { PerfSpan } from '../../../../perf/marks.js';

/** What usePagePaint takes from the canvas preview. */
export interface UsePagePaintDeps {
  zoom: number;
  viewMode: ViewMode;
  fitMode: FitMode;
  pageLabelRef: React.RefObject<string>;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dispatchRef: React.RefObject<React.Dispatch<SandboxAction>>;
  activePanelRef: React.RefObject<PanelId | null>;
  resourcesRef: React.RefObject<Resource[]>;
  labelsRef: React.RefObject<SandboxLabels>;
  pageSourceRef: React.RefObject<((pageIndex: number) => ComposedBook | null) | null>;
  navigateRef: React.MutableRefObject<PageNavigator | null>;
  docRef: React.RefObject<VDTDocument | null>;
  drawnOverlaysRef: React.RefObject<Set<number>>;
  observerRef: React.RefObject<IntersectionObserver | null>;
  canvasMapRef: React.RefObject<Map<number, HTMLCanvasElement>>;
  overlayMapRef: React.RefObject<Map<number, SVGSVGElement>>;
  renderedPagesRef: React.RefObject<Set<number>>;
  stalePagesRef: React.RefObject<Set<number>>;
  paintedPagesRef: React.RefObject<PaintedPages>;
  visiblePagesRef: React.RefObject<Set<number>>;
  lastGeomRef: React.RefObject<GeomSnapshot | null>;
  lastPaintedDocVersionRef: React.RefObject<number>;
  bitmapScaleRef: React.RefObject<number>;
  renderOptsRef: React.RefObject<RenderPageOptions>;
  paintOptions: () => RenderPageOptions;
  paintOptionsRef: React.RefObject<() => RenderPageOptions>;
  wantedBitmapScale: (displayWidth: number, pageWidthPx: number) => number;
  needsRescale: (wanted: number) => boolean;
  paintSpanRef: React.RefObject<PerfSpan | null>;
  builtSourceRef: React.RefObject<ComposedBook | null>;
  deferredResources: Resource[];
  deferredConfig: PostextConfig;
  containerSizeRef: React.RefObject<{ width: number; height: number; }>;
  layoutKey: number;
  docVersion: number;
  paintKey: number;
  setPaintKey: React.Dispatch<React.SetStateAction<number>>;
  printPreviewRef: React.RefObject<PrintPreview | undefined>;
  lastPaintedPaintKeyRef: React.RefObject<number>;
  gapsRef: React.RefObject<PageGaps>;
  applyDisplaySize: (displayWidth: number, displayHeight: number, force?: boolean) => void;
  computeDisplaySizeRef: React.RefObject<(containerW: number, containerH: number) => { displayWidth: number; displayHeight: number; }>;
}

export function usePagePaint(deps: UsePagePaintDeps) {
  const {
    zoom, viewMode, fitMode, pageLabelRef, containerRef, dispatchRef, activePanelRef, resourcesRef,
    labelsRef, pageSourceRef, navigateRef, docRef, drawnOverlaysRef, observerRef, canvasMapRef,
    overlayMapRef, renderedPagesRef, stalePagesRef, paintedPagesRef, visiblePagesRef, lastGeomRef,
    lastPaintedDocVersionRef, bitmapScaleRef, renderOptsRef, paintOptions, paintOptionsRef,
    wantedBitmapScale, needsRescale, paintSpanRef, builtSourceRef, deferredResources, deferredConfig,
    containerSizeRef, layoutKey, docVersion, paintKey, setPaintKey, printPreviewRef,
    lastPaintedPaintKeyRef, gapsRef, applyDisplaySize, computeDisplaySizeRef
  } = deps;
  // Single-ink diagram colour: when diagramStyle.singleInk is on, SVG resources
  // decode through a recolouring pass keyed on the resolved ink hex.
  const diagramInkHex = useMemo((): string | null => {
    const ds = resolveDiagramStyleConfig(deferredConfig.diagramStyle);
    if (!ds.singleInk) return null;
    return resolveColorValue(ds.inkColor, deferredConfig.colorPalette, ds.inkColor).hex;
  }, [deferredConfig]);
  // SVG text in the book's fonts (#630) unless diagramStyle.inlineFonts is off.
  const inlineSvgFonts = deferredConfig.diagramStyle?.inlineFonts !== false;

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
    ensureResourceImages(deferredResources, diagramInkHex, { inlineFonts: inlineSvgFonts })
      .then((changed) => {
        if (!cancelled && changed) setPaintKey((k) => k + 1);
      })
      .catch(() => { /* leave placeholders */ });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredResources, diagramInkHex, inlineSvgFonts]);

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
    renderOptsRef.current = {
      pageNegative: debugConfig.pageNegative.enabled,
      ...(printPreviewRef.current ? { printPreview: printPreviewRef.current } : {}),
    };
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
      binding: doc.binding === 'right' ? 'right' : 'left',
      firstRecto: (doc.pageIndexOffset ?? 0) % 2 === 0,
    };
    const structureSame = sameStructure(lastGeomRef.current, geom)
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
        // A composed page the relayout left as it was (same frames, same
        // running heads) keeps its pixels, unless the pictures changed.
        const keep = (pageIndex: number): boolean => {
          const page = doc.pages[pageIndex];
          return lastPaintedPaintKeyRef.current === paintKey && !stalePagesRef.current.has(pageIndex)
            && page !== undefined && paintedPagesRef.current.same(pageIndex, page, renderOpts);
        };
        for (const pageIndex of renderedPagesRef.current) {
          if (keep(pageIndex)) continue;
          if (!visiblePagesRef.current.has(pageIndex)) {
            stalePagesRef.current.add(pageIndex);
            continue;
          }
          const canvas = canvasMapRef.current.get(pageIndex);
          const page = doc.pages[pageIndex];
          if (canvas && page) {
            renderPageToCanvas(page, doc, canvas, renderOpts);
            paintedPagesRef.current.painted(pageIndex, page, renderOpts);
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
    paintedPagesRef.current.clear();
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
      (pageIndex, count) => pageLabelRef.current
        .replace('__n__', String(pageIndex + 1))
        .replace('__total__', String(count)),
      labelsRef,
      gapsRef.current,
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
      paintedPagesRef.current.painted(pageIndex, page, renderOpts);
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
        paintedPagesRef.current.forget(victim);
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
          const opts = paintOptionsRef.current();
          renderPageToCanvas(docRef.current.pages[idx]!, docRef.current, canvas, opts);
          paintedPagesRef.current.painted(idx, docRef.current.pages[idx]!, opts);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [navigateRef, docVersion, paintKey, layoutKey, zoom, viewMode, fitMode, deferredConfig, applyDisplaySize]);
  return {
  };
}
