'use client';

import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import {
  buildDocument,
  renderToHtmlIndexed,
  createMeasurementCache,
  clearMeasurementCache,
  buildFontString,
  measureGlyphWidth,
  dimensionToPx,
  resolveHtmlViewerConfig,
  resolveHeadingsConfig,
  resolveDebugConfig,
} from 'postext';
import type {
  PostextConfig,
  HyphenationLocale,
  MeasurementCache,
  VDTDocument,
  HtmlRenderIndex,
} from 'postext';
import { useSandbox } from '../context/SandboxContext';
import { useShadowDom } from '../hooks/useShadowDom';
import { ensureConfigFontsLoaded, getConfigFontSpecs } from '../controls/fontLoader';
import { createOverlaySvg } from './CanvasPreview/dom';
import { drawOverlay, drawBaselines } from './CanvasPreview/overlay';
import { attachSlotClickHandler } from './CanvasPreview/interaction';

type ColumnMode = 'single' | 'multi';

interface HtmlPreviewProps {
  fontScale: number;
  columnMode: ColumnMode;
}

const LOCALE_TO_HYPHENATION: Record<string, HyphenationLocale> = {
  en: 'en-us', es: 'es', fr: 'fr', de: 'de', it: 'it', pt: 'pt', ca: 'ca', nl: 'nl',
};

// Prose sample used to measure the target column width for a given body font.
// Proportional fonts make "N × average glyph width" unreliable, so we measure
// actual representative text. The sample is sliced / padded to the configured
// maxCharsPerLine.
const COLUMN_WIDTH_BASE_SAMPLE =
  'The quick brown fox jumps over the lazy dog. Sphinx of black quartz, judge my vow. Pack my box with five dozen liquor jugs. How vexingly quick daft zebras jump.';

function buildColumnWidthSample(chars: number): string {
  const n = Math.max(1, Math.floor(chars));
  let s = COLUMN_WIDTH_BASE_SAMPLE;
  while (s.length < n) s += ' ' + COLUMN_WIDTH_BASE_SAMPLE;
  return s.slice(0, n);
}

// Debounce delay for resize-driven relayouts (ms).
const RESIZE_DEBOUNCE_MS = 100;

// Screen-friendly DPI. At 144 DPI, a default 8pt body size resolves to 16px,
// matching the conventional web body size at fontScale=1.
const HTML_DPI = 144;

const PADDING_PX = 24;

const SHADOW_CSS = `
  :host {
    display: block;
    height: 100%;
    width: 100%;
  }
  .pt-scroll {
    width: 100%;
    height: 100%;
    box-sizing: border-box;
    background: #ffffff;
    user-select: none;
    -webkit-user-select: none;
  }
  .pt-scroll[data-mode='single'] { overflow-y: auto; overflow-x: hidden; }
  .pt-scroll[data-mode='multi']  {
    overflow-x: auto;
    overflow-y: hidden;
    scroll-snap-type: x proximity;
    scroll-padding-inline: 24px;
  }
  .pt-scroll[data-mode='multi'] .pt-page { scroll-snap-align: start; }
  .pt-doc { min-height: 100%; }
  .pt-page { cursor: text; }
  @keyframes cursor-blink {
    0%, 49% { opacity: 1; }
    50%, 100% { opacity: 0; }
  }
  @media (prefers-reduced-motion: no-preference) {
    .cursor-blink {
      animation: cursor-blink 1.06s steps(1, end) infinite;
    }
  }
`;

/**
 * Compose a CSS background value for the page reading area. A transparent
 * (or undefined) page colour means "no paper tint" → pure white. Any other
 * colour is layered over white via linear-gradient so that semi-transparent
 * values (e.g. rgba / 8-digit hex) composite correctly instead of letting
 * the host's surface colour bleed through.
 */
function composePageBackground(hex: string | undefined | null): string {
  if (!hex || hex === 'transparent') return '#ffffff';
  return `linear-gradient(${hex}, ${hex}), #ffffff`;
}

function buildHtmlConfigOverride(
  base: PostextConfig,
  opts: {
    fontScale: number;
    columnMode: ColumnMode;
    columnWidthPx: number;
    viewportHeightPx: number;
    locale: string;
    optimalLineBreaking: boolean;
  },
): PostextConfig {
  const {
    fontScale,
    columnMode,
    columnWidthPx,
    viewportHeightPx,
    locale,
    optimalLineBreaking,
  } = opts;

  // Body font-size override — screen rendering uses pt at HTML_DPI so the
  // default 8pt ≈ 16px at fontScale=1.
  const baseFontSize = base.bodyText?.fontSize ?? { value: 8, unit: 'pt' as const };
  const scaledFontSize = { value: baseFontSize.value * fontScale, unit: baseFontSize.unit };

  const hypLocale =
    base.bodyText?.hyphenation?.locale ?? LOCALE_TO_HYPHENATION[locale] ?? 'en-us';

  // Single-column mode: disable widow/orphan/runt avoidance (no column breaks
  // to protect — the whole document lives on one tall, scrollable page).
  const disableParagraphRules = columnMode === 'single';

  // Page height: single-column mode needs one very tall page so content never
  // flows to a second. Multi-column mode uses the viewport inner height, so
  // each VDT "page" = one column and horizontal stacking produces the scroll.
  const pageHeightPx =
    columnMode === 'single'
      ? Math.max(viewportHeightPx * 20, 200_000)
      : Math.max(viewportHeightPx - PADDING_PX * 2, 400);

  // Headings use absolute pt sizes, so they don't scale through em cascades.
  // Resolve the user's partial headings config and emit explicit per-level
  // overrides with scaled fontSize so fontScale acts as a uniform multiplier.
  const resolvedHeadings = resolveHeadingsConfig(base.headings);
  const scaledHeadingLevels = resolvedHeadings.levels.map((lvl) => ({
    ...lvl,
    fontSize: { value: lvl.fontSize.value * fontScale, unit: lvl.fontSize.unit },
  }));

  return {
    ...base,
    page: {
      ...base.page,
      dpi: HTML_DPI,
      width: { value: columnWidthPx, unit: 'px' },
      height: { value: pageHeightPx, unit: 'px' },
      margins: {
        top: { value: 0, unit: 'px' },
        bottom: { value: 0, unit: 'px' },
        left: { value: 0, unit: 'px' },
        right: { value: 0, unit: 'px' },
      },
      cutLines: { ...(base.page?.cutLines ?? {}), enabled: false },
      // baselineGrid.enabled is a pure display flag (layout uses the grid
      // value regardless of enabled), so let the user's setting flow through
      // to drive the SVG overlay in HtmlPreview.
      backgroundColor: { hex: 'transparent', model: 'hex' },
    },
    layout: {
      ...base.layout,
      layoutType: 'single',
    },
    bodyText: {
      ...base.bodyText,
      fontSize: scaledFontSize,
      optimalLineBreaking,
      hyphenation: {
        ...(base.bodyText?.hyphenation ?? {}),
        locale: hypLocale,
      },
      ...(disableParagraphRules
        ? {
            avoidOrphans: false,
            avoidWidows: false,
            avoidRunts: false,
            avoidOrphansInLists: false,
            avoidWidowsInLists: false,
            avoidRuntsInLists: false,
          }
        : {}),
    },
    headings: {
      ...base.headings,
      levels: scaledHeadingLevels,
    },
  };
}

function measureColumnWidthPx(
  sample: string,
  fontFamily: string,
  fontSizePx: number,
  fontWeight: number,
): number {
  const font = buildFontString(fontFamily, fontSizePx, String(fontWeight), 'normal');
  return measureGlyphWidth(sample, font);
}

export function HtmlPreview({ fontScale, columnMode }: HtmlPreviewProps) {
  const { state, dispatch, docRef: sharedDocRef } = useSandbox();
  const { hostRef, shadowRef } = useShadowDom();
  const deferredMarkdown = useDeferredValue(state.markdown);
  const deferredConfig = useDeferredValue(state.config);

  const measureCacheRef = useRef<MeasurementCache>(createMeasurementCache());
  const scrollHostRef = useRef<HTMLDivElement | null>(null);
  const contentHostRef = useRef<HTMLDivElement | null>(null);
  const viewportSizeRef = useRef<{ width: number; height: number }>({ width: 0, height: 0 });
  const relayoutTimerRef = useRef<number | null>(null);
  const renderSeqRef = useRef(0);

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
      clearMeasurementCache();
      measureCacheRef.current = createMeasurementCache();
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

    const configOverride = buildHtmlConfigOverride(currentConfig, {
      fontScale: currentFontScale,
      columnMode: currentColumnMode,
      columnWidthPx,
      viewportHeightPx: viewportHeight,
      locale: currentLocale,
      optimalLineBreaking: htmlViewer.optimalLineBreaking,
    });

    try {
      const doc = buildDocument(
        { markdown: currentMarkdown },
        configOverride,
        measureCacheRef.current,
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
      const sig = `${mode}\0${columnGapPx}\0${PADDING_PX}`;
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
      console.error('[HtmlPreview] Layout error:', err);
    }
  }

  // Minimal CSS.escape fallback — block IDs only use [a-zA-Z0-9-].
  function cssEscape(s: string): string {
    if (typeof CSS !== 'undefined' && typeof CSS.escape === 'function') {
      return CSS.escape(s);
    }
    return s.replace(/[^a-zA-Z0-9_-]/g, (c) => `\\${c}`);
  }

  /**
   * Measure the actual pixel offset of the text baseline within a `.pt-line`
   * cell. The VDT's own `line.baseline` is `lineY + 0.8 * lineHeight`, which
   * matches how the canvas backend paints glyphs but not how the browser
   * positions inline text inside a line-box (the result depends on the
   * font's ascent metric and the default `line-height: normal`). We append a
   * zero-sized inline-block to a body paragraph's line — its `bottom` aligns
   * with the line-box baseline — and take the delta against the line's top.
   * Returns null when no body line is available (e.g. empty document), in
   * which case callers fall back to the 0.8 approximation.
   */
  function measureBodyBaselineOffset(
    scroll: HTMLElement,
    doc: VDTDocument,
  ): number | null {
    // Prefer a paragraph block so headings / list bullets don't skew the
    // measurement — the grid is sized to the body line-height.
    const bodyBlock = doc.blocks.find(
      (b) => b.type === 'paragraph' && b.lines.length > 0,
    );
    if (!bodyBlock) return null;
    const selector = `.pt-line[data-block="${cssEscape(bodyBlock.id)}"]`;
    const lineEl = scroll.querySelector<HTMLElement>(selector);
    if (!lineEl) return null;
    const marker = document.createElement('span');
    marker.style.cssText =
      'display:inline-block;width:0;height:0;visibility:hidden;vertical-align:baseline;';
    lineEl.appendChild(marker);
    const lineRect = lineEl.getBoundingClientRect();
    const markerRect = marker.getBoundingClientRect();
    lineEl.removeChild(marker);
    if (lineRect.height === 0) return null;
    return markerRect.bottom - lineRect.top;
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

  return <div ref={hostRef} className="h-full w-full" />;
}
