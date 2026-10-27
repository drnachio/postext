// The canvas preview's display size: the gaps between the pages, the page
// geometry at a container size and the observer that follows it (#1276:
// split out of CanvasPreview/index.tsx).
import { useMemo, useRef, useCallback, useEffect } from 'react';
import { type PageGaps, rowPadding, PAGE_PADDING, innerRowWidth, fitRowPageWidth, type ViewMode, type FitMode, type GeomSnapshot } from '../layoutUtils.js';
import { resolveCanvasViewerConfig, renderPageToCanvas, watchFonts, onFontsChanged, type PostextConfig, type VDTDocument, type RenderPageOptions } from 'postext';
import { joinPagesOfRow } from '../pageDom.js';
import { onLateFonts } from '../../../../worker/LayoutService.js';
import type { PaintedPages } from '../pageReuse.js';

/** What useDisplaySize takes from the canvas preview. */
export interface UseDisplaySizeDeps {
  zoom: number;
  viewMode: ViewMode;
  fitMode: FitMode;
  config: PostextConfig;
  containerRef: React.RefObject<HTMLDivElement | null>;
  docRef: React.RefObject<VDTDocument | null>;
  canvasMapRef: React.RefObject<Map<number, HTMLCanvasElement>>;
  overlayMapRef: React.RefObject<Map<number, SVGSVGElement>>;
  renderedPagesRef: React.RefObject<Set<number>>;
  stalePagesRef: React.RefObject<Set<number>>;
  paintedPagesRef: React.RefObject<PaintedPages>;
  visiblePagesRef: React.RefObject<Set<number>>;
  lastGeomRef: React.RefObject<GeomSnapshot | null>;
  bitmapScaleRef: React.RefObject<number>;
  paintOptionsRef: React.RefObject<() => RenderPageOptions>;
  wantedBitmapScale: (displayWidth: number, pageWidthPx: number) => number;
  needsRescale: (wanted: number) => boolean;
  setRebuildKey: React.Dispatch<React.SetStateAction<number>>;
  containerSizeRef: React.RefObject<{ width: number; height: number; }>;
  setLayoutKey: React.Dispatch<React.SetStateAction<number>>;
}

export function useDisplaySize(deps: UseDisplaySizeDeps) {
  const {
    zoom, viewMode, fitMode, config, containerRef, docRef, canvasMapRef, overlayMapRef,
    renderedPagesRef, stalePagesRef, paintedPagesRef, visiblePagesRef, lastGeomRef, bitmapScaleRef,
    paintOptionsRef, wantedBitmapScale, needsRescale, setRebuildKey, containerSizeRef, setLayoutKey
  } = deps;
  // Stable (only touches refs and DOM), so effects can depend on it without
  // re-running every render.
  // The space between the pages (`canvasViewer`, #1002), a viewer setting:
  // changing it moves the pages on screen and relays nothing out. Mirrored
  // in a ref the imperative geometry code reads.
  const rawCanvasViewer = config.canvasViewer;
  const gaps = useMemo((): PageGaps => {
    const g = resolveCanvasViewerConfig(rawCanvasViewer);
    return { pageGap: g.pageGap, rowGap: g.rowGap };
    // The two numbers decide it, not the object that holds them.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rawCanvasViewer?.pageGap, rawCanvasViewer?.rowGap]);
  const gapsRef = useRef<PageGaps>(gaps);
  gapsRef.current = gaps;

  // `force` redoes the geometry at an unchanged size: the gaps between the
  // pages changed (`canvasViewer`, #1002).
  const applyDisplaySize = useCallback((displayWidth: number, displayHeight: number, force = false) => {
    const container = containerRef.current;
    if (!container) return;
    const prev = lastGeomRef.current;
    if (!force && prev && prev.displayWidth === displayWidth && prev.displayHeight === displayHeight) return;
    const gap = gapsRef.current;
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
      const { top: paddingTop, bottom: paddingBottom } = rowPadding(rowIdx, totalRows, gap.rowGap);
      rowDiv.style.padding = `${paddingTop}px ${PAGE_PADDING}px ${paddingBottom}px`;
      rowDiv.style.gap = `${gap.pageGap}px`;
      rowDiv.style.minHeight = `${displayHeight + paddingTop + paddingBottom}px`;
      // Pages that touch lose the shadow and the corners at the joint.
      if (pagesPerRow === 2) joinPagesOfRow(rowDiv, gap.pageGap);
    });
    const innerDiv = container.firstChild as HTMLDivElement | null;
    if (innerDiv) {
      innerDiv.style.width = `${innerRowWidth(displayWidth, pagesPerRow, gap.pageGap)}px`;
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
          if (canvas && page) {
            renderPageToCanvas(page, doc, canvas, opts);
            paintedPagesRef.current.painted(pageIndex, page, opts);
          }
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const computeDisplaySize = (containerW: number, containerH: number) => {
    const isSpread = viewMode === 'spread';
    const pageGap = gapsRef.current.pageGap;
    const doc = docRef.current;
    const firstPage = doc?.pages[0];
    const aspectRatio = firstPage ? firstPage.height / firstPage.width : 1;
    let displayWidth: number;
    if (fitMode === 'width') {
      displayWidth = fitRowPageWidth(containerW, isSpread ? 2 : 1, pageGap);
    } else if (fitMode === 'height') {
      const containerInnerH = containerH - PAGE_PADDING * 2;
      displayWidth = containerInnerH / aspectRatio;
      if (isSpread) {
        const maxPerPage = fitRowPageWidth(containerW, 2, pageGap);
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applyDisplaySize]);

  // When zoom or fit mode change, recompute display size imperatively. Reads
  // computeDisplaySize through its ref mirror — the props it closes over
  // (zoom/fitMode) are already in the dependency list.
  useEffect(() => {
    const { width, height } = containerSizeRef.current;
    if (width === 0) return;
    const { displayWidth, displayHeight } = computeDisplaySizeRef.current(width, height);
    applyDisplaySize(displayWidth, displayHeight);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [zoom, fitMode, applyDisplaySize]);

  // The gaps changed: move the rows and pages in place (and refit, when the
  // pages fill the window), without a rebuild or a repaint.
  const lastGapsRef = useRef(gaps);
  useEffect(() => {
    if (lastGapsRef.current.pageGap === gaps.pageGap && lastGapsRef.current.rowGap === gaps.rowGap) return;
    lastGapsRef.current = gaps;
    const { width, height } = containerSizeRef.current;
    if (width === 0) return;
    const { displayWidth, displayHeight } = computeDisplaySizeRef.current(width, height);
    applyDisplaySize(displayWidth, displayHeight, true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gaps, applyDisplaySize]);

  // Rebuild when faces arrive after the initial layout. document.fonts.ready
  // only waits for *currently pending* faces; a face requested later (or one
  // that slips past the preload) can land after the first measurement. The
  // engine's watch (#629) drops what was measured in those families, once
  // a frame however many slices a burst brings, and bumping rebuildKey
  // lays the pages out again with the real glyph widths.
  useEffect(() => {
    if (typeof document === 'undefined' || !document.fonts) return;
    const stop = watchFonts(document.fonts);
    const off = onFontsChanged(() => setRebuildKey((k) => k + 1));
    // And the faces the layout worker got after a build that could not
    // wait for their files (#757).
    const offLate = onLateFonts(() => setRebuildKey((k) => k + 1));
    return () => {
      offLate();
      off();
      stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return {
    gapsRef, applyDisplaySize, computeDisplaySizeRef
  };
}
