// The HTML preview's relayout: scheduled on any real input change, it lays
// the pages out again and rebuilds their DOM (#1276: split out of
// HtmlPreview/index.tsx).
import { useRef, useCallback, useEffect } from 'react';
import { watchFonts, onFontsChanged, applyHtmlViewerOverrides, resolveHtmlViewerConfig, dimensionToPx, resolveLayoutConfig, resolveDiagramStyleConfig, resolveColorValue, renderToHtmlIndexed, attachExercises, type VDTDocument, type HtmlRenderIndex, type PostextConfig, type Resource, type BundleStart } from 'postext';
import { onLateFonts } from '../../../../worker/LayoutService.js';
import { RESIZE_DEBOUNCE_MS, buildColumnWidthSample, htmlViewerDpi, PADDING_PX, composePageBackground, type ColumnMode } from '../constants.js';
import { missingConfigFontSpecs, standInsSettled, ensureConfigFontsLoaded } from '../../../../controls/fonts/fontLoader.js';
import { measureColumnWidthPx, hasComposedPages, buildHtmlConfigOverride, partTitlesOf, hasComicPages } from '../configOverride.js';
import { configShapingLanguage } from '../../../../controls/language/measureLanguage.js';
import { viewerLayoutType, singleScrollPageWidthPx, pickPageGeometry, fitPagesToContent } from '../pageGeometry.js';
import { planContent } from '../../../../book/jumps.js';
import { ensureResourceImageUrls, ensureResourceVideoUrls, getResourceImageUrl, getResourceVideoUrl } from '../../../../controls/media/resourceImages.js';
import { measureBodyBaselineOffset, cssEscape } from '../baseline.js';
import { createOverlaySvg } from '../../../canvas/CanvasPreview/dom.js';
import { drawBaselines } from '../../../canvas/CanvasPreview/overlay.js';
import { attachSlotClickHandler } from '../../../canvas/CanvasPreview/interaction.js';
import { attachLabelAnchorEditor } from '../../../composed/labelAnchorEditor.js';
import { fitComposedPages } from '../composedFit.js';
import { attachHlsPlayers } from '../../../../controls/media/hlsPlayers.js';
import { composedBookPageMap } from '../../../../book/stitch.js';
import { leadingBlankPageCount } from '../../../../book/pagination.js';
import type { SandboxAction } from '../../../../context/SandboxContext/state.js';
import type { ComposedBook } from '../../../../book/types.js';
import type { LayoutWorkerApi } from '../../../../worker/useLayoutWorker.js';
import type { BookPageMap } from '../../../usePageHashSync.js';
import type { PanelId } from '../../../../types/props.js';
import type { PageNavigator } from '../../../canvas/CanvasPreview/interaction/types.js';
import type { LayoutSource } from '../../../../context/SandboxContext/hooks.js';
import type { SandboxLabels } from '../../../../types/labels.js';

/** What useRelayout takes from the HTML preview. */
export interface UseRelayoutDeps {
  dispatch: React.Dispatch<SandboxAction>;
  sharedDocRef: React.MutableRefObject<VDTDocument | null>;
  sharedDocSourceRef: React.MutableRefObject<ComposedBook | null>;
  hostRef: React.RefObject<HTMLDivElement | null>;
  builtSourceRef: React.RefObject<ComposedBook | null>;
  layoutWorker: LayoutWorkerApi;
  scrollHostRef: React.RefObject<HTMLDivElement | null>;
  viewportSizeRef: React.RefObject<{ width: number; height: number; }>;
  relayoutTimerRef: React.RefObject<number | null>;
  renderSeqRef: React.RefObject<number>;
  columnGeomRef: React.RefObject<{ pageWidthPx: number; columnGapPx: number; }>;
  onGeneratingChangeRef: React.RefObject<((generating: boolean) => void) | undefined>;
  onPageCountChangeRef: React.RefObject<((count: number, firstContentPage: number, pageNumbers: readonly number[], book?: BookPageMap) => void) | undefined>;
  dispatchRef: React.RefObject<React.Dispatch<SandboxAction>>;
  activePanelRef: React.RefObject<PanelId | null>;
  chapterOfPageRef: React.RefObject<((pageIndex: number) => number) | null>;
  navigateRef: React.MutableRefObject<PageNavigator | null>;
  docRef: React.RefObject<VDTDocument | null>;
  overlayMapRef: React.RefObject<Map<number, SVGSVGElement>>;
  labelEditorPages: WeakSet<HTMLElement>;
  lastRenderRef: React.RefObject<HtmlRenderIndex | null>;
  lastRenderSigRef: React.RefObject<string | null>;
  setDocVersion: React.Dispatch<React.SetStateAction<number>>;
  rtlRef: React.RefObject<boolean>;
  detachExercisesRef: React.RefObject<(() => void) | null>;
  exerciseKeyRef: React.RefObject<string>;
  fontScaleRef: React.RefObject<number>;
  columnModeRef: React.RefObject<ColumnMode>;
  sourceRef: React.RefObject<LayoutSource>;
  wholeBookRef: React.RefObject<ComposedBook | null>;
  configRef: React.RefObject<PostextConfig>;
  localeRef: React.RefObject<string>;
  resourcesRef: React.RefObject<Resource[]>;
  labelsRef: React.RefObject<SandboxLabels>;
  bookStartRef: React.RefObject<BundleStart | undefined>;
  renderKey: { source: LayoutSource | null; wholeBook: ComposedBook | null; config: PostextConfig; resources: Resource[]; fontScale: number; columnMode: ColumnMode; locale: string; };
}

export function useRelayout(deps: UseRelayoutDeps) {
  const {
    dispatch, sharedDocRef, sharedDocSourceRef, hostRef, builtSourceRef, layoutWorker, scrollHostRef,
    viewportSizeRef, relayoutTimerRef, renderSeqRef, columnGeomRef, onGeneratingChangeRef,
    onPageCountChangeRef, dispatchRef, activePanelRef, chapterOfPageRef, navigateRef, docRef,
    overlayMapRef, labelEditorPages, lastRenderRef, lastRenderSigRef, setDocVersion, rtlRef,
    detachExercisesRef, exerciseKeyRef, fontScaleRef, columnModeRef, sourceRef, wholeBookRef,
    configRef, localeRef, resourcesRef, labelsRef, bookStartRef, renderKey
  } = deps;
  // Stable scheduler: subscribers (font listener, ResizeObserver, the
  // imperative handle) depend on it without re-subscribing every render; the
  // latest doRelayout closure is reached through a ref.
  const doRelayoutRef = useRef<() => Promise<void>>(async () => {});
  doRelayoutRef.current = doRelayout;
  const scheduleRelayout = useCallback((delay: number) => {
    if (relayoutTimerRef.current !== null) {
      window.clearTimeout(relayoutTimerRef.current);
    }
    relayoutTimerRef.current = window.setTimeout(() => {
      relayoutTimerRef.current = null;
      void doRelayoutRef.current();
    }, delay);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Font-loading awareness: rebuild when fonts land so measurements aren't
  // taken against fallbacks. Glyph widths may differ once the real font
  // arrives, so invalidate the measurement caches before the next relayout.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    // The engine's watch (#629) drops the measurements of the families
    // that arrived (once a frame); the worker picks up the newly
    // registered faces on its next build.
    const stop = watchFonts(document.fonts);
    const off = onFontsChanged(() => scheduleRelayout(0));
    // And the faces the layout worker got after a build that could not
    // wait for their files (#757).
    const offLate = onLateFonts(() => scheduleRelayout(0));
    return () => {
      offLate();
      off();
      stop();
    };
  }, [scheduleRelayout]);

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
  }, [hostRef, scheduleRelayout]);

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
    const currentLayout = sourceRef.current;
    // Whole-book reading: every chapter in one document, laid out from the
    // first page. Chapter scope keeps the active chapter and what it
    // inherits from the chapters before it.
    const currentWholeBook = wholeBookRef.current;
    const currentSource = currentWholeBook ?? currentLayout.book;
    // Screen-only overrides (`htmlViewer.overrides`) merged in up front, so
    // font loading, column measurement and layout all see the same config.
    const currentConfig = applyHtmlViewerOverrides(configRef.current);
    const currentLocale = localeRef.current;

    const htmlViewer = resolveHtmlViewerConfig(currentConfig.htmlViewer);
    const columnGapPx = htmlViewer.columnGap;
    const maxCharsPerLine = htmlViewer.maxCharsPerLine;
    const columnWidthSample = buildColumnWidthSample(maxCharsPerLine);

    // Wait for required fonts, so measurement isn't poisoned by fallbacks.
    if (typeof document !== 'undefined' && document.fonts) {
      const missing = missingConfigFontSpecs(currentConfig, currentSource.markdown);
      // The stand-ins of a bold or an italic a family lacks are declared
      // by the same wait (#688).
      if (missing.length > 0 || !standInsSettled(currentConfig, currentSource.markdown)) {
        await ensureConfigFontsLoaded(currentConfig, currentSource.markdown);
        if (seq !== renderSeqRef.current) return;
      }
    }

    // NOTE: the measurement cache persists across relayouts. Keys bake in
    // text + font + width + line-breaking options, so entries that no longer
    // match simply go unused; blocks measured in a family whose faces
    // changed are dropped by the engine at the next lookup (#629).

    // Resolve body font + size → measure N-char target column width.
    const bodyFontFamily = currentConfig.bodyText?.fontFamily ?? 'EB Garamond';
    const bodyFontWeight = currentConfig.bodyText?.fontWeight ?? 400;
    const baseBodySize = currentConfig.bodyText?.fontSize ?? { value: 8, unit: 'pt' as const };
    // Same DPI the layout runs at (see buildHtmlConfigOverride): the font
    // scale lives in the DPI, so the measured column tracks it.
    const viewerDpi = htmlViewerDpi(currentFontScale);
    const scaledBodyPx = dimensionToPx(baseBodySize, viewerDpi);
    const targetColumnPx = measureColumnWidthPx(
      columnWidthSample,
      bodyFontFamily,
      scaledBodyPx,
      bodyFontWeight,
      configShapingLanguage(currentConfig, currentLocale),
    );

    // Decide page geometry. Single-scroll mode flattens to one continuous
    // column; multi mode honours the document's own column structure, so a
    // viewer page may span two text columns (or one-and-a-half) plus gutter.
    const layoutResolved = resolveLayoutConfig(currentConfig.layout);
    // Vertical scroll flattens a one- or two-column document to a single
    // measure, but a one-and-a-half book keeps its structure: the half
    // column is where its glosses and figures live, and it reads beside the
    // text here as it does on the leaf (at the right, per the override).
    let docLayoutType = currentColumnMode === 'single'
      ? (layoutResolved.layoutType === 'oneAndHalf' ? 'oneAndHalf' : 'single')
      : viewerLayoutType(layoutResolved.layoutType);
    const gutterPx = dimensionToPx(layoutResolved.gutterWidth, viewerDpi);
    const sideFraction = layoutResolved.sideColumnPercent / 100;

    const innerViewportW = Math.max(viewportWidth - PADDING_PX * 2, 100);
    // Multi mode shows the number of text columns closest to the target
    // measure — three columns of a double layout when three is the nearest
    // fit, rather than two stretched or four squeezed (see pickPageGeometry).
    let pageWidthPx: number;
    if (currentColumnMode === 'single') {
      pageWidthPx = singleScrollPageWidthPx({
        innerViewportW,
        targetColumnPx,
        gutterPx,
        layoutType: docLayoutType,
        sideFraction,
      });
    } else {
      let geometry = pickPageGeometry({
        innerViewportW,
        columnGapPx,
        gutterPx,
        targetColumnPx,
        layoutType: docLayoutType,
        sideFraction,
      });
      // A viewer with room for one column only (a phone) would show half of
      // each two-column page, cutting whatever spans both columns (openers,
      // wide figures) at its edge: the pages there hold one column.
      if (docLayoutType === 'double' && geometry.visibleColumns === 1) {
        docLayoutType = 'single';
        geometry = pickPageGeometry({
          innerViewportW,
          columnGapPx,
          gutterPx,
          targetColumnPx,
          layoutType: docLayoutType,
          sideFraction,
        });
      }
      pageWidthPx = geometry.pageWidthPx;
    }
    columnGeomRef.current = { pageWidthPx, columnGapPx };

    const composedLeaf = hasComposedPages(currentSource.markdown);
    const configOverride = buildHtmlConfigOverride(currentConfig, {
      fontScale: currentFontScale,
      columnMode: currentColumnMode,
      pageWidthPx,
      layoutType: docLayoutType,
      viewportHeightPx: viewportHeight,
      locale: currentLocale,
      optimalLineBreaking: htmlViewer.optimalLineBreaking,
      partTitles: partTitlesOf(currentSource.markdown),
      // Comic pages: the print page scaled to the viewport's width in the
      // vertical scroll, to a page (width and height) in the paged view.
      ...(hasComicPages(currentSource.markdown)
        ? { comicWidthPx: currentColumnMode === 'single' ? innerViewportW : pageWidthPx }
        : {}),
      // Composed pages: the print leaf, scaled to the same widths after
      // the layout (`fitComposedPages`).
      ...(composedLeaf ? { composedLeaf: true } : {}),
    });

    try {
      const doc = await layoutWorker.build(
        {
          markdown: currentSource.markdown,
          metadata: currentSource.metadata,
          resources: resourcesRef.current,
          ...(currentWholeBook
            ? (bookStartRef.current ? { continuation: bookStartRef.current } : {})
            : { continuation: currentLayout.continuation, ...planContent(currentLayout.plan) }),
        },
        configOverride,
      );
      if (seq !== renderSeqRef.current) return;

      // Resource images render as <img> via object URLs; build them up front,
      // recoloured to the single-ink colour when diagramStyle requests it.
      const ds = resolveDiagramStyleConfig(currentConfig.diagramStyle);
      const inkHex = ds.singleInk
        ? resolveColorValue(ds.inkColor, currentConfig.colorPalette, ds.inkColor).hex
        : null;
      await ensureResourceImageUrls(resourcesRef.current, inkHex, { inlineFonts: ds.inlineFonts }).catch(() => false);
      // Uploaded videos play from object URLs too (#454).
      await ensureResourceVideoUrls(resourcesRef.current).catch(() => false);
      if (seq !== renderSeqRef.current) return;

      const mode = currentColumnMode === 'single' ? 'single' : 'multi';
      // Vertical scroll: pages hug their content, so a part divider or a
      // chapter opener that broke to a new page is followed by the next
      // one instead of a screenful of blank (see fitPagesToContent).
      if (mode === 'single') fitPagesToContent(doc, PADDING_PX, { keepComposed: composedLeaf });
      const indexed = renderToHtmlIndexed(doc, {
        mode,
        columnGap: columnGapPx,
        padding: PADDING_PX,
        background: 'transparent',
        resourceImageUrl: getResourceImageUrl,
        resourceVideoUrl: getResourceVideoUrl,
        // The URLs are recoloured for single ink already (see above).
        singleInk: false,
      });

      scroll.dataset.mode = currentColumnMode;
      scroll.style.background = composePageBackground(
        currentConfig.page?.backgroundColor?.hex,
      );

      // Signature gates incremental patching: when any of these change we
      // must rebuild the scroll container wholesale, otherwise we can try to
      // diff at page/block granularity.
      // The root's own markup is in it too: its language, direction and the
      // way its pages run (a book switched to Arabic turns its root right
      // to left, and a patch never rewrites the root).
      const rootTag = indexed.html.slice(0, indexed.html.indexOf('>') + 1);
      const sig = `${mode}\x00${columnGapPx}\x00${PADDING_PX}\x00${rootTag}`;
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
          builtSourceRef,
          navigateRef,
          resourcesRef,
          undefined,
          labelsRef,
        );
        // The labels of figures in Design mode (#956): their marks are
        // dragged here as on the Canvas. One editor per page element, which
        // outlives a patch of the page's markup.
        if (!labelEditorPages.has(pageEl)) {
          labelEditorPages.add(pageEl);
          attachLabelAnchorEditor(pageEl, pageIndex, pageWidthPx, pageHeightPx, {
            docRef,
            dispatchRef,
            labelsRef,
            sourceOfPage: () => builtSourceRef.current,
          });
        }
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

      // A right-bound book in multi mode lays its pages out right to left
      // (`renderToHtml`): the reader starts at the right end.
      const rtl = mode === 'multi' && doc.binding === 'right';
      const rtlChanged = rtl !== rtlRef.current;
      rtlRef.current = rtl;
      if (!canPatch) {
        scroll.innerHTML = indexed.html;
        if (rtl && (prev === null || rtlChanged)) scroll.scrollLeft = scroll.scrollWidth;
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
          // Opener bands, headers and footers live outside the block list:
          // a design-only change (a preset reload swapping the part page
          // design) leaves every block equal and would otherwise never
          // reach the DOM.
          const sameDecoration = np.decorationHtml === pp.decorationHtml;

          if (!sameBlockSkeleton || !sameDecoration) {
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

      // Composed pages, laid out on the print leaf, shown whole: scaled to
      // the viewer's width, and scrolling down in the paged view (#1045).
      if (composedLeaf) {
        fitComposedPages(scroll, doc, {
          mode,
          // The viewer's width in both views: in the paged one a
          // composition is a screen wide, not a text page (a column of a
          // two-column book would show it at a third of its size).
          fitWidthPx: innerViewportW,
          unitHeightPx: Math.max(viewportHeight - PADDING_PX * 2, 400),
          gapPx: PADDING_PX,
        });
      }

      // Videos streamed over HLS get their player (#476).
      attachHlsPlayers(scroll);

      // Exercises (#1230): answerable, checked and kept per book and
      // chapter. A patch keeps the script element of the first render, so
      // the data comes from this render.
      detachExercisesRef.current?.();
      detachExercisesRef.current = indexed.exercises
        ? attachExercises(scroll, { data: indexed.exercises, storageKey: exerciseKeyRef.current })
        : null;

      docRef.current = doc;
      builtSourceRef.current = currentSource;
      sharedDocRef.current = doc;
      sharedDocSourceRef.current = currentSource;
      // Not recorded as the chapter's layout: this tab lays out for the
      // screen (one tall page, or viewport-high columns), not for print.
      dispatch({ type: 'BUMP_DOC_VERSION' });
      lastRenderRef.current = indexed;
      lastRenderSigRef.current = sig;

      // Multi mode pages always fit the viewport height; clear any vertical
      // scroll left over from single mode (overflow-y:hidden clips visually
      // but a clamped scrollTop survives the mode switch and pins the text
      // against the top edge).
      if (currentColumnMode === 'multi' && scroll.scrollTop !== 0) {
        scroll.scrollTop = 0;
      }

      // Baseline grid visibility is a pure-overlay concern: toggling it leaves
      // block HTML unchanged, so the patch path above may not touch any
      // overlay. Refresh baselines for every live overlay so the setting
      // takes effect on the next relayout regardless of which path ran.
      const bOffset = resolveBaselineOffset();
      for (const [pageIndex, overlay] of overlayMapRef.current) {
        drawBaselines(overlay, doc, pageIndex, bOffset);
      }

      const bookMap = currentWholeBook ? composedBookPageMap(doc, currentWholeBook) : null;
      chapterOfPageRef.current = bookMap ? (pageIndex) => bookMap.pageChapters[pageIndex] ?? -1 : null;
      onPageCountChangeRef.current?.(doc.pages.length, leadingBlankPageCount(doc), doc.pages.map((p) => p.pageNumberValue), bookMap ?? undefined);
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
  }, [renderKey, scheduleRelayout]);
  return {
    scheduleRelayout
  };
}
