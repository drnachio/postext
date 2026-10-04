'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from './cn';
import { useUiRtl } from './direction';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Tooltip / accessible name when `label` is an icon. */
  title?: string;
  /** Not selectable (shown dimmed; the tooltip says why). */
  disabled?: boolean;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  ariaLabel: string;
  /** Name the group by a visible label instead of `ariaLabel`. */
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  /** `sm` for a discreet control in a toolbar band. */
  size?: 'md' | 'sm';
  /** Stretch to the container's width, options sharing it evenly. */
  fill?: boolean;
  className?: string;
}

/** One pill split into mutually exclusive choices: an outer border with
 *  rounded ends, a vertical rule between the options, and a solid fill on
 *  the selected one. Radio semantics; arrow keys move the selection. */
export function SegmentedControl<T extends string>({ value, onValueChange, options, ariaLabel, ariaLabelledBy, ariaDescribedBy, size = 'md', fill, className }: SegmentedControlProps<T>) {
  // The options run right to left in a right-to-left interface.
  const rtl = useUiRtl();
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    let next: number | null = null;
    if (e.key === (rtl ? 'ArrowLeft' : 'ArrowRight') || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === (rtl ? 'ArrowRight' : 'ArrowLeft') || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next === null) return;
    e.preventDefault();
    if (options[next]!.disabled) return;
    onValueChange(options[next]!.value);
    (e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next])?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      onKeyDown={onKeyDown}
      className={cn(
        'inline-flex items-stretch overflow-hidden rounded-full border',
        fill ? 'flex w-full' : 'shrink-0',
        size === 'sm' ? 'h-[1.3rem]' : 'h-7',
        'pt-large:h-11',
        className,
      )}
      style={{ borderColor: 'var(--pt-control-border)' }}
    >
      {options.map((o, i) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={o.title && typeof o.label !== 'string' ? o.title : undefined}
            title={o.title}
            tabIndex={selected ? 0 : -1}
            aria-disabled={o.disabled || undefined}
            onClick={() => { if (!selected && !o.disabled) onValueChange(o.value); }}
            className={cn(
              'inline-flex pt-large:min-w-11 cursor-pointer items-center justify-center gap-1 whitespace-nowrap transition-colors',
              fill && 'min-w-0 flex-1',
              size === 'sm' ? 'px-2 pt-large:px-2.5 text-[0.66rem]' : 'px-3 text-xs',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
              selected
                ? 'bg-(--brand-soft,var(--surface)) font-medium text-(--foreground)'
                : o.disabled
                  ? 'cursor-default bg-transparent text-(--slate) opacity-50'
                  : 'bg-transparent text-(--slate) hover:bg-(--surface) hover:text-(--foreground)',
            )}
            style={i > 0 ? { borderInlineStart: '1px solid var(--pt-control-border)' } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
