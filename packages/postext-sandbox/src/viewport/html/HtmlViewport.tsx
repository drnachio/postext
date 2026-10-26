'use client';

import { useCallback, useState, useEffect, useRef } from 'react';
import { applyHtmlViewerOverrides, resolveLayoutConfig } from 'postext';
import { useSandboxSelector } from '../../context/SandboxContext.js';
import { HtmlPreview, type HtmlPreviewHandle } from './HtmlPreview/index.js';
import { HtmlToolbar } from './HtmlToolbar.js';
import { useFloatingToolbarShell } from '../useFloatingToolbarShell.js';
import { useViewerControls } from '../viewerControls.js';
import { usePageHashSync, pageIndexOf, pageNumberAt, EMPTY_VIEWER_LAYOUT, type BookPageMap, type ViewerLayout } from '../usePageHashSync.js';
import {
  loadHtmlFontScale,
  saveHtmlFontScale,
  loadHtmlColumnMode,
  saveHtmlColumnMode,
} from '../../storage/persistence.js';

type ColumnMode = 'single' | 'multi';

const MIN_FONT_SCALE = 0.6;
const MAX_FONT_SCALE = 2.5;
const FONT_SCALE_STEP = 1.1;

const clampFontScale = (n: number) =>
  Math.max(MIN_FONT_SCALE, Math.min(MAX_FONT_SCALE, n));

export function HtmlViewport() {
  const [fontScale, setFontScale] = useState(1);
  const [columnMode, setColumnMode] = useState<ColumnMode>('multi');
  const [generating, setGenerating] = useState(false);
  const [scrollBounds, setScrollBounds] = useState<{ canPrev: boolean; canNext: boolean; rtl?: boolean }>({ canPrev: false, canNext: false });
  const [layout, setLayout] = useState<ViewerLayout>(EMPTY_VIEWER_LAYOUT);
  const previewRef = useRef<HtmlPreviewHandle | null>(null);
  const hydratedRef = useRef(false);
  // A vertical book (`layout.writingMode: 'vertical-rl'`) has no vertical
  // scroll: its lines run down the page and its pages right to left, so it
  // is only read paged. The reader's saved choice is kept for the next
  // horizontal book.
  const verticalBook = useSandboxSelector(
    (s) => resolveLayoutConfig(applyHtmlViewerOverrides(s.config).layout).writingMode === 'vertical-rl',
  );
  const effectiveColumnMode: ColumnMode = verticalBook ? 'multi' : columnMode;

  useEffect(() => {
    const savedScale = loadHtmlFontScale();
    if (savedScale !== null) {
      setFontScale(clampFontScale(savedScale));
    }
    const savedMode = loadHtmlColumnMode();
    if (savedMode === 'single' || savedMode === 'multi') {
      setColumnMode(savedMode);
    }
    const id = requestAnimationFrame(() => {
      hydratedRef.current = true;
    });
    return () => cancelAnimationFrame(id);
  }, []);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveHtmlFontScale(fontScale);
  }, [fontScale]);

  useEffect(() => {
    if (!hydratedRef.current) return;
    saveHtmlColumnMode(columnMode);
  }, [columnMode]);

  const handleFontScaleUp = () => {
    setFontScale((s) => clampFontScale(s * FONT_SCALE_STEP));
  };

  const handleFontScaleDown = () => {
    setFontScale((s) => clampFontScale(s / FONT_SCALE_STEP));
  };

  const handleSetColumnMode = (mode: ColumnMode) => {
    setColumnMode(mode);
  };

  const handleRegenerate = useCallback(() => {
    previewRef.current?.regenerate();
  }, []);

  const handleScrollColumn = useCallback((delta: number) => {
    previewRef.current?.scrollColumn(delta);
  }, []);

  // `#chapter=C&page=P` in the URL: restored once the document is laid
  // out, written back as the reader scrolls — the same fragment the canvas
  // viewer keeps.
  const handleJumpToPage = useCallback((pageIndex: number) => {
    previewRef.current?.jumpToPage(pageIndex);
  }, []);
  const handlePageCountChange = useCallback((count: number, firstPage: number, pageNumbers: readonly number[], book?: BookPageMap) => {
    setLayout((l) => ({ pageCount: count, firstPage, pageNumbers, version: l.version + 1, ...(book ? { book } : {}) }));
  }, []);
  const syncPageHash = usePageHashSync(layout, handleJumpToPage);
  const [currentPage, setCurrentPage] = useState(0);
  const handleCurrentPageChange = useCallback((pageIndex: number) => {
    setCurrentPage(pageIndex);
    syncPageHash(pageIndex);
  }, [syncPageHash]);

  const shell = useFloatingToolbarShell('html', generating);

  useViewerControls('html', {
    status: () => ({
      fontScale,
      columns: effectiveColumnMode,
      toolbarPinned: shell.pinned,
      generating,
      pageCount: layout.pageCount,
      pageIndex: currentPage,
      pageNumber: pageNumberAt(layout, currentPage),
      ...(effectiveColumnMode === 'multi' ? { canPrevious: scrollBounds.canPrev, canNext: scrollBounds.canNext } : {}),
      ...(verticalBook && columnMode === 'single' ? { columnsForced: true } : {}),
      videos: (previewRef.current?.videos() ?? []).map((v) => ({ resource: v.resource, pageNumber: pageNumberAt(layout, v.pageIndex), state: v.state })),
    }),
    set: (settings) => {
      if (settings.fontScale !== undefined) setFontScale(clampFontScale(settings.fontScale));
      if (settings.columns !== undefined) setColumnMode(settings.columns);
      if (settings.toolbarPinned !== undefined) shell.setPinned(settings.toolbarPinned);
    },
    regenerate: handleRegenerate,
    goToPage: handleJumpToPage,
    step: handleScrollColumn,
    goToEdge: (edge) => handleJumpToPage(edge === 'first' ? 0 : Math.max(0, layout.pageCount - 1)),
    playVideo: async ({ pageNumber, ...pick }) => {
      const pageIndex = pageNumber === undefined ? undefined : pageIndexOf(layout, pageNumber);
      if (pageIndex !== undefined && pageIndex < 0) return { played: false, reason: 'none' };
      const { pageIndex: at, ...result } = (await previewRef.current?.playVideo({ ...pick, ...(pageIndex !== undefined ? { pageIndex } : {}) })) ?? { played: false, reason: 'none' as const };
      return { ...result, ...(at !== undefined ? { pageNumber: pageNumberAt(layout, at) } : {}) };
    },
    stopVideo: () => previewRef.current?.stopVideo(),
  });

  return (
    <div className="relative h-full w-full" {...shell.containerProps}>
      <HtmlPreview
        ref={previewRef}
        fontScale={fontScale}
        columnMode={effectiveColumnMode}
        onGeneratingChange={setGenerating}
        onScrollBoundsChange={setScrollBounds}
        onPageCountChange={handlePageCountChange}
        onCurrentPageChange={handleCurrentPageChange}
      />
      <div {...shell.hoverStripProps} />
      <HtmlToolbar
        fontScale={fontScale}
        columnMode={effectiveColumnMode}
        singleColumnUnavailable={verticalBook}
        generating={generating}
        pinned={shell.pinned}
        hidden={shell.hidden}
        canScrollPrev={scrollBounds.canPrev}
        canScrollNext={scrollBounds.canNext}
        rightToLeft={scrollBounds.rtl === true}
        onRegenerate={handleRegenerate}
        onTogglePin={shell.togglePin}
        onFontScaleUp={handleFontScaleUp}
        onFontScaleDown={handleFontScaleDown}
        onSetColumnMode={handleSetColumnMode}
        onScrollColumn={handleScrollColumn}
        {...shell.toolbarHoverProps}
      />
    </div>
  );
}
