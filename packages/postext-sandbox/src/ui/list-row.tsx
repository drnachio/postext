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
        'group relative flex pt-large:min-h-11 items-center gap-1 rounded border px-2 py-1.5 pt-large:py-0.5 pt-large:pe-0.5 pt-large:ps-2 transition-colors',
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
            'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
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

const ROW_TAG_CLASS = 'shrink-0 rounded border px-1 text-[9px] pt-large:text-[11px] font-semibold pt-caps leading-[14px] tracking-wide';

/** Tiny uppercase tag used inside rows (locale, Active, Default…). With
 *  `onClick` it is a small toggle button (a bilingual preset's locales);
 *  `label` names it for assistive tech and the tooltip. A static tag is a
 *  plain span, which aria-label may not name: its label is hidden text,
 *  read in place of the short one (简 alone is a bare syllable). */
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
      <span className={ROW_TAG_CLASS} style={style} title={label}>
        {label ? (
          <>
            {/* The short form is an abbreviation expanded by its title
                (WCAG 3.1.4); assistive tech reads the label instead. */}
            <span aria-hidden="true"><abbr title={label} className="no-underline">{children}</abbr></span>
            <span className="sr-only normal-case">{label}</span>
          </>
        ) : children}
      </span>
    );
  }
  return (
    // A 24×24 target around the small tag (WCAG 2.5.8), 44×44 with large
    // targets on (2.5.5); the negative margins keep the row from growing.
    // Named by its visible text and then the label (WCAG 2.5.3: the name
    // holds what is seen), not by aria-label alone.
    <button
      type="button"
      onClick={onClick}
      aria-pressed={pressed}
      title={label}
      className={cn(
        'group/tag pointer-events-auto -my-1 inline-flex min-h-6 min-w-6 pt-large:-my-2.5 pt-large:h-11 pt-large:min-w-11 shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 font-[inherit]',
        'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
      )}
    >
      <span
        className={cn(ROW_TAG_CLASS, 'group-hover/tag:border-(--brand-hover) group-hover/tag:text-(--foreground)')}
        style={style}
      >
        {label ? <abbr title={label} className="no-underline">{children}</abbr> : children}
      </span>
      {label && <span className="sr-only">{`: ${label}`}</span>}
    </button>
  );
}
