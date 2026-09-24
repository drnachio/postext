'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

interface PanelHeaderProps {
  title: ReactNode;
  /** Icon buttons or menus, right-aligned. */
  actions?: ReactNode;
  /** Optional count shown next to the title (tabular numerals). */
  count?: number;
  className?: string;
}

/** Fixed-height header shared by every sidebar panel so titles and action
 *  clusters line up when switching panels. `h-9` is the Sandbox's one top
 *  band: the viewport bar and the activity bar's logo cell use it too, so
 *  the three line up across the window. */
export function PanelHeader({ title, actions, count, className }: PanelHeaderProps) {
  return (
    <div
      className={cn('flex h-9 shrink-0 items-center justify-between gap-2 border-b px-3', className)}
      style={{ borderColor: 'var(--rule)', backgroundColor: 'var(--background)' }}
    >
      <h2 className="flex min-w-0 flex-1 items-center gap-2 text-sm font-semibold" style={{ color: 'var(--foreground)' }}>
        {typeof title === 'string' ? <span className="min-w-0 truncate">{title}</span> : <div className="flex min-w-0 flex-1 items-center">{title}</div>}
        {count !== undefined && (
          <span
            className="shrink-0 text-xs font-medium"
            style={{ color: 'var(--slate)', fontVariantNumeric: 'tabular-nums' }}
          >
            {count}
          </span>
        )}
      </h2>
      {actions && <div className="flex shrink-0 items-center gap-1">{actions}</div>}
    </div>
  );
}
