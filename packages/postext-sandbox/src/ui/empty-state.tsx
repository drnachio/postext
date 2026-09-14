'use client';

import type { ReactNode } from 'react';
import { cn } from './cn';

interface EmptyStateProps {
  /** A lucide element sized ~28–32px. */
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  /** A `Button` (or two). */
  action?: ReactNode;
  /** Single muted line instead of the centred block. */
  compact?: boolean;
  className?: string;
}

/** Consistent "nothing here yet" block. */
export function EmptyState({ icon, title, description, action, compact, className }: EmptyStateProps) {
  if (compact) {
    return (
      <p className={cn('mb-2 text-xs', className)} style={{ color: 'var(--slate)' }}>
        {title}
      </p>
    );
  }
  return (
    <div className={cn('flex flex-col items-center gap-2 px-3 py-6 text-center', className)}>
      {icon && (
        <span aria-hidden="true" className="inline-flex" style={{ color: 'var(--rule)' }}>
          {icon}
        </span>
      )}
      <p className="text-xs font-medium" style={{ color: 'var(--foreground)' }}>{title}</p>
      {description && (
        <p className="text-xs" style={{ color: 'var(--slate)', maxWidth: 260 }}>{description}</p>
      )}
      {action && <div className="mt-1 flex items-center gap-2">{action}</div>}
    </div>
  );
}
