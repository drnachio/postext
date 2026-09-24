'use client';

import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';

export interface ListRowProps extends Omit<ComponentProps<'div'>, 'title'> {
  selected?: boolean;
  disabled?: boolean;
  /** Makes the main area a button; omit for static rows. */
  onSelect?: () => void;
  onDoubleClick?: () => void;
  /** A control before the main area, outside the select button (a drag
   *  handle). */
  handle?: ReactNode;
  /** Leading glyph/thumbnail. */
  leading?: ReactNode;
  title: ReactNode;
  subtitle?: ReactNode;
  /** Small tags rendered after the title. */
  tags?: ReactNode;
  /** Icon buttons shown at the right (always visible; keep to 2–4, sized
   *  18 so four of them still leave the title room). */
  actions?: ReactNode;
  /** Accessible label of the select button when `title` is not plain text. */
  ariaLabel?: string;
  /** Align leading/actions to the first line (multi-line rows). */
  alignTop?: boolean;
}

/** The one list row: same padding, hover, selected ring and focus treatment
 *  for projects, chapters, resources, fonts and warnings.
 *
 *  An interactive row's select button is stretched under the whole row
 *  (the content sits over it and lets pointer events through), so a tag can
 *  be a button of its own — a locale toggle — without nesting buttons. */
export const ListRow = forwardRef<HTMLDivElement, ListRowProps>(function ListRow(
  { selected, disabled, onSelect, onDoubleClick, handle, leading, title, subtitle, tags, actions, ariaLabel, alignTop, className, ...rest },
  ref,
) {
  const interactive = !!onSelect;
  const main = (
    <div
      className={cn(
        'relative z-10 flex min-w-0 flex-1 gap-2',
        alignTop ? 'items-start' : 'items-center',
        interactive && 'pointer-events-none',
      )}
    >
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
        'group relative flex items-center gap-1 rounded border px-2 py-1.5 transition-colors',
        selected ? 'border-(--brand) bg-(--surface)' : 'border-transparent',
        interactive && !disabled && !selected && 'hover:bg-(--surface)',
        disabled && 'opacity-50',
        className,
      )}
      {...rest}
    >
      {interactive && (
        <button
          type="button"
          onClick={onSelect}
          onDoubleClick={onDoubleClick}
          disabled={disabled}
          aria-label={ariaLabel ?? (typeof title === 'string' ? title : undefined)}
          aria-current={selected || undefined}
          className={cn(
            'absolute inset-0 z-0 cursor-pointer rounded border-0 bg-transparent p-0',
            'focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--brand-hover)',
            'disabled:cursor-default',
          )}
        />
      )}
      {handle && <div className="relative z-10 flex shrink-0 items-center self-stretch">{handle}</div>}
      {main}
      {actions && <div className="relative z-10 flex shrink-0 items-center">{actions}</div>}
    </div>
  );
});

const ROW_TAG_CLASS = 'shrink-0 rounded border px-1 text-[9px] font-semibold uppercase leading-[14px] tracking-wide';

/** Tiny uppercase tag used inside rows (locale, Active, Default…). With
 *  `onClick` it is a small toggle button (a bilingual preset's locales);
 *  `label` names it for assistive tech and the tooltip. */
export function RowTag({
  children,
  accent,
  onClick,
  label,
  pressed,
}: {
  children: ReactNode;
  accent?: boolean;
  onClick?: () => void;
  label?: string;
  pressed?: boolean;
}) {
  const style = {
    borderColor: accent ? 'var(--brand)' : 'var(--rule)',
    color: accent ? 'var(--brand)' : 'var(--slate)',
  };
  if (!onClick) {
    return (
      <span className={ROW_TAG_CLASS} style={style} title={label} aria-label={label}>
        {children}
      </span>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      aria-pressed={pressed}
      title={label}
      className={cn(
        ROW_TAG_CLASS,
        'pointer-events-auto m-0 cursor-pointer bg-transparent font-[inherit]',
        'hover:border-(--brand-hover) hover:text-(--foreground)',
        'focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--brand-hover)',
      )}
      style={style}
    >
      {children}
    </button>
  );
}
