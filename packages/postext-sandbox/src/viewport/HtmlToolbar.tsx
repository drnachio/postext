'use client';

import {
  AArrowUp,
  AArrowDown,
  AlignLeft,
  Columns3,
  RefreshCw,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react';
import { useSandbox } from '../context/SandboxContext';
import {
  PinToolbarButton,
  TOOLBAR_STYLE_BASE,
  ToolbarButton,
  ToolbarSeparator,
  toolbarHiddenStyle,
} from './CanvasToolbar';

type ColumnMode = 'single' | 'multi';

interface HtmlToolbarProps {
  fontScale: number;
  columnMode: ColumnMode;
  generating: boolean;
  pinned: boolean;
  hidden: boolean;
  canScrollPrev: boolean;
  canScrollNext: boolean;
  onRegenerate: () => void;
  onTogglePin: () => void;
  onFontScaleUp: () => void;
  onFontScaleDown: () => void;
  onSetColumnMode: (mode: ColumnMode) => void;
  onScrollColumn: (delta: number) => void;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
}

export function HtmlToolbar({
  fontScale,
  columnMode,
  generating,
  pinned,
  hidden,
  canScrollPrev,
  canScrollNext,
  onRegenerate,
  onTogglePin,
  onFontScaleUp,
  onFontScaleDown,
  onSetColumnMode,
  onScrollColumn,
  onMouseEnter,
  onMouseLeave,
}: HtmlToolbarProps) {
  const { state } = useSandbox();
  const { labels } = state;
  const prevDisabled = columnMode !== 'multi' || !canScrollPrev;
  const nextDisabled = columnMode !== 'multi' || !canScrollNext;

  return (
    <div
      role="toolbar"
      aria-label={labels.htmlToolbar}
      className="flex flex-col items-center"
      style={{ ...TOOLBAR_STYLE_BASE, ...toolbarHiddenStyle(hidden) }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <ToolbarButton
        icon={<RefreshCw size={16} aria-hidden="true" />}
        label={labels.htmlRegenerate}
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
        icon={<AArrowUp size={16} aria-hidden="true" />}
        label={labels.fontScaleUp}
        onClick={onFontScaleUp}
        disabled={fontScale >= 2.5 - 1e-6}
      />
      <ToolbarButton
        icon={<AArrowDown size={16} aria-hidden="true" />}
        label={labels.fontScaleDown}
        onClick={onFontScaleDown}
        disabled={fontScale <= 0.6 + 1e-6}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<AlignLeft size={16} aria-hidden="true" />}
        label={labels.singleColumn}
        onClick={() => onSetColumnMode('single')}
        active={columnMode === 'single'}
      />
      <ToolbarButton
        icon={<Columns3 size={16} aria-hidden="true" />}
        label={labels.multiColumn}
        onClick={() => onSetColumnMode('multi')}
        active={columnMode === 'multi'}
      />
      <ToolbarSeparator />
      <ToolbarButton
        icon={<ChevronLeft size={16} aria-hidden="true" />}
        label={labels.previousColumn}
        onClick={() => onScrollColumn(-1)}
        disabled={prevDisabled}
      />
      <ToolbarButton
        icon={<ChevronRight size={16} aria-hidden="true" />}
        label={labels.nextColumn}
        onClick={() => onScrollColumn(1)}
        disabled={nextDisabled}
      />
    </div>
  );
}
