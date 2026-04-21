'use client';

import { useEffect, useRef, useState, useDeferredValue, useMemo } from 'react';
import { useSandbox } from '../../context/SandboxContext';
import { buildDocument, renderPageToCanvas, clearMeasurementCache, createMeasurementCache, resolveDebugConfig } from 'postext';
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
  const { state, dispatch, docRef: sharedDocRef } = useSandbox();
  const containerRef = useRef<HTMLDivElement>(null);
  // Refs used by click handlers so changing panel/dispatch identity doesn't
  // force a full DOM rebuild of the page slots.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const activePanelRef = useRef(state.activePanel);
  activePanelRef.current = state.activePanel;
  const docRef = useRef<VDTDocument | null>(null);
  const observerRef = useRef<IntersectionObserver | null>(null);
  const canvasMapRef = useRef<Map<number, HTMLCanvasElement>>(new Map());
  const overlayMapRef = useRef<Map<number, SVGSVGElement>>(new Map());
  const renderedPagesRef = useRef<Set<number>>(new Set());
  const deferredMarkdown = useDeferredValue(state.markdown);
  const rawDeferredConfig = useDeferredValue(state.config);
  // Inject app-locale-derived hyphenation locale when user hasn't set one explicitly
  const deferredConfig = useMemo((): PostextConfig => {
    if (rawDeferredConfig.bodyText?.hyphenation?.locale) return rawDeferredConfig;
    const hypLocale = LOCALE_TO_HYPHENATION[state.locale] ?? 'en-us';
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
  }, [rawDeferredConfig, state.locale]);
  const measureCacheRef = useRef<MeasurementCache>(createMeasurementCache());
  const cacheInvalidationRef = useRef({ config: deferredConfig, resizeKey: 0 });
  const [resizeKey, setResizeKey] = useState(0);
  const [docVersion, setDocVersion] = useState(0);

  // Resize observer — triggers repaint when container size changes
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const observer = new ResizeObserver(() => {
      setResizeKey((k) => k + 1);
    });

    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  // Rebuild when any font finishes loading after the initial layout.
  // document.fonts.ready only waits for *currently pending* faces; a face
  // requested later (or one that slips past the preload) can land after the
  // first measurement, poisoning the cache with fallback metrics. Bumping
  // resizeKey on loadingdone invalidates the measurement cache and triggers
  // a fresh buildDocument with the now-loaded glyph widths.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const onLoadingDone = () => setResizeKey((k) => k + 1);
    document.fonts.addEventListener('loadingdone', onLoadingDone);
    return () => document.fonts.removeEventListener('loadingdone', onLoadingDone);
  }, []);

  // Build document and set up lazy rendering via IntersectionObserver
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const rect = container.getBoundingClientRect();
    if (rect.width === 0) return;

    // Gate the build on actual font availability. `document.fonts.check` is
    // authoritative — if any face the config needs isn't loaded, measureText
    // would return fallback metrics and poison the cache. We kick off an
    // explicit load and defer the build until they resolve.
    if (typeof document !== 'undefined' && document.fonts) {
      const missing = getConfigFontSpecs(deferredConfig).filter((s) => !document.fonts.check(s));
      if (missing.length > 0) {
        let cancelled = false;
        ensureConfigFontsLoaded(deferredConfig).then(() => {
          if (!cancelled) setResizeKey((k) => k + 1);
        });
        return () => {
          cancelled = true;
        };
      }
    }

    clearMeasurementCache();

    // Invalidate block measurement cache when config or container size changes
    if (cacheInvalidationRef.current.config !== deferredConfig || cacheInvalidationRef.current.resizeKey !== resizeKey) {
      measureCacheRef.current = createMeasurementCache();
      cacheInvalidationRef.current = { config: deferredConfig, resizeKey };
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

      // Tear down previous observer + maps, but keep the old DOM in place
      // until the new one is fully built and painted — this avoids a blank
      // flash while the user is typing fast.
      observerRef.current?.disconnect();
      canvasMapRef.current.clear();
      overlayMapRef.current.clear();
      const previouslyRendered = renderedPagesRef.current;
      renderedPagesRef.current = new Set();

      if (doc.pages.length === 0) {
        while (container.firstChild) container.removeChild(container.firstChild);
        return;
      }

      // Compute uniform CSS display dimensions (all pages share the same size)
      const padding = 32;
      const gap = 24;
      const firstPage = doc.pages[0]!;
      const aspectRatio = firstPage.height / firstPage.width;

      let displayWidth: number;
      const isSpread = viewMode === 'spread';

      if (fitMode === 'width') {
        if (isSpread) {
          displayWidth = (rect.width - padding * 2 - gap) / 2;
        } else {
          displayWidth = rect.width - padding * 2;
        }
      } else if (fitMode === 'height') {
        const containerHeight = rect.height - padding * 2;
        displayWidth = containerHeight / aspectRatio;
        if (isSpread) {
          const maxPerPage = (rect.width - padding * 2 - gap) / 2;
          displayWidth = Math.min(displayWidth, maxPerPage);
        }
      } else {
        const base = Math.min(rect.width - padding * 2, 800);
        displayWidth = base * zoom;
      }

      displayWidth = Math.max(displayWidth, 50);
      const displayHeight = displayWidth * aspectRatio;

      // Inner wrapper centers content via auto margins, enabling full
      // horizontal scroll in both directions when zoomed in
      const pagesPerRow = isSpread ? 2 : 1;
      const innerWidth = displayWidth * pagesPerRow + gap * (pagesPerRow - 1) + padding * 2;
      const innerDiv = document.createElement('div');
      innerDiv.style.width = `${innerWidth}px`;
      innerDiv.style.margin = '0 auto';

      const canvasMap = canvasMapRef.current;
      const overlayMap = overlayMapRef.current;
      const pageWidthPx = firstPage.width;
      const pageHeightPx = firstPage.height;
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

        if (isSpread && row.length === 1) {
          const pageIndex = row[0]!;
          const isFirstPage = pageIndex === 0;

          // First page (cover) goes on the RIGHT (recto in book terms)
          // Trailing unpaired page goes on the LEFT (verso)
          if (isFirstPage) {
            // Spacer on the left
            const spacer = document.createElement('div');
            spacer.style.width = `${displayWidth}px`;
            spacer.style.flexShrink = '0';
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
          attachSlotClickHandler(slot, pageIndex, displayWidth, displayHeight, pageWidthPx, pageHeightPx, docRef, dispatchRef, activePanelRef);
          allSlots.push(slot);
          rowDiv.appendChild(slot);

          if (!isFirstPage) {
            // Spacer on the right for trailing unpaired page
            const spacer = document.createElement('div');
            spacer.style.width = `${displayWidth}px`;
            spacer.style.flexShrink = '0';
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
            attachSlotClickHandler(slot, pageIndex, displayWidth, displayHeight, pageWidthPx, pageHeightPx, docRef, dispatchRef, activePanelRef);
            allSlots.push(slot);
            rowDiv.appendChild(slot);
          }
        }

        innerDiv.appendChild(rowDiv);
      }

      // Pre-render pages that were visible in the previous document so the
      // swap from old DOM to new DOM shows already-painted pixels. Any page
      // not in the new doc is simply skipped.
      const debugConfig = resolveDebugConfig(deferredConfig.debug);
      const renderOpts: RenderPageOptions = { pageNegative: debugConfig.pageNegative.enabled };
      const renderedSet = new Set<number>();
      for (const pageIndex of previouslyRendered) {
        const canvas = canvasMap.get(pageIndex);
        const page = doc.pages[pageIndex];
        if (!canvas || !page) continue;
        renderPageToCanvas(page, doc, canvas, renderOpts);
        renderedSet.add(pageIndex);
      }
      renderedPagesRef.current = renderedSet;

      // Atomic swap: remove old children and attach the new tree in one go.
      while (container.firstChild) container.removeChild(container.firstChild);
      container.appendChild(innerDiv);

      // Lazy-render pages as they scroll into view
      const observer = new IntersectionObserver(
        (entries) => {
          for (const entry of entries) {
            const idx = Number((entry.target as HTMLElement).dataset.pageIndex);
            const canvas = canvasMap.get(idx);
            if (!canvas || !docRef.current) continue;

            if (entry.isIntersecting && !renderedSet.has(idx)) {
              renderPageToCanvas(docRef.current.pages[idx]!, docRef.current, canvas, renderOpts);
              renderedSet.add(idx);
            } else if (!entry.isIntersecting && renderedSet.has(idx)) {
              // Release GPU memory for off-screen pages
              canvas.width = 1;
              canvas.height = 1;
              renderedSet.delete(idx);
            }
          }
        },
        { root: container, rootMargin: '200px 0px 200px 0px' },
      );
      observerRef.current = observer;

      for (const slot of allSlots) {
        observer.observe(slot);
      }

      setDocVersion((v) => v + 1);
    } catch (err) {
      console.error('[CanvasPreview] Layout error:', err);
    }

    return () => {
      observerRef.current?.disconnect();
    };
  }, [deferredMarkdown, deferredConfig, resizeKey, zoom, viewMode, fitMode]);

  // Draw cursor/selection overlays whenever selection or debug config changes
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const debug = resolveDebugConfig(state.config.debug);
    const selection = state.selection;
    const focused = state.editorFocused;
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
  }, [state.selection, state.config.debug, state.editorFocused, docVersion]);

  return (
    <div
      ref={containerRef}
      className="h-full w-full"
      style={{ backgroundColor: 'var(--surface)', overflow: 'auto' }}
    />
  );
}
