'use client';

import { useEffect, useState, type FocusEventHandler, type ReactNode } from 'react';
import {
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
  MoveVertical,
  File,
  BookOpen,
  RefreshCw,
  ChevronUp,
  ChevronDown,
  Pin,
  PinOff,
} from 'lucide-react';
import { useSandbox } from '../context/SandboxContext';
import { groupPagesIntoRows } from './CanvasPreview/layoutUtils';
import { Tooltip } from '../ui';

type ViewMode = 'single' | 'spread';
type FitMode = 'none' | 'width' | 'height';

// Common placement + hide-animation style for every floating right-edge
// toolbar. `hidden` slides it fully off-screen; the transition keeps the
// slide-in/slide-out feeling smooth when the pointer approaches.
const TOOLBAR_TOP = 60;
export const TOOLBAR_STYLE_BASE = {
  position: 'absolute' as const,
  right: 12,
  top: TOOLBAR_TOP,
  zIndex: 10,
  gap: 2,
  backgroundColor: 'var(--background)',
  border: '1px solid var(--rule)',
  borderRadius: 8,
  padding: 4,
  boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
  transition: 'transform 200ms ease',
} as const;

export function toolbarHiddenStyle(hidden: boolean): React.CSSProperties {
  return hidden
    ? { transform: 'translateX(calc(100% + 24px))' }
    : { transform: 'translateX(0)' };
}

interface CanvasToolbarProps {
  zoom: number;
  viewMode: ViewMode;
  fitMode: FitMode;
  generating: boolean;
  currentPage: number;
  pageCount: number;
  /** Book page number printed on the current page, and the chapter's
   *  first / last ones — what the page field shows and accepts. */
  pageNumber: number;
  firstPageNumber: number;
  lastPageNumber: number;
  /** Whether page 0 is a right-hand page (drives the spread pairing). */
  firstPageRecto: boolean;
  pinned: boolean;
  hidden: boolean;
  onRegenerate: () => void;
  onTogglePin: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitHeight: () => void;
  onSetViewMode: (mode: ViewMode) => void;
  onJumpToPage: (pageIndex: number) => void;
  onJumpToPageNumber: (pageNumber: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onFocus?: FocusEventHandler<HTMLDivElement>;
  onBlur?: FocusEventHandler<HTMLDivElement>;
}

// In spread view the preview groups pages into verso/recto rows (see
// `groupPagesIntoRows`: a chapter opening on a recto shows it alone, one
// opening on a verso pairs it with the next page), and the `currentPage` it
// reports is the leftmost page of the visible row — so next/prev jump to
// the first page of the neighbouring row, whatever the pairing. Out of
// range means there is no such row.
function rowTargets(current: number, viewMode: ViewMode, pageCount: number, firstPageRecto: boolean): { prev: number; next: number } {
  if (viewMode === 'single') return { prev: current - 1, next: current + 1 };
  const rows = groupPagesIntoRows(pageCount, viewMode, firstPageRecto);
  const r = rows.findIndex((row) => row.includes(current));
  if (r < 0) return { prev: current - 1, next: current + 1 };
  return { prev: rows[r - 1]?.[0] ?? -1, next: rows[r + 1]?.[0] ?? pageCount };
}

export function ToolbarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
  spinning,
  accent,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
  spinning?: boolean;
  // When true, tint the icon with the accent color (gold/yellow). Used to
  // make the spinning recalculate button more attention-grabbing.
  accent?: boolean;
}) {
  // Disabled buttons are rendered as a ghosted trace rather than the usual
  // dimmed-clickable look. User asked for them to blend in instead of
  // shouting "this button doesn't work".
  return (
    <Tooltip content={label} side="left">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 disabled:cursor-default"
        style={{
          width: 28,
          height: 28,
          color: accent ? 'var(--gilt)' : active ? 'var(--gilt)' : 'var(--slate)',
          backgroundColor: active ? 'var(--surface)' : 'transparent',
          outlineColor: 'var(--gilt-hover)',
          opacity: disabled ? 0.18 : 1,
        }}
        onMouseEnter={(e) => {
          if (disabled || active || accent) return;
          e.currentTarget.style.color = 'var(--foreground)';
          e.currentTarget.style.backgroundColor = 'var(--surface)';
        }}
        onMouseLeave={(e) => {
          if (disabled || active || accent) return;
          e.currentTarget.style.color = 'var(--slate)';
          e.currentTarget.style.backgroundColor = 'transparent';
        }}
      >
        <span
          aria-hidden="true"
          style={spinning ? { animation: 'postext-spin 0.8s linear infinite', display: 'inline-flex' } : undefined}
        >
          {icon}
        </span>
      </button>
    </Tooltip>
  );
}

export function ToolbarSeparator() {
  return (
    <div
      className="mx-1 w-full shrink-0"
      style={{ height: 1, backgroundColor: 'var(--rule)' }}
      aria-hidden="true"
    />
  );
}

export function PinToolbarButton({
  pinned,
  onToggle,
  pinLabel,
  unpinLabel,
}: {
  pinned: boolean;
  onToggle: () => void;
  pinLabel: string;
  unpinLabel: string;
}) {
  return (
    <ToolbarButton
      icon={pinned ? <Pin size={16} aria-hidden="true" /> : <PinOff size={16} aria-hidden="true" />}
      label={pinned ? unpinLabel : pinLabel}
      onClick={onToggle}
      active={pinned}
    />
  );
}

/** The page field shows the book page number printed on the current page
 *  (not its index in the chapter) and jumps to the page carrying the
 *  number typed, clamped to the chapter's range. */
function PageNumberInput({
  pageNumber,
  firstPageNumber,
  lastPageNumber,
  pageCount,
  onJumpToPageNumber,
  label,
}: {
  pageNumber: number;
  firstPageNumber: number;
  lastPageNumber: number;
  pageCount: number;
  onJumpToPageNumber: (pageNumber: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(String(pageNumber));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(pageNumber));
  }, [pageNumber, focused]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && pageCount > 0) {
      const clamped = Math.max(firstPageNumber, Math.min(lastPageNumber, n));
      onJumpToPageNumber(clamped);
      setDraft(String(clamped));
    } else {
      setDraft(String(pageNumber));
    }
  };

  return (
    <Tooltip content={label} side="left">
      <input
        type="text"
        inputMode="numeric"
        value={draft}
        aria-label={label}
        disabled={pageCount === 0}
        onFocus={(e) => {
          setFocused(true);
          e.currentTarget.select();
        }}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        onChange={(e) => setDraft(e.currentTarget.value.replace(/[^0-9]/g, ''))}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            commit();
            (e.currentTarget as HTMLInputElement).blur();
          } else if (e.key === 'Escape') {
            setDraft(String(pageNumber));
            (e.currentTarget as HTMLInputElement).blur();
          }
        }}
        className="rounded-md text-center focus-visible:outline-1 focus-visible:outline-offset-1"
        style={{
          width: 28,
          height: 22,
          fontSize: 11,
          color: 'var(--foreground)',
          backgroundColor: 'var(--surface)',
          border: '1px solid var(--rule)',
          outlineColor: 'var(--gilt-hover)',
          opacity: pageCount === 0 ? 0.18 : 1,
        }}
      />
    </Tooltip>
  );
}

export function CanvasToolbar({
  viewMode,
  fitMode,
  generating,
  currentPage,
  pageCount,
  pageNumber,
  firstPageNumber,
  lastPageNumber,
  firstPageRecto,
  pinned,
  hidden,
  onRegenerate,
  onTogglePin,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitHeight,
  onSetViewMode,
  onJumpToPage,
  onJumpToPageNumber,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onBlur,
}: CanvasToolbarProps) {
  const { state } = useSandbox();
  const { labels } = state;
  const { prev: prevTarget, next: nextTarget } = rowTargets(currentPage, viewMode, pageCount, firstPageRecto);
  const prevDisabled = pageCount === 0 || currentPage <= 0;
  const nextDisabled = pageCount === 0 || nextTarget > pageCount - 1;

  return (
    <div
      role="toolbar"
      aria-label={labels.canvasToolbar}
      className="flex flex-col items-center"
      style={{ ...TOOLBAR_STYLE_BASE, ...toolbarHiddenStyle(hidden) }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onFocus={onFocus}
      onBlur={onBlur}
    >
      <ToolbarButton
        icon={<RefreshCw size={16} aria-hidden="true" />}
        label={labels.canvasRegenerate}
        onClick={onRegenerate}
        spinning={generating}
        accent={generating}
      />
      <ToolbarSeparator />
      <PinToolbarButton
        pinned={pinned}
        onToggle={onTogglePin}
        pinLabel={labels.toolbarPin}
        unpinLabel={labels.toolbarUnpin}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<ZoomIn size={16} aria-hidden="true" />}
        label={labels.zoomIn}
        onClick={onZoomIn}
      />
      <ToolbarButton
        icon={<ZoomOut size={16} aria-hidden="true" />}
        label={labels.zoomOut}
        onClick={onZoomOut}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<MoveHorizontal size={16} aria-hidden="true" />}
        label={labels.fitWidth}
        onClick={onFitWidth}
        active={fitMode === 'width'}
      />
      <ToolbarButton
        icon={<MoveVertical size={16} aria-hidden="true" />}
        label={labels.fitHeight}
        onClick={onFitHeight}
        active={fitMode === 'height'}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<File size={16} aria-hidden="true" />}
        label={labels.singlePage}
        onClick={() => onSetViewMode('single')}
        active={viewMode === 'single'}
      />
      <ToolbarButton
        icon={<BookOpen size={16} aria-hidden="true" />}
        label={labels.doublePageSpread}
        onClick={() => onSetViewMode('spread')}
        active={viewMode === 'spread'}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<ChevronUp size={16} aria-hidden="true" />}
        label={labels.previousPage}
        onClick={() => onJumpToPage(Math.max(0, prevTarget))}
        disabled={prevDisabled}
      />
      <PageNumberInput
        pageNumber={pageNumber}
        firstPageNumber={firstPageNumber}
        lastPageNumber={lastPageNumber}
        pageCount={pageCount}
        onJumpToPageNumber={onJumpToPageNumber}
        label={labels.pageNumberInput}
      />
      <ToolbarButton
        icon={<ChevronDown size={16} aria-hidden="true" />}
        label={labels.nextPage}
        onClick={() => onJumpToPage(Math.min(pageCount - 1, nextTarget))}
        disabled={nextDisabled}
      />
    </div>
  );
}
