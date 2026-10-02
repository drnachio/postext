'use client';

import { useCallback, useRef, useState } from 'react';
import { FolioPreview, type FolioPreviewHandle } from './FolioPreview';
import { FolioToolbar } from './FolioToolbar';
import { useFloatingToolbarShell } from './useFloatingToolbarShell';
import { usePageHashSync, pageIndexOf, pageNumberAt, EMPTY_VIEWER_LAYOUT, type BookPageMap, type ViewerLayout } from './usePageHashSync';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { useLargeTargets } from '../ui/largeTargets';

/** The Folio tab: the book in 3D, kept in step with `#chapter=C&page=P`
 *  like the canvas (the page is the one on the right of the open spread),
 *  with the canvas's floating bar to type a book page number into. */
export function FolioViewport() {
  const [layout, setLayout] = useState<ViewerLayout>(EMPTY_VIEWER_LAYOUT);
  const [generating, setGenerating] = useState(false);
  // The pages of the spread the book is open at (or turning to).
  const [spread, setSpread] = useState<readonly number[]>([]);
  const [rightToLeft, setRightToLeft] = useState(false);
  const previewRef = useRef<FolioPreviewHandle | null>(null);
  const compact = useCompactLayout();
  const { large } = useLargeTargets();
  const handleJumpToPage = useCallback((pageIndex: number) => {
    previewRef.current?.jumpToPage(pageIndex);
  }, []);
  const handlePageCountChange = useCallback((count: number, firstPage: number, pageNumbers: readonly number[], book?: BookPageMap) => {
    setLayout((l) => ({ pageCount: count, firstPage, pageNumbers, version: l.version + 1, ...(book ? { book } : {}) }));
  }, []);
  const handleCurrentPageChange = usePageHashSync(layout, handleJumpToPage);
  const handleSpreadChange = useCallback((pages: readonly number[]) => {
    setSpread((prev) => (prev.length === pages.length && prev.every((p, i) => p === pages[i]) ? prev : [...pages]));
  }, []);
  // The bar shows and takes book page numbers; the viewer works in page
  // indices.
  const handleJumpToPageNumber = useCallback((pageNumber: number) => {
    const index = pageIndexOf(layout, pageNumber);
    if (index >= 0) previewRef.current?.turnToPage(index);
  }, [layout]);
  const handleRegenerate = useCallback(() => previewRef.current?.regenerate(), []);
  const handlePrev = useCallback(() => previewRef.current?.prev(), []);
  const handleNext = useCallback(() => previewRef.current?.next(), []);
  const handleResetView = useCallback(() => previewRef.current?.resetView(), []);

  const shell = useFloatingToolbarShell('folio', generating);

  const pageCount = layout.pageCount;
  const first = spread[0] ?? 0;
  const shown = spread[spread.length - 1] ?? 0;
  // The phone layout docks the bar along the bottom: the book is laid out
  // above it (button + padding + border, the bar's offset and a gap).
  const dockedBar = compact ? (large ? 44 : 32) + 2 * 4 + 2 + 2 * 8 : 0;

  return (
    <div className="relative h-full w-full" {...shell.containerProps}>
      <div className="absolute inset-x-0 top-0" style={{ bottom: dockedBar }}>
        <FolioPreview
          ref={previewRef}
          onGeneratingChange={setGenerating}
          onPageCountChange={handlePageCountChange}
          onCurrentPageChange={handleCurrentPageChange}
          onSpreadChange={handleSpreadChange}
          onBindingChange={setRightToLeft}
        />
      </div>
      <div {...shell.hoverStripProps} />
      <FolioToolbar
        generating={generating}
        pinned={shell.pinned}
        hidden={shell.hidden}
        pageCount={pageCount}
        pageNumber={pageNumberAt(layout, shown)}
        firstPageNumber={pageNumberAt(layout, 0)}
        lastPageNumber={pageNumberAt(layout, Math.max(0, pageCount - 1))}
        canPrev={first > 0}
        canNext={shown < pageCount - 1}
        rightToLeft={rightToLeft}
        onRegenerate={handleRegenerate}
        onTogglePin={shell.togglePin}
        onPrev={handlePrev}
        onNext={handleNext}
        onResetView={handleResetView}
        onJumpToPageNumber={handleJumpToPageNumber}
        {...shell.toolbarHoverProps}
      />
    </div>
  );
}
