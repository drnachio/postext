'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { CanvasPreview, type CanvasPreviewHandle } from './CanvasPreview';
import { CanvasToolbar } from './CanvasToolbar';
import { useFloatingToolbarShell } from './useFloatingToolbarShell';
import { usePageHashSync, pageIndexOf, pageNumberAt, EMPTY_VIEWER_LAYOUT, type ViewerLayout } from './usePageHashSync';
import { loadCanvasViewMode, saveCanvasViewMode, loadCanvasFitMode, saveCanvasFitMode, loadCanvasZoom, saveCanvasZoom } from '../storage/persistence';

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

  // `#chapter=C&page=P` in the URL: restored once the document is laid
  // out, written back as the reader scrolls.
  const handlePageCountChange = useCallback((count: number, firstPage: number, pageNumbers: readonly number[], recto: boolean) => {
    setLayout((l) => ({ pageCount: count, firstPage, pageNumbers, version: l.version + 1 }));
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
