'use client';

import { useEffect, useMemo, useRef, useState, useDeferredValue } from 'react';
import {
  buildDocument,
  renderToHtml,
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
} from 'postext';
import { useSandbox } from '../context/SandboxContext';
import { useShadowDom } from '../hooks/useShadowDom';
import { ensureConfigFontsLoaded, getConfigFontSpecs } from '../controls/fontLoader';
import { createOverlaySvg } from './CanvasPreview/dom';
import { drawOverlay } from './CanvasPreview/overlay';
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
      baselineGrid: { ...(base.page?.baselineGrid ?? {}), enabled: false },
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
  const { state, dispatch } = useSandbox();
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
    return () => {
      scrollHostRef.current = null;
      contentHostRef.current = null;
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
  // taken against fallbacks.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const onLoadingDone = () => scheduleRelayout(0);
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

    clearMeasurementCache();
    measureCacheRef.current = createMeasurementCache();

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

      const html = renderToHtml(doc, {
        mode: currentColumnMode === 'single' ? 'single' : 'multi',
        columnGap: columnGapPx,
        padding: PADDING_PX,
        background: 'transparent',
      });

      scroll.dataset.mode = currentColumnMode;
      scroll.style.background = composePageBackground(
        currentConfig.page?.backgroundColor?.hex,
      );
      scroll.innerHTML = html;

      docRef.current = doc;
      overlayMapRef.current.clear();

      // Per-page: inject overlay SVG for cursor/selection and wire up
      // pointer/click/dblclick handlers. HTML pages render at 1:1 with the
      // VDT page-space px, so display dims == page-space dims.
      const pageEls = scroll.querySelectorAll<HTMLDivElement>('.pt-page');
      pageEls.forEach((pageEl) => {
        const pageIndex = Number(pageEl.dataset.page);
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
        attachSlotClickHandler(
          pageEl,
          pageIndex,
          pageWidthPx,
          pageHeightPx,
          pageWidthPx,
          pageHeightPx,
          docRef,
          dispatchRef,
          activePanelRef,
        );
      });

      setDocVersion((v) => v + 1);
    } catch (err) {
      console.error('[HtmlPreview] Layout error:', err);
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
    const { from } = selection;
    for (let i = 0; i < doc.blocks.length; i++) {
      const b = doc.blocks[i]!;
      if (b.sourceStart === undefined || b.sourceEnd === undefined) continue;
      if (from >= b.sourceStart && from <= b.sourceEnd) { caretBlockIdx = i; break; }
    }
    if (caretBlockIdx === -1) {
      for (let i = 0; i < doc.blocks.length; i++) {
        const b = doc.blocks[i]!;
        if (b.sourceStart === undefined) continue;
        if (b.sourceStart >= from) { caretBlockIdx = i; break; }
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
    if (
      activeCursorRect &&
      scroll &&
      focused &&
      isCollapsed &&
      debug.cursorSync.enabled
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
