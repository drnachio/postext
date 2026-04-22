'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { CanvasPreview, type CanvasPreviewHandle } from './CanvasPreview';
import { CanvasToolbar } from './CanvasToolbar';
import { useFloatingToolbarShell } from './useFloatingToolbarShell';
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
  const [pageCount, setPageCount] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
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

  const shell = useFloatingToolbarShell('canvas', generating);

  return (
    <div className="relative h-full w-full" {...shell.containerProps}>
      <CanvasPreview
        ref={previewRef}
        zoom={zoom}
        viewMode={viewMode}
        fitMode={fitMode}
        onGeneratingChange={setGenerating}
        onPageCountChange={setPageCount}
        onCurrentPageChange={setCurrentPage}
      />
      <div {...shell.hoverStripProps} />
      <CanvasToolbar
        zoom={zoom}
        viewMode={viewMode}
        fitMode={fitMode}
        generating={generating}
        currentPage={currentPage}
        pageCount={pageCount}
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
