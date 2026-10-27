'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { CanvasPreview, type CanvasPreviewHandle } from './CanvasPreview/index.js';
import { CanvasToolbar } from './CanvasToolbar.js';
import { useFloatingToolbarShell } from '../useFloatingToolbarShell.js';
import { useViewerControls } from '../viewerControls.js';
import { usePageHashSync, pageIndexOf, pageNumberAt, EMPTY_VIEWER_LAYOUT, type BookPageMap, type ViewerLayout } from '../usePageHashSync.js';
import { announce } from '../../ui/announcer.js';
import { useSandboxSelector } from '../../context/SandboxContext.js';
import { EditionRail } from '../composed/EditionBar.js';
import { EditionCompare } from '../composed/EditionCompare.js';
import { ReflowPanel } from '../composed/ReflowPanel.js';
import { useFrameJumpRunner } from '../../editions/useFrameJumpRunner.js';
import { loadCanvasViewMode, saveCanvasViewMode, loadCanvasFitMode, saveCanvasFitMode, loadCanvasZoom, saveCanvasZoom } from '../../storage/persistence.js';

type ViewMode = 'single' | 'spread';
type FitMode = 'none' | 'width' | 'height';

const MIN_ZOOM = 0.25;
const MAX_ZOOM = 4;
const ZOOM_STEP = 1.25;

export function CanvasViewport() {
  const [zoom, setZoom] = useState(1);
  const [viewMode, setViewMode] = useState<ViewMode>('single');
  const [fitMode, setFitMode] = useState<FitMode>('width');
  const [generating, setGenerating] = useState(false);
  const [layout, setLayout] = useState<ViewerLayout>(EMPTY_VIEWER_LAYOUT);
  const pageCount = layout.pageCount;
  const [currentPage, setCurrentPage] = useState(0);
  const [firstPageRecto, setFirstPageRecto] = useState(true);
  const previewRef = useRef<CanvasPreviewHandle | null>(null);
  const hydratedRef = useRef(false);

  // Hydrate from localStorage. The hydrated flag is flipped via rAF so the
  // persist effects that run on the same initial commit (with the default
  // closure values) skip — otherwise they'd overwrite localStorage with the
  // defaults before React applies the loaded state.
  useEffect(() => {
    const savedViewMode = loadCanvasViewMode();
    if (savedViewMode === 'single' || savedViewMode === 'spread') {
      setViewMode(savedViewMode);
    }
    const savedFitMode = loadCanvasFitMode();
    if (savedFitMode === 'none' || savedFitMode === 'width' || savedFitMode === 'height') {
      setFitMode(savedFitMode);
    }
    const savedZoom = loadCanvasZoom();
    if (savedZoom !== null) {
      setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, savedZoom)));
    }
    const id = requestAnimationFrame(() => { hydratedRef.current = true; });
    return () => cancelAnimationFrame(id);
  }, []);

  // Persist changes
  useEffect(() => {
    if (!hydratedRef.current) return;
    saveCanvasViewMode(viewMode);
  }, [viewMode]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveCanvasFitMode(fitMode);
  }, [fitMode]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveCanvasZoom(zoom);
  }, [zoom]);

  const handleZoomIn = () => {
    setZoom((z) => Math.min(z * ZOOM_STEP, MAX_ZOOM));
    setFitMode('none');
  };

  const handleZoomOut = () => {
    setZoom((z) => Math.max(z / ZOOM_STEP, MIN_ZOOM));
    setFitMode('none');
  };

  const handleFitWidth = () => {
    setFitMode((f) => (f === 'width' ? 'none' : 'width'));
  };

  const handleFitHeight = () => {
    setFitMode((f) => (f === 'height' ? 'none' : 'height'));
  };

  const handleSetViewMode = (mode: ViewMode) => {
    setViewMode(mode);
  };

  const handleRegenerate = useCallback(() => {
    previewRef.current?.regenerate();
  }, []);

  const handleJumpToPage = useCallback((pageIndex: number) => {
    previewRef.current?.jumpToPage(pageIndex);
  }, []);
  // A check of the Checks panel, or another edition, lands on its frame
  // (#867); two editions side by side over the canvas.
  useFrameJumpRunner(handleJumpToPage);
  const [comparing, setComparing] = useState(false);

  // `#chapter=C&page=P` in the URL: restored once the document is laid
  // out, written back as the reader scrolls.
  const handlePageCountChange = useCallback((count: number, firstPage: number, pageNumbers: readonly number[], recto: boolean, book?: BookPageMap) => {
    setLayout((l) => ({ pageCount: count, firstPage, pageNumbers, version: l.version + 1, ...(book ? { book } : {}) }));
    setFirstPageRecto(recto);
  }, []);
  // The toolbar shows and takes book page numbers; the preview works in
  // page indices.
  const handleJumpToPageNumber = useCallback((pageNumber: number) => {
    const index = pageIndexOf(layout, pageNumber);
    if (index >= 0) previewRef.current?.jumpToPage(index);
  }, [layout]);
  const syncPageHash = usePageHashSync(layout, handleJumpToPage);
  const handleCurrentPageChange = useCallback((pageIndex: number) => {
    setCurrentPage(pageIndex);
    syncPageHash(pageIndex);
  }, [syncPageHash]);

  const shell = useFloatingToolbarShell('canvas', generating);

  useViewerControls('canvas', {
    status: () => ({
      zoom,
      fit: fitMode,
      pages: viewMode,
      toolbarPinned: shell.pinned,
      generating,
      pageCount,
      pageIndex: currentPage,
      pageNumber: pageNumberAt(layout, currentPage),
      canPrevious: currentPage > 0,
      canNext: currentPage < pageCount - 1,
    }),
    set: (settings) => {
      if (settings.zoom !== undefined) {
        setZoom(Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, settings.zoom)));
        // A magnification only shows without a fit, as with the bar's buttons.
        if (settings.fit === undefined) setFitMode('none');
      }
      if (settings.fit !== undefined) setFitMode(settings.fit);
      if (settings.pages !== undefined) setViewMode(settings.pages);
      if (settings.toolbarPinned !== undefined) shell.setPinned(settings.toolbarPinned);
    },
    regenerate: handleRegenerate,
    goToPage: handleJumpToPage,
    step: (delta) => {
      const next = currentPage + delta * (viewMode === 'spread' ? 2 : 1);
      handleJumpToPage(Math.max(0, Math.min(pageCount - 1, next)));
    },
    goToEdge: (edge) => handleJumpToPage(edge === 'first' ? 0 : Math.max(0, pageCount - 1)),
  });

  // A finished layout is said through the live region (WCAG 4.1.3) when
  // its page count changes (a chapter opened, a page gained or lost), not
  // on every keystroke that relays the same pages.
  const layoutDoneLabel = useSandboxSelector((s) => s.labels.layoutDone);
  const announcedCountRef = useRef<number | null>(null);
  useEffect(() => {
    if (generating || pageCount === 0 || announcedCountRef.current === pageCount) return;
    const timer = window.setTimeout(() => {
      announcedCountRef.current = pageCount;
      announce(layoutDoneLabel.replace('__n__', String(pageCount)));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [generating, pageCount, layoutDoneLabel]);

  return (
    <div className="relative h-full w-full" {...shell.containerProps}>
      <CanvasPreview
        ref={previewRef}
        zoom={zoom}
        viewMode={viewMode}
        fitMode={fitMode}
        onGeneratingChange={setGenerating}
        onPageCountChange={handlePageCountChange}
        onCurrentPageChange={handleCurrentPageChange}
      />
      {comparing && <EditionCompare onClose={() => setComparing(false)} pageIndex={currentPage} />}
      {/* At the start edge: the editions of the book (#867) and what the
          layout moved on its composed pages (#868), a rail that hides
          (#1009). */}
      <EditionRail comparing={comparing} onToggleCompare={() => setComparing((c) => !c)} />
      <ReflowPanel currentPage={currentPage} onJumpToPage={handleJumpToPage} />
      <div {...shell.hoverStripProps} />
      <CanvasToolbar
        zoom={zoom}
        viewMode={viewMode}
        fitMode={fitMode}
        generating={generating}
        currentPage={currentPage}
        pageCount={pageCount}
        pageNumber={pageNumberAt(layout, currentPage)}
        firstPageNumber={pageNumberAt(layout, 0)}
        lastPageNumber={pageNumberAt(layout, Math.max(0, pageCount - 1))}
        firstPageRecto={firstPageRecto}
        onJumpToPageNumber={handleJumpToPageNumber}
        pinned={shell.pinned}
        hidden={shell.hidden}
        onRegenerate={handleRegenerate}
        onTogglePin={shell.togglePin}
        onZoomIn={handleZoomIn}
        onZoomOut={handleZoomOut}
        onFitWidth={handleFitWidth}
        onFitHeight={handleFitHeight}
        onSetViewMode={handleSetViewMode}
        onJumpToPage={handleJumpToPage}
        {...shell.toolbarHoverProps}
      />
    </div>
  );
}
