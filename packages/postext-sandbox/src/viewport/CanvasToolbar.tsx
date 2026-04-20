'use client';

import type { ReactNode } from 'react';
import {
  ZoomIn,
  ZoomOut,
  MoveHorizontal,
  MoveVertical,
  File,
  BookOpen,
} from 'lucide-react';
import { useSandbox } from '../context/SandboxContext';
import { Tooltip } from '../panels/Tooltip';

type ViewMode = 'single' | 'spread';
type FitMode = 'none' | 'width' | 'height';

interface CanvasToolbarProps {
  zoom: number;
  viewMode: ViewMode;
  fitMode: FitMode;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onFitWidth: () => void;
  onFitHeight: () => void;
  onSetViewMode: (mode: ViewMode) => void;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <Tooltip content={label} side="left">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-1 focus-visible:outline-offset-1"
        style={{
          width: 28,
          height: 28,
          color: active ? 'var(--gilt)' : 'var(--slate)',
          backgroundColor: active ? 'var(--surface)' : 'transparent',
          outlineColor: 'var(--gilt-hover)',
        }}
        onMouseEnter={(e) => {
          if (!active) {
            e.currentTarget.style.color = 'var(--foreground)';
            e.currentTarget.style.backgroundColor = 'var(--surface)';
          }
        }}
        onMouseLeave={(e) => {
          if (!active) {
            e.currentTarget.style.color = 'var(--slate)';
            e.currentTarget.style.backgroundColor = 'transparent';
          }
        }}
      >
        {icon}
      </button>
    </Tooltip>
  );
}

function Separator() {
  return (
    <div
      className="mx-1 w-full shrink-0"
      style={{ height: 1, backgroundColor: 'var(--rule)' }}
      aria-hidden="true"
    />
  );
}

export function CanvasToolbar({
  viewMode,
  fitMode,
  onZoomIn,
  onZoomOut,
  onFitWidth,
  onFitHeight,
  onSetViewMode,
}: CanvasToolbarProps) {
  const { state } = useSandbox();
  const { labels } = state;

  return (
    <div
      role="toolbar"
      aria-label={labels.canvasToolbar}
      className="flex flex-col items-center"
      style={{
        position: 'absolute',
        right: 12,
        top: 12,
        zIndex: 10,
        gap: 2,
        backgroundColor: 'var(--background)',
        border: '1px solid var(--rule)',
        borderRadius: 8,
        padding: 4,
        boxShadow: '0 2px 8px rgba(0, 0, 0, 0.15)',
      }}
    >
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
      <Separator />
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
      <Separator />
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
    </div>
  );
}
