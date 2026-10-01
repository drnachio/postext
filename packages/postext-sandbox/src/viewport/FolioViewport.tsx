'use client';

import { useCallback, useRef, useState } from 'react';
import { FolioPreview, type FolioPreviewHandle } from './FolioPreview';
import { usePageHashSync, EMPTY_VIEWER_LAYOUT, type BookPageMap, type ViewerLayout } from './usePageHashSync';

/** The Folio tab: the book in 3D, kept in step with `#chapter=C&page=P`
 *  like the canvas (the page is the one on the right of the open spread). */
export function FolioViewport() {
  const [layout, setLayout] = useState<ViewerLayout>(EMPTY_VIEWER_LAYOUT);
  const previewRef = useRef<FolioPreviewHandle | null>(null);
  const handleJumpToPage = useCallback((pageIndex: number) => {
    previewRef.current?.jumpToPage(pageIndex);
  }, []);
  const handlePageCountChange = useCallback((count: number, firstPage: number, pageNumbers: readonly number[], book?: BookPageMap) => {
    setLayout((l) => ({ pageCount: count, firstPage, pageNumbers, version: l.version + 1, ...(book ? { book } : {}) }));
  }, []);
  const handleCurrentPageChange = usePageHashSync(layout, handleJumpToPage);

  return (
    <div className="relative h-full w-full">
      <FolioPreview
        ref={previewRef}
        onPageCountChange={handlePageCountChange}
        onCurrentPageChange={handleCurrentPageChange}
      />
    </div>
  );
}
