'use client';

import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';

export interface ListRowProps extends Omit<ComponentProps<'div'>, 'title'> {
  selected?: boolean;
  disabled?: boolean;
  /** Makes the main area a button; omit for static rows. */
  onSelect?: () => void;
  onDoubleClick?: () => void;
  /** Leading glyph/thumbnail. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small tags rendered after the title. */
  tags?: ReactNode;
  /** Icon buttons shown at the right (always visible; keep to 2–4). */
  actions?: ReactNode;
  /** Accessible label of the select button when `title` is not plain text. */
  ariaLabel?: string;
  /** Align leading/actions to the first line (multi-line rows). */
  alignTop?: boolean;
}

/** The one list row: same padding, hover, selected ring and focus treatment
 *  for projects, chapters, resources, fonts and warnings. */
export const ListRow = forwardRef<HTMLDivElement, ListRowProps>(function ListRow(
  { selected, disabled, onSelect, onDoubleClick, leading, title, subtitle, tags, actions, ariaLabel, alignTop, className, ...rest },
  ref,
) {
  const interactive = !!onSelect;
  const main = (
    <div className={cn('flex min-w-0 flex-1 gap-2', alignTop ? 'items-start' : 'items-center')}>
      {leading && <span className="inline-flex shrink-0" aria-hidden="true">{leading}</span>}
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5">
          <span className="min-w-0 max-w-full truncate text-xs font-medium" style={{ color: 'var(--foreground)' }}>{title}</span>
          {tags}
        </div>
        {subtitle && (
          <div className="mt-0.5 text-[11px] leading-[14px]" style={{ color: 'var(--slate)' }}>{subtitle}</div>
        )}
      </div>
    </div>
  );
  return (
    <div
      ref={ref}
      data-selected={selected || undefined}
      className={cn(
        'group flex items-center gap-1 rounded border px-2 py-1.5 transition-colors',
        selected ? 'border-(--gilt) bg-(--surface)' : 'border-transparent',
        interactive && !disabled && !selected && 'hover:bg-(--surface)',
        disabled && 'opacity-50',
        className,
      )}
      {...rest}
    >
      {interactive ? (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onDoubleClick}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-current={selected || undefined}
          className={cn(
            'flex min-w-0 flex-1 cursor-pointer rounded border-0 bg-transparent p-0 text-left',
            'focus-visible:outline-1 focus-visible:outline-offset-2 outline-(--gilt-hover)',
            'disabled:cursor-default',
          )}
        >
          {main}
        </button>
      ) : (
        main
      )}
      {actions && <div className="flex shrink-0 items-center gap-0.5">{actions}</div>}
    </div>
  );
});

/** Tiny uppercase tag used inside rows (locale, Active, Default…). */
export function RowTag({ children, accent }: { children: ReactNode; accent?: boolean }) {
  return (
    <span
      className="shrink-0 rounded border px-1 text-[9px] font-semibold uppercase leading-[14px] tracking-wide"
      style={{
        borderColor: accent ? 'var(--gilt)' : 'var(--rule)',
        color: accent ? 'var(--gilt)' : 'var(--slate)',
      }}
    >
      {children}
    </span>
  );
}
