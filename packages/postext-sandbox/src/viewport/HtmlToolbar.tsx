'use client';

import type { ReactNode } from 'react';
import { AArrowUp, AArrowDown, AlignLeft, Columns3 } from 'lucide-react';
import { useSandbox } from '../context/SandboxContext';
import { Tooltip } from '../panels/Tooltip';

type ColumnMode = 'single' | 'multi';

interface HtmlToolbarProps {
  fontScale: number;
  columnMode: ColumnMode;
  onFontScaleUp: () => void;
  onFontScaleDown: () => void;
  onSetColumnMode: (mode: ColumnMode) => void;
}

function ToolbarButton({
  icon,
  label,
  onClick,
  active,
  disabled,
}: {
  icon: ReactNode;
  label: string;
  onClick: () => void;
  active?: boolean;
  disabled?: boolean;
}) {
  return (
    <Tooltip content={label} side="left">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        aria-pressed={active}
        disabled={disabled}
        className="flex shrink-0 cursor-pointer items-center justify-center rounded-md transition-colors focus-visible:outline-1 focus-visible:outline-offset-1 disabled:cursor-default disabled:opacity-40"
        style={{
          width: 28,
          height: 28,
          color: active ? 'var(--gilt)' : 'var(--slate)',
          backgroundColor: active ? 'var(--surface)' : 'transparent',
          outlineColor: 'var(--gilt-hover)',
        }}
        onMouseEnter={(e) => {
          if (!active && !disabled) {
            e.currentTarget.style.color = 'var(--foreground)';
            e.currentTarget.style.backgroundColor = 'var(--surface)';
          }
        }}
        onMouseLeave={(e) => {
          if (!active && !disabled) {
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

export function HtmlToolbar({
  fontScale,
  columnMode,
  onFontScaleUp,
  onFontScaleDown,
  onSetColumnMode,
}: HtmlToolbarProps) {
  const { state } = useSandbox();
  const { labels } = state;

  return (
    <div
      role="toolbar"
      aria-label={labels.htmlToolbar}
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
      <Separator />
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
    </div>
  );
}
