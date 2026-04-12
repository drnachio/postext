'use client';

import { RotateCcw } from 'lucide-react';
import { Tooltip } from '../panels/Tooltip';

interface ResetButtonProps {
  onClick: () => void;
  label?: string;
}

export function ResetButton({ onClick, label = 'Reset to default' }: ResetButtonProps) {
  return (
    <Tooltip content={label} side="left">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="inline-flex items-center justify-center rounded transition-colors"
        style={{
          color: 'var(--slate)',
          width: 18,
          height: 18,
          flexShrink: 0,
          cursor: 'pointer',
          border: 'none',
          background: 'none',
          padding: 0,
        }}
        onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
        onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
      >
        <RotateCcw size={11} aria-hidden="true" />
      </button>
    </Tooltip>
  );
}
