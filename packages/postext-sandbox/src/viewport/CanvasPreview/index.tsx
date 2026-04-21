'use client';

import { useEffect, useRef, useState, useDeferredValue, useMemo } from 'react';
import { useSandboxDispatch, useSandboxDocRef, useSandboxSelector } from '../../context/SandboxContext';
import { buildDocument, renderPageToCanvas, clearMeasurementCache, createMeasurementCache, resolveDebugConfig, initMathEngine, isMathReady } from 'postext';
import type { VDTDocument, HyphenationLocale, PostextConfig, RenderPageOptions, MeasurementCache } from 'postext';
import { createPageCanvas, createOverlaySvg } from './dom';
import { drawOverlay } from './overlay';
import { attachSlotClickHandler } from './interaction';
import { ensureConfigFontsLoaded, getConfigFontSpecs } from '../../controls/fontLoader';

const LOCALE_TO_HYPHENATION: Record<string, HyphenationLocale> = {
  en: 'en-us', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', ca: 'ca', nl: 'nl',
};

type ViewMode = 'single' | 'spread';
type FitMode = 'none' | 'width' | 'height';

interface CanvasPreviewProps {
  zoom: number;
  viewMode: ViewMode;
  fitMode: FitMode;
}

interface GeomSnapshot {
  pageCount: number;
  pageWidthPx: number;
  pageHeightPx: number;
  displayWidth: number;
  displayHeight: number;
  viewMode: ViewMode;
}

/**
 * Groups pages into rows for display.
 * Single mode: one page per row.
 * Spread mode: page 0 alone (on the right, like a book recto),
 * then pairs [1,2], [3,4], ... Last unpaired page goes on the left.
 */
function groupPagesIntoRows(pageCount: number, viewMode: ViewMode): number[][] {
  if (viewMode === 'single') {
    return Array.from({ length: pageCount }, (_, i) => [i]);
  }
  const rows: number[][] = [];
  if (pageCount > 0) rows.push([0]);
  for (let i = 1; i < pageCount; i += 2) {
    if (i + 1 < pageCount) {
      rows.push([i, i + 1]);
    } else {
      rows.push([i]);
    }
  }
  return rows;
}

/**
 * Canvas preview that renders the document using the postext layout engine.
 * Builds a VDT at the configured DPI (default 300), then lazily renders
 * only the pages visible in the scroll viewport via IntersectionObserver.
 */
export function CanvasPreview({ zoom, viewMode, fitMode }: CanvasPreviewProps) {
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
  const measureCacheRef = useRef<MeasurementCache>(createMeasurementCache());
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
    const padding = 32;
    const gap = 24;
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
      const paddingTop = rowIdx === 0 ? padding : gap / 2;
      const paddingBottom = rowIdx === totalRows - 1 ? padding : gap / 2;
      rowDiv.style.minHeight = `${displayHeight + paddingTop + paddingBottom}px`;
    });
    const innerDiv = container.firstChild as HTMLDivElement | null;
    if (innerDiv) {
      innerDiv.style.width = `${displayWidth * pagesPerRow + gap * (pagesPerRow - 1) + padding * 2}px`;
    }
    if (prev) {
      prev.displayWidth = displayWidth;
      prev.displayHeight = displayHeight;
    }
  };

  const computeDisplaySize = (containerW: number, containerH: number) => {
    const padding = 32;
    const gap = 24;
    const isSpread = viewMode === 'spread';
    const doc = docRef.current;
    const firstPage = doc?.pages[0];
    const aspectRatio = firstPage ? firstPage.height / firstPage.width : 1;
    let displayWidth: number;
    if (fitMode === 'width') {
      displayWidth = isSpread
        ? (containerW - padding * 2 - gap) / 2
        : containerW - padding * 2;
    } else if (fitMode === 'height') {
      const containerInnerH = containerH - padding * 2;
      displayWidth = containerInnerH / aspectRatio;
      if (isSpread) {
        const maxPerPage = (containerW - padding * 2 - gap) / 2;
        displayWidth = Math.min(displayWidth, maxPerPage);
      }
    } else {
      const base = Math.min(containerW - padding * 2, 800);
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

  // Kick off MathJax init once the document contains math. Once ready, bump
  // `rebuildKey` so the pipeline re-builds with real math renders instead of
  // the placeholder boxes the first pass may have produced.
  useEffect(() => {
    if (isMathReady()) return;
    if (!/\$/.test(deferredMarkdown)) return;
    let cancelled = false;
    initMathEngine().then(() => {
      if (!cancelled) {
        setRebuildKey((k) => k + 1);
      }
    }).catch(() => { /* error surfaces via warnings */ });
    return () => { cancelled = true; };
  }, [deferredMarkdown]);

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
  useEffect(() => {
    // Gate the build on actual font availability. `document.fonts.check` is
    // authoritative — if any face the config needs isn't loaded, measureText
    // would return fallback metrics and poison the cache. We kick off an
    // explicit load and defer the build until they resolve.
    if (typeof document !== 'undefined' && document.fonts) {
      const missing = getConfigFontSpecs(deferredConfig).filter((s) => !document.fonts.check(s));
      if (missing.length > 0) {
        let cancelled = false;
        ensureConfigFontsLoaded(deferredConfig).then(() => {
          if (!cancelled) setRebuildKey((k) => k + 1);
        });
        return () => {
          cancelled = true;
        };
      }
    }

    // The block measurement cache keys already encode the measurement-
    // relevant fields (text, font, width, line height, alignment,
    // hyphenation, word-spacing bounds, indents). A config change that
    // doesn't affect any of those produces the same keys, so cached values
    // stay valid. We only wipe the cache on rebuild-invalidating events
    // (fonts loaded / math ready), tracked via `rebuildKey`.
    if (appliedRebuildKeyRef.current !== rebuildKey) {
      measureCacheRef.current = createMeasurementCache();
      appliedRebuildKeyRef.current = rebuildKey;
      clearMeasurementCache();
    }

    try {
      const doc = buildDocument(
        { markdown: deferredMarkdown },
        deferredConfig,
        measureCacheRef.current,
      );
      docRef.current = doc;
      sharedDocRef.current = doc;
      dispatch({ type: 'BUMP_DOC_VERSION' });
      setDocVersion((v) => v + 1);
    } catch (err) {
      console.error('[CanvasPreview] Layout error:', err);
    }
  }, [deferredMarkdown, deferredConfig, rebuildKey, dispatch, sharedDocRef]);

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

    const padding = 32;
    const gap = 24;
    const firstPage = doc.pages[0]!;
    const aspectRatio = firstPage.height / firstPage.width;
    const isSpread = viewMode === 'spread';

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

    const pagesPerRow = isSpread ? 2 : 1;
    const innerWidth = displayWidth * pagesPerRow + gap * (pagesPerRow - 1) + padding * 2;
    const innerDiv = document.createElement('div');
    innerDiv.style.width = `${innerWidth}px`;
    innerDiv.style.margin = '0 auto';

    const canvasMap = canvasMapRef.current;
    const overlayMap = overlayMapRef.current;
    const rows = groupPagesIntoRows(doc.pages.length, viewMode);
    const allSlots: HTMLDivElement[] = [];

    for (let rowIdx = 0; rowIdx < rows.length; rowIdx++) {
      const row = rows[rowIdx]!;
      const rowDiv = document.createElement('div');
      rowDiv.style.display = 'flex';
      rowDiv.style.justifyContent = 'center';
      rowDiv.style.alignItems = 'flex-start';
      const paddingTop = rowIdx === 0 ? padding : gap / 2;
      const paddingBottom = rowIdx === rows.length - 1 ? padding : gap / 2;
      rowDiv.style.padding = `${paddingTop}px ${padding}px ${paddingBottom}px`;
      rowDiv.style.gap = `${gap}px`;
      rowDiv.style.boxSizing = 'border-box';
      rowDiv.style.minHeight = `${displayHeight + paddingTop + paddingBottom}px`;
      rowDiv.dataset.pageRow = '1';

      if (isSpread && row.length === 1) {
        const pageIndex = row[0]!;
        const isFirstPage = pageIndex === 0;

        if (isFirstPage) {
          const spacer = document.createElement('div');
          spacer.style.width = `${displayWidth}px`;
          spacer.style.flexShrink = '0';
          spacer.dataset.spreadSpacer = '1';
          rowDiv.appendChild(spacer);
        }

        const slot = document.createElement('div');
        slot.style.flexShrink = '0';
        slot.style.position = 'relative';
        slot.dataset.pageIndex = String(pageIndex);

        const canvas = createPageCanvas(displayWidth, displayHeight);
        slot.appendChild(canvas);
        canvasMap.set(pageIndex, canvas);
        const overlay = createOverlaySvg(displayWidth, displayHeight, pageWidthPx, pageHeightPx);
        slot.appendChild(overlay);
        overlayMap.set(pageIndex, overlay);
        attachSlotClickHandler(slot, pageIndex, pageWidthPx, pageHeightPx, docRef, dispatchRef, activePanelRef);
        allSlots.push(slot);
        rowDiv.appendChild(slot);

        if (!isFirstPage) {
          const spacer = document.createElement('div');
          spacer.style.width = `${displayWidth}px`;
          spacer.style.flexShrink = '0';
          spacer.dataset.spreadSpacer = '1';
          rowDiv.appendChild(spacer);
        }
      } else {
        for (const pageIndex of row) {
          const slot = document.createElement('div');
          slot.style.flexShrink = '0';
          slot.style.position = 'relative';
          slot.dataset.pageIndex = String(pageIndex);

          const canvas = createPageCanvas(displayWidth, displayHeight);
          slot.appendChild(canvas);
          canvasMap.set(pageIndex, canvas);
          const overlay = createOverlaySvg(displayWidth, displayHeight, pageWidthPx, pageHeightPx);
          slot.appendChild(overlay);
          overlayMap.set(pageIndex, overlay);
          attachSlotClickHandler(slot, pageIndex, pageWidthPx, pageHeightPx, docRef, dispatchRef, activePanelRef);
          allSlots.push(slot);
          rowDiv.appendChild(slot);
        }
      }

      innerDiv.appendChild(rowDiv);
    }

    // Pre-render pages that were visible in the previous document so the
    // swap from old DOM to new DOM shows already-painted pixels.
    const renderedSet = new Set<number>();
    for (const pageIndex of previouslyRendered) {
      const canvas = canvasMap.get(pageIndex);
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
    // Find the block that should host the caret. Prefer the block that
    // actually contains the source offset; otherwise fall back to the first
    // block starting at or after the offset (cursor between paragraphs).
    let caretBlockIdx = -1;
    const { head } = selection;
    for (let i = 0; i < doc.blocks.length; i++) {
      const b = doc.blocks[i]!;
      if (b.sourceStart === undefined || b.sourceEnd === undefined) continue;
      if (head >= b.sourceStart && head <= b.sourceEnd) { caretBlockIdx = i; break; }
    }
    if (caretBlockIdx === -1) {
      for (let i = 0; i < doc.blocks.length; i++) {
        const b = doc.blocks[i]!;
        if (b.sourceStart === undefined) continue;
        if (b.sourceStart >= head) { caretBlockIdx = i; break; }
      }
    }
    if (caretBlockIdx === -1 && doc.blocks.length > 0) {
      caretBlockIdx = doc.blocks.length - 1;
    }

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

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: 'var(--surface)', overflow: 'auto', scrollbarGutter: 'stable' }}
    />
  );
}
