'use client';

import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef, useState, useDeferredValue } from 'react';
import {
  renderToHtmlIndexed,
  dimensionToPx,
  resolveHtmlViewerConfig,
  resolveDebugConfig,
} from 'postext';
import type {
  VDTDocument,
  HtmlRenderIndex,
} from 'postext';
import { useSandbox } from '../../context/SandboxContext';
import { useShadowDom } from '../../hooks/useShadowDom';
import { ensureConfigFontsLoaded, getConfigFontSpecs } from '../../controls/fontLoader';
import { useLayoutWorker } from '../../worker/useLayoutWorker';
import { createOverlaySvg } from '../CanvasPreview/dom';
import { drawOverlay, drawBaselines } from '../CanvasPreview/overlay';
import { attachSlotClickHandler } from '../CanvasPreview/interaction';
import {
  type ColumnMode,
  HTML_DPI,
  PADDING_PX,
  RESIZE_DEBOUNCE_MS,
  SHADOW_CSS,
  buildColumnWidthSample,
  composePageBackground,
} from './constants';
import { buildHtmlConfigOverride, measureColumnWidthPx } from './configOverride';
import { cssEscape, measureBodyBaselineOffset } from './baseline';

interface HtmlPreviewProps {
  fontScale: number;
  columnMode: ColumnMode;
  onGeneratingChange?: (generating: boolean) => void;
  // Emits whether the viewer can scroll further in each direction. Scroll
  // bounds rather than column indices — the viewer may show several columns
  // per viewport, so reporting a single "current column" is ambiguous.
  onScrollBoundsChange?: (info: { canPrev: boolean; canNext: boolean }) => void;
}

export interface HtmlPreviewHandle {
  regenerate: () => void;
  scrollColumn: (delta: number) => void;
}

export const HtmlPreview = forwardRef<HtmlPreviewHandle, HtmlPreviewProps>(
function HtmlPreview({ fontScale, columnMode, onGeneratingChange, onScrollBoundsChange }, ref) {
  const { state, dispatch, docRef: sharedDocRef } = useSandbox();
  const { hostRef, shadowRef } = useShadowDom();
  const deferredMarkdown = useDeferredValue(state.markdown);
  const deferredConfig = useDeferredValue(state.config);

  const layoutWorker = useLayoutWorker();
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const contentHostRef = useRef<HTMLDivElement | null>(null);
  const viewportSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const relayoutTimerRef = useRef<number | null>(null);
  const renderSeqRef = useRef(0);
  // Column geometry captured by the last successful relayout. Used by the
  // column-scroll imperative API and the current-column emitter so they read
  // the same values doRelayout decided on, without recomputing them.
  const columnGeomRef = useRef<{ columnWidthPx: number; columnGapPx: number }>({ columnWidthPx: 0, columnGapPx: 0 });
  const onGeneratingChangeRef = useRef(onGeneratingChange);
  onGeneratingChangeRef.current = onGeneratingChange;
  const onScrollBoundsChangeRef = useRef(onScrollBoundsChange);
  onScrollBoundsChangeRef.current = onScrollBoundsChange;

  // Refs for click-handler plumbing — same pattern as CanvasPreview so the
  // reused attachSlotClickHandler can dispatch and detect the active panel
  // without re-attaching on every render.
  const dispatchRef = useRef(dispatch);
  dispatchRef.current = dispatch;
  const activePanelRef = useRef(state.activePanel);
  activePanelRef.current = state.activePanel;
  const docRef = useRef<VDTDocument | null>(null);
  const overlayMapRef = useRef<Map<number, SVGSVGElement>>(new Map());
  // Previous indexed render — drives block-level DOM patching so that an
  // edit that changed a single paragraph touches only that paragraph's DOM.
  const lastRenderRef = useRef<HtmlRenderIndex | null>(null);
  // Signature captured alongside the last render. When any of these differ
  // on the next pass we fall back to a full innerHTML rebuild instead of
  // trying to patch.
  const lastRenderSigRef = useRef<string | null>(null);
  const [docVersion, setDocVersion] = useState(0);

  // Latest-value refs so the stable ResizeObserver / font-loader callbacks
  // don't capture stale values via closure.
  const fontScaleRef = useRef(fontScale);
  const columnModeRef = useRef<ColumnMode>(columnMode);
  const markdownRef = useRef(deferredMarkdown);
  const configRef = useRef(deferredConfig);
  const localeRef = useRef(state.locale);
  fontScaleRef.current = fontScale;
  columnModeRef.current = columnMode;
  markdownRef.current = deferredMarkdown;
  configRef.current = deferredConfig;
  localeRef.current = state.locale;

  // Initialize shadow DOM structure once.
  useEffect(() => {
    const shadow = shadowRef.current;
    if (!shadow) return;
    shadow.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = SHADOW_CSS;
    shadow.appendChild(style);
    const scroll = document.createElement('div');
    scroll.className = 'pt-scroll';
    shadow.appendChild(scroll);
    scrollHostRef.current = scroll;
    contentHostRef.current = scroll;
    // The DOM that lastRender was diffing against is gone — force a full
    // rebuild on the next relayout.
    lastRenderRef.current = null;
    lastRenderSigRef.current = null;
    overlayMapRef.current.clear();
    return () => {
      scrollHostRef.current = null;
      contentHostRef.current = null;
      lastRenderRef.current = null;
      lastRenderSigRef.current = null;
    };
  }, [shadowRef]);

  // Memoize a trigger key so effects run only when real inputs change.
  const renderKey = useMemo(
    () => ({
      markdown: deferredMarkdown,
      config: deferredConfig,
      fontScale,
      columnMode,
      locale: state.locale,
    }),
    [deferredMarkdown, deferredConfig, fontScale, columnMode, state.locale],
  );

  // Font-loading awareness: rebuild when fonts land so measurements aren't
  // taken against fallbacks. Glyph widths may differ once the real font
  // arrives, so invalidate the measurement caches before the next relayout.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const onLoadingDone = () => {
      // Worker owns its own measurement cache; when fonts land the main
      // thread re-triggers a relayout and the worker picks up the newly-
      // registered faces on its next build.
      scheduleRelayout(0);
    };
    document.fonts.addEventListener('loadingdone', onLoadingDone);
    return () => document.fonts.removeEventListener('loadingdone', onLoadingDone);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ResizeObserver on the host div → debounced relayout.
  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const observer = new ResizeObserver((entries) => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        viewportSizeRef.current = { width, height };
      }
      scheduleRelayout(RESIZE_DEBOUNCE_MS);
    });
    observer.observe(host);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function scheduleRelayout(delay: number) {
    if (relayoutTimerRef.current !== null) {
      window.clearTimeout(relayoutTimerRef.current);
    }
    relayoutTimerRef.current = window.setTimeout(() => {
      relayoutTimerRef.current = null;
      void doRelayout();
    }, delay);
  }

  async function doRelayout() {
    const seq = ++renderSeqRef.current;
    const scroll = scrollHostRef.current;
    if (!scroll) return;
    onGeneratingChangeRef.current?.(true);

    const host = hostRef.current;
    if (!host) return;
    const rect = host.getBoundingClientRect();
    const viewportWidth = rect.width;
    const viewportHeight = rect.height;
    if (viewportWidth === 0 || viewportHeight === 0) return;

    const currentFontScale = fontScaleRef.current;
    const currentColumnMode = columnModeRef.current;
    const currentMarkdown = markdownRef.current;
    const currentConfig = configRef.current;
    const currentLocale = localeRef.current;

    const htmlViewer = resolveHtmlViewerConfig(currentConfig.htmlViewer);
    const columnGapPx = htmlViewer.columnGap;
    const maxCharsPerLine = htmlViewer.maxCharsPerLine;
    const columnWidthSample = buildColumnWidthSample(maxCharsPerLine);

    // Wait for required fonts, so measurement isn't poisoned by fallbacks.
    if (typeof document !== 'undefined' && document.fonts) {
      const missing = getConfigFontSpecs(currentConfig).filter(
        (s) => !document.fonts.check(s),
      );
      if (missing.length > 0) {
        await ensureConfigFontsLoaded(currentConfig);
        if (seq !== renderSeqRef.current) return;
      }
    }

    // NOTE: the measurement cache persists across relayouts. Keys bake in
    // text + font + width + line-breaking options, so entries that no longer
    // match simply go unused. The font `loadingdone` handler clears the
    // cache when glyph measurements may have changed.

    // Resolve body font + size → measure N-char target column width.
    const bodyFontFamily = currentConfig.bodyText?.fontFamily ?? 'EB Garamond';
    const bodyFontWeight = currentConfig.bodyText?.fontWeight ?? 400;
    const baseBodySize = currentConfig.bodyText?.fontSize ?? { value: 8, unit: 'pt' as const };
    const scaledBodyDim = { value: baseBodySize.value * currentFontScale, unit: baseBodySize.unit };
    const scaledBodyPx = dimensionToPx(scaledBodyDim, HTML_DPI);
    const targetColumnPx = measureColumnWidthPx(
      columnWidthSample,
      bodyFontFamily,
      scaledBodyPx,
      bodyFontWeight,
    );

    // Decide column geometry.
    const innerViewportW = Math.max(viewportWidth - PADDING_PX * 2, 100);
    let columnWidthPx: number;
    if (currentColumnMode === 'single') {
      columnWidthPx = Math.min(targetColumnPx, innerViewportW);
    } else {
      const maxVisible = Math.max(
        1,
        Math.floor((innerViewportW + columnGapPx) / (targetColumnPx + columnGapPx)),
      );
      columnWidthPx =
        (innerViewportW - columnGapPx * (maxVisible - 1)) / maxVisible;
    }
    columnWidthPx = Math.max(Math.floor(columnWidthPx), 80);
    columnGeomRef.current = { columnWidthPx, columnGapPx };

    const configOverride = buildHtmlConfigOverride(currentConfig, {
      fontScale: currentFontScale,
      columnMode: currentColumnMode,
      columnWidthPx,
      viewportHeightPx: viewportHeight,
      locale: currentLocale,
      optimalLineBreaking: htmlViewer.optimalLineBreaking,
    });

    try {
      const doc = await layoutWorker.build(
        { markdown: currentMarkdown },
        configOverride,
      );
      if (seq !== renderSeqRef.current) return;

      const mode = currentColumnMode === 'single' ? 'single' : 'multi';
      const indexed = renderToHtmlIndexed(doc, {
        mode,
        columnGap: columnGapPx,
        padding: PADDING_PX,
        background: 'transparent',
      });

      scroll.dataset.mode = currentColumnMode;
      scroll.style.background = composePageBackground(
        currentConfig.page?.backgroundColor?.hex,
      );

      // Signature gates incremental patching: when any of these change we
      // must rebuild the scroll container wholesale, otherwise we can try to
      // diff at page/block granularity.
      const sig = `${mode}\x00${columnGapPx}\x00${PADDING_PX}`;
      const prev = lastRenderRef.current;
      const prevSig = lastRenderSigRef.current;

      // Shared holder for the runtime-measured baseline offset. Populated
      // lazily on the first `resolveBaselineOffset` call after the new DOM
      // is in place, then reused for every page in this relayout.
      let measuredBaselineOffset: number | null = null;
      const resolveBaselineOffset = (): number | undefined => {
        if (!doc.config.page.baselineGrid.enabled) return undefined;
        if (measuredBaselineOffset !== null) return measuredBaselineOffset;
        const offset = measureBodyBaselineOffset(scroll, doc);
        if (offset !== null) measuredBaselineOffset = offset;
        return offset ?? undefined;
      };

      const attachPageOverlay = (pageEl: HTMLDivElement, pageIndex: number) => {
        const page = doc.pages[pageIndex];
        if (!page) return;
        const pageWidthPx = page.width;
        const pageHeightPx = page.height;
        const overlay = createOverlaySvg(
          pageWidthPx,
          pageHeightPx,
          pageWidthPx,
          pageHeightPx,
        );
        pageEl.appendChild(overlay);
        overlayMapRef.current.set(pageIndex, overlay);
        drawBaselines(overlay, doc, pageIndex, resolveBaselineOffset());
        attachSlotClickHandler(
          pageEl,
          pageIndex,
          pageWidthPx,
          pageHeightPx,
          docRef,
          dispatchRef,
          activePanelRef,
        );
      };

      // Decide whether we can patch incrementally. Any structural shift
      // (page count, page dimensions, the outer signature) forces a full
      // replace; otherwise we walk pages and only touch blocks that changed.
      let canPatch =
        prev !== null &&
        prevSig === sig &&
        prev.pages.length === indexed.pages.length;
      if (canPatch && prev) {
        for (let i = 0; i < indexed.pages.length; i++) {
          const np = indexed.pages[i]!;
          const pp = prev.pages[i]!;
          if (np.width !== pp.width || np.height !== pp.height) {
            canPatch = false;
            break;
          }
        }
      }

      if (!canPatch) {
        scroll.innerHTML = indexed.html;
        overlayMapRef.current.clear();
        const pageEls = scroll.querySelectorAll<HTMLDivElement>('.pt-page');
        pageEls.forEach((pageEl) => {
          const pageIndex = Number(pageEl.dataset.page);
          attachPageOverlay(pageEl, pageIndex);
        });
      } else if (prev) {
        // Per-page diff. Same block IDs in the same order → patch only the
        // block wrappers whose HTML string changed. Otherwise rebuild the
        // page's inner HTML (cheaper than rebuilding the whole scroll) and
        // re-attach just that page's overlay.
        for (let i = 0; i < indexed.pages.length; i++) {
          const np = indexed.pages[i]!;
          const pp = prev.pages[i]!;
          const pageEl = scroll.querySelector<HTMLDivElement>(
            `.pt-page[data-page="${np.index}"]`,
          );
          if (!pageEl) continue;

          const sameBlockSkeleton =
            np.blocks.length === pp.blocks.length &&
            np.blocks.every((b, j) => b.id === pp.blocks[j]!.id);

          if (!sameBlockSkeleton) {
            pageEl.innerHTML = np.innerHtml;
            const oldOverlay = overlayMapRef.current.get(np.index);
            if (oldOverlay && oldOverlay.parentNode === pageEl) {
              pageEl.removeChild(oldOverlay);
            }
            overlayMapRef.current.delete(np.index);
            attachPageOverlay(pageEl, np.index);
            continue;
          }

          // Skeleton matches — replace individual block nodes whose HTML
          // actually differs. Collect first, then mutate, to avoid issues
          // from querySelector traversing a changing tree.
          const changes: Array<{ id: string; html: string }> = [];
          for (let j = 0; j < np.blocks.length; j++) {
            const nb = np.blocks[j]!;
            const pb = pp.blocks[j]!;
            if (nb.html !== pb.html) changes.push(nb);
          }
          for (const c of changes) {
            const selector = `.pt-block[data-block-id="${cssEscape(c.id)}"]`;
            const el = pageEl.querySelector<HTMLElement>(selector);
            if (el) {
              el.outerHTML = c.html;
            }
          }
        }
      }

      docRef.current = doc;
      sharedDocRef.current = doc;
      dispatch({ type: 'BUMP_DOC_VERSION' });
      lastRenderRef.current = indexed;
      lastRenderSigRef.current = sig;

      // Baseline grid visibility is a pure-overlay concern: toggling it leaves
      // block HTML unchanged, so the patch path above may not touch any
      // overlay. Refresh baselines for every live overlay so the setting
      // takes effect on the next relayout regardless of which path ran.
      const bOffset = resolveBaselineOffset();
      for (const [pageIndex, overlay] of overlayMapRef.current) {
        drawBaselines(overlay, doc, pageIndex, bOffset);
      }

      setDocVersion((v) => v + 1);
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return;
      console.error('[HtmlPreview] Layout error:', err);
    } finally {
      if (seq === renderSeqRef.current) onGeneratingChangeRef.current?.(false);
    }
  }

  // Relayout on any real input change.
  useEffect(() => {
    scheduleRelayout(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderKey]);

  // Draw cursor/selection overlays whenever selection, focus, or the document
  // itself changes. Mirrors the effect in CanvasPreview so behavior is shared.
  useEffect(() => {
    const doc = docRef.current;
    if (!doc) return;
    const debug = resolveDebugConfig(state.config.debug);
    const selection = state.selection;
    const focused = state.editorFocused;

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

    const scroll = scrollHostRef.current;
    const isCollapsed = selection.from === selection.to;
    const scrollEnabled = isCollapsed
      ? debug.cursorSync.enabled
      : debug.selectionSync.enabled;
    if (
      activeCursorRect &&
      scroll &&
      focused &&
      scrollEnabled
    ) {
      const padding = 16;
      const cr = activeCursorRect.getBoundingClientRect();
      const cn = scroll.getBoundingClientRect();
      if (cr.top < cn.top + padding) {
        scroll.scrollTop += cr.top - cn.top - padding;
      } else if (cr.bottom > cn.bottom - padding) {
        scroll.scrollTop += cr.bottom - cn.bottom + padding;
      }
      if (cr.left < cn.left + padding) {
        scroll.scrollLeft += cr.left - cn.left - padding;
      } else if (cr.right > cn.right - padding) {
        scroll.scrollLeft += cr.right - cn.right + padding;
      }
    }
  }, [state.selection, state.config.debug, state.editorFocused, docVersion]);

  // Imperative API exposed to the viewport toolbar.
  // - regenerate: force a fresh relayout immediately.
  // - scrollColumn(delta): shift the scroll container by ±1 column step. In
  //   multi-column mode that's horizontal (column width + gap). In single
  //   mode we fall back to a viewport-height vertical scroll (one "screen").
  useImperativeHandle(ref, () => ({
    regenerate: () => scheduleRelayout(0),
    scrollColumn: (delta: number) => {
      const scroll = scrollHostRef.current;
      if (!scroll) return;
      if (columnModeRef.current === 'multi') {
        const { columnWidthPx, columnGapPx } = columnGeomRef.current;
        if (columnWidthPx <= 0) return;
        const step = columnWidthPx + columnGapPx;
        scroll.scrollBy({ left: delta * step, behavior: 'smooth' });
      } else {
        scroll.scrollBy({ top: delta * scroll.clientHeight, behavior: 'smooth' });
      }
    },
  }), []);

  // Scroll-bounds emitter. Rather than computing column indices (which is
  // ambiguous when several columns are visible per page and pages snap
  // horizontally), just report whether there's room to scroll further in
  // either direction. The toolbar uses these booleans to enable/disable
  // prev/next column buttons.
  useEffect(() => {
    const scroll = scrollHostRef.current;
    if (!scroll) return;
    let rafId = 0;
    const compute = () => {
      rafId = 0;
      if (columnModeRef.current !== 'multi') {
        onScrollBoundsChangeRef.current?.({ canPrev: false, canNext: false });
        return;
      }
      const tolerance = 4;
      const canPrev = scroll.scrollLeft > tolerance;
      const canNext =
        scroll.scrollLeft + scroll.clientWidth < scroll.scrollWidth - tolerance;
      onScrollBoundsChangeRef.current?.({ canPrev, canNext });
    };
    const onScroll = () => {
      if (rafId !== 0) return;
      rafId = requestAnimationFrame(compute);
    };
    scroll.addEventListener('scroll', onScroll, { passive: true });
    // Compute once now and again after a frame so we pick up scrollWidth
    // updates from the relayout that just completed.
    compute();
    const id = requestAnimationFrame(compute);
    return () => {
      scroll.removeEventListener('scroll', onScroll);
      cancelAnimationFrame(id);
      if (rafId !== 0) cancelAnimationFrame(rafId);
    };
  }, [docVersion, columnMode]);

  return <div ref={hostRef} className="h-full w-full" />;
});
