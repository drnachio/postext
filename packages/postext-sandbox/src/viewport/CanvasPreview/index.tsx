'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState, useDeferredValue, useMemo } from 'react';
import { useSandboxDispatch, useSandboxDocRef, useSandboxSelector } from '../../context/SandboxContext';
import { renderPageToCanvas, resolveDebugConfig } from 'postext';
import type { VDTDocument, PostextConfig, RenderPageOptions } from 'postext';
import { drawOverlay } from './overlay';
import { ensureConfigFontsLoaded, getConfigFontSpecs } from '../../controls/fontLoader';
import { useLayoutWorker } from '../../worker/useLayoutWorker';
import {
  LOCALE_TO_HYPHENATION,
  PAGE_GAP,
  PAGE_PADDING,
  type FitMode,
  type GeomSnapshot,
  type ViewMode,
} from './layoutUtils';
import { findCaretBlockIdx } from './caret';
import { buildPagesDom } from './pageDom';

interface CanvasPreviewProps {
  zoom: number;
  viewMode: ViewMode;
  fitMode: FitMode;
  onGeneratingChange?: (generating: boolean) => void;
  onPageCountChange?: (count: number) => void;
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
 */
export const CanvasPreview = forwardRef<CanvasPreviewHandle, CanvasPreviewProps>(
function CanvasPreview({ zoom, viewMode, fitMode, onGeneratingChange, onPageCountChange, onCurrentPageChange }, ref) {
  const dispatch = useSandboxDispatch();
  const sharedDocRef = useSandboxDocRef();
  const markdown = useSandboxSelector((s) => s.markdown);
  const config = useSandboxSelector((s) => s.config);
  const locale = useSandboxSelector((s) => s.locale);
  const activePanel = useSandboxSelector((s) => s.activePanel);
  const selection = useSandboxSelector((s) => s.selection);
  const editorFocused = useSandboxSelector((s) => s.editorFocused);
  const containerRef = useRef<HTMLDivElement>(null);
  // Refs used by click handlers so changing panel/dispatch identity doesn't
  // force a full DOM rebuild of the page slots.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const activePanelRef = useRef(activePanel);
  activePanelRef.current = activePanel;
  const docRef = useRef<VDTDocument | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const canvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const overlayMapRef = useRef<Map<number, SVGSVGElement>>(new Map());
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const lastGeomRef = useRef<GeomSnapshot | null>(null);
  // Tracks the docVersion last painted into the canvas bitmaps so we can
  // skip bitmap repaints on pure CSS-size changes (window/sidebar resize).
  // The canvas internal pixel size is fixed at page dimensions, so browser
  // scaling handles size changes with no paint cost.
  const lastPaintedDocVersionRef = useRef(-1);
  const deferredMarkdown = useDeferredValue(markdown);
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
  const layoutWorker = useLayoutWorker();
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

  const applyDisplaySize = (displayWidth: number, displayHeight: number) => {
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
    }
  };

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
      containerSizeRef.current = { width: rect.width, height: rect.height };
      const { displayWidth, displayHeight } = computeDisplaySizeRef.current(rect.width, rect.height);
      applyDisplaySize(displayWidth, displayHeight);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When zoom or fit mode change, recompute display size imperatively.
  useEffect(() => {
    const { width, height } = containerSizeRef.current;
    if (width === 0) return;
    const { displayWidth, displayHeight } = computeDisplaySize(width, height);
    applyDisplaySize(displayWidth, displayHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, fitMode]);

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
    layoutWorker.build({ markdown: deferredMarkdown }, deferredConfig)
      .then((doc) => {
        if (cancelled) return;
        docRef.current = doc;
        sharedDocRef.current = doc;
        dispatch({ type: 'BUMP_DOC_VERSION' });
        setDocVersion((v) => v + 1);
        onPageCountChangeRef.current?.(doc.pages.length);
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
  }, [deferredMarkdown, deferredConfig, rebuildKey, dispatch, sharedDocRef, layoutWorker]);

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
      lastGeomRef.current = null;
      return;
    }

    const firstPage = doc.pages[0]!;
    const { displayWidth, displayHeight } = computeDisplaySize(containerW, containerH);

    const debugConfig = resolveDebugConfig(deferredConfig.debug);
    const renderOpts: RenderPageOptions = { pageNegative: debugConfig.pageNegative.enabled };
    const pageWidthPx = firstPage.width;
    const pageHeightPx = firstPage.height;

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
      // Only repaint bitmaps when the doc itself changed. CSS scaling
      // handles pure size changes (window/sidebar resize) at zero bitmap cost.
      if (lastPaintedDocVersionRef.current !== docVersion) {
        for (const pageIndex of renderedPagesRef.current) {
          const canvas = canvasMapRef.current.get(pageIndex);
          const page = doc.pages[pageIndex];
          if (canvas && page) renderPageToCanvas(page, doc, canvas, renderOpts);
        }
        lastPaintedDocVersionRef.current = docVersion;
      }
      lastGeomRef.current = geom;
      return;
    }

    // Structure changed — tear down and rebuild the page DOM. Keep the old
    // DOM in place until the new one is fully built and painted so fast
    // typing doesn't flash blank.
    observerRef.current?.disconnect();
    canvasMapRef.current.clear();
    overlayMapRef.current.clear();
    const previouslyRendered = renderedPagesRef.current;
    renderedPagesRef.current = new Set();

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
    );

    // Pre-render pages that were visible in the previous document so the
    // swap from old DOM to new DOM shows already-painted pixels.
    const renderedSet = new Set<number>();
    for (const pageIndex of previouslyRendered) {
      const canvas = canvasMapRef.current.get(pageIndex);
      const page = doc.pages[pageIndex];
      if (!canvas || !page) continue;
      renderPageToCanvas(page, doc, canvas, renderOpts);
      renderedSet.add(pageIndex);
    }
    renderedPagesRef.current = renderedSet;
    lastPaintedDocVersionRef.current = docVersion;

    while (container.firstChild) container.removeChild(container.firstChild);
    container.appendChild(innerDiv);

    // Rasterize on entry but never release bitmaps on exit. Once a page is
    // painted, its bitmap stays cached so resize / scroll can't thrash the
    // rasterizer: the browser scales the existing bitmap for free and there
    // is no work to redo when a page crosses the intersection margin.
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const idx = Number((entry.target as HTMLElement).dataset.pageIndex);
          if (renderedPagesRef.current.has(idx)) continue;
          const canvas = canvasMapRef.current.get(idx);
          if (!canvas || !docRef.current) continue;
          renderPageToCanvas(docRef.current.pages[idx]!, docRef.current, canvas, renderOpts);
          renderedPagesRef.current.add(idx);
        }
      },
      { root: container, rootMargin: '200px 0px 200px 0px' },
    );
    observerRef.current = observer;
    for (const slot of allSlots) observer.observe(slot);
    lastGeomRef.current = geom;
  }, [docVersion, layoutKey, zoom, viewMode, fitMode, deferredConfig]);

  // Draw cursor/selection overlays whenever selection or debug config changes
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const debug = resolveDebugConfig(config.debug);
    const focused = editorFocused;
    const caretBlockIdx = findCaretBlockIdx(doc, selection.head);

    let activeCursorRect: SVGRectElement | null = null;
    for (const [pageIndex, overlay] of overlayMapRef.current) {
      const page = doc.pages[pageIndex];
      if (!page) continue;
      const rect = drawOverlay(overlay, doc, pageIndex, selection, debug, focused, caretBlockIdx);
      if (rect) activeCursorRect = rect;
    }

    const container = containerRef.current;
    const isCollapsed = selection.from === selection.to;
    const scrollEnabled = isCollapsed
      ? debug.cursorSync.enabled
      : debug.selectionSync.enabled;
    if (
      activeCursorRect &&
      container &&
      focused &&
      scrollEnabled
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
  }, [selection, config.debug, editorFocused, docVersion]);

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
