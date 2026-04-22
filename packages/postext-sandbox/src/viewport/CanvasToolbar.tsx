'use client';

import { useEffect, useState, type ReactNode } from 'react';
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
import { Tooltip } from '../panels/Tooltip';

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
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

// In spread view, pages are grouped into rows as [[0],[1,2],[3,4],…]. The
// `currentPage` reported by the preview is always the leftmost page of the
// visible row, so next/prev must jump row-to-row rather than ±1.
function nextPageTarget(current: number, viewMode: ViewMode): number {
  if (viewMode === 'single') return current + 1;
  return current === 0 ? 1 : current + 2;
}
function prevPageTarget(current: number, viewMode: ViewMode): number {
  if (viewMode === 'single') return current - 1;
  return current <= 1 ? 0 : current - 2;
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

function PageNumberInput({
  currentPage,
  pageCount,
  onJumpToPage,
  label,
}: {
  currentPage: number;
  pageCount: number;
  onJumpToPage: (pageIndex: number) => void;
  label: string;
}) {
  const [draft, setDraft] = useState(String(currentPage + 1));
  const [focused, setFocused] = useState(false);
  useEffect(() => {
    if (!focused) setDraft(String(currentPage + 1));
  }, [currentPage, focused]);

  const commit = () => {
    const n = parseInt(draft, 10);
    if (Number.isFinite(n) && pageCount > 0) {
      const clamped = Math.max(1, Math.min(pageCount, n));
      onJumpToPage(clamped - 1);
      setDraft(String(clamped));
    } else {
      setDraft(String(currentPage + 1));
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
            setDraft(String(currentPage + 1));
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
  onMouseEnter,
  onMouseLeave,
}: CanvasToolbarProps) {
  const { state } = useSandbox();
  const { labels } = state;
  const prevTarget = prevPageTarget(currentPage, viewMode);
  const nextTarget = nextPageTarget(currentPage, viewMode);
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
        currentPage={currentPage}
        pageCount={pageCount}
        onJumpToPage={onJumpToPage}
        label={labels.pageNumberInput}
      />
      <ToolbarButton
        icon={<ChevronDown size={16} aria-hidden="true" />}
        label={labels.nextPage}
        onClick={() => onJumpToPage(Math.min(pageCount - 1, nextTarget))}
        disabled={nextDisabled}
      />
      <style>{`@keyframes postext-spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}
