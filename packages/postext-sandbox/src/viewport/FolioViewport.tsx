'use client';

import { useCallback, useRef, useState, type KeyboardEvent } from 'react';
import { DEFAULT_FOLIO_CONFIG } from 'postext';
import type { FolioInteraction } from 'postext-folio';
import { useSandboxDispatch, useSandboxStateGetter } from '../context/SandboxContext';
import { FolioPreview, type FolioPreviewHandle } from './FolioPreview';
import { FolioToolbar } from './FolioToolbar';
import { useFloatingToolbarShell } from './useFloatingToolbarShell';
import { usePageHashSync, pageIndexOf, pageNumberAt, EMPTY_VIEWER_LAYOUT, type BookPageMap, type ViewerLayout } from './usePageHashSync';
import { useCompactLayout } from '../hooks/useCompactLayout';
import { useLargeTargets } from '../ui/largeTargets';

const INTERACTION_KEYS: Record<string, FolioInteraction> = { h: 'hand', o: 'orbit', s: 'select', m: 'magnify' };

// The mode picked during this visit: a page load starts with the hand
// (turning pages), a tab switch back to Folio keeps the reader's choice.
let visitInteraction: FolioInteraction = 'hand';

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
  // What the left button does on the book.
  const [interaction, setInteraction] = useState<FolioInteraction>(() => visitInteraction);
  const handleSetInteraction = useCallback((mode: FolioInteraction) => {
    setInteraction(mode);
    visitInteraction = mode;
  }, []);
  // H, O, S and M switch the mode while the book (or its bar) has the focus.
  const handleKeyDown = useCallback((e: KeyboardEvent<HTMLDivElement>) => {
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    const target = e.target as HTMLElement;
    if (target.closest('input, textarea, select, [contenteditable="true"]')) return;
    const mode = INTERACTION_KEYS[e.key.toLowerCase()];
    if (!mode) return;
    e.preventDefault();
    handleSetInteraction(mode);
  }, [handleSetInteraction]);
  const compact = useCompactLayout();
  const { large } = useLargeTargets();
  // A restore opens the page at once; a page the reader asked for (a
  // fragment edited, a chapter picked) is turned to.
  const handleJumpToPage = useCallback((pageIndex: number, options?: { animate?: boolean }) => {
    if (options?.animate) previewRef.current?.turnToPage(pageIndex);
    else previewRef.current?.jumpToPage(pageIndex);
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
  // The view as the reader left it becomes the book's: `folio.tilt` and
  // `folio.yaw` (left out at their defaults), where Reset view comes back.
  const dispatch = useSandboxDispatch();
  const getState = useSandboxStateGetter();
  const handleSaveView = useCallback(() => {
    const view = previewRef.current?.getView();
    if (!view) return;
    const d = DEFAULT_FOLIO_CONFIG;
    const rest = { ...getState().config.folio };
    delete rest.tilt;
    delete rest.yaw;
    const folio = {
      ...rest,
      ...(view.tilt !== d.tilt ? { tilt: view.tilt } : {}),
      ...(view.yaw !== d.yaw ? { yaw: view.yaw } : {}),
    };
    dispatch({ type: 'UPDATE_CONFIG', payload: { folio: Object.keys(folio).length ? folio : undefined } });
  }, [dispatch, getState]);

  const shell = useFloatingToolbarShell('folio', generating);

  const pageCount = layout.pageCount;
  const first = spread[0] ?? 0;
  const shown = spread[spread.length - 1] ?? 0;
  // The phone layout docks the bar along the bottom: the book is laid out
  // above it (button + padding + border, the bar's offset and a gap).
  const dockedBar = compact ? (large ? 44 : 32) + 2 * 4 + 2 + 2 * 8 : 0;

  return (
    <div className="relative h-full w-full" {...shell.containerProps} onKeyDown={handleKeyDown}>
      <div className="absolute inset-x-0 top-0" style={{ bottom: dockedBar }}>
        <FolioPreview
          ref={previewRef}
          interaction={interaction}
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
        interaction={interaction}
        onSetInteraction={handleSetInteraction}
        onRegenerate={handleRegenerate}
        onTogglePin={shell.togglePin}
        onPrev={handlePrev}
        onNext={handleNext}
        onResetView={handleResetView}
        onSaveView={handleSaveView}
        onJumpToPageNumber={handleJumpToPageNumber}
        {...shell.toolbarHoverProps}
      />
    </div>
  );
}
