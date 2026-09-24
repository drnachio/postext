'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
  /** Tooltip / accessible name when `label` is an icon. */
  title?: string;
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
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const idx = options.findIndex((o) => o.value === value);
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = (idx + 1) % options.length;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = (idx - 1 + options.length) % options.length;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = options.length - 1;
    if (next === null) return;
    e.preventDefault();
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
        className,
      )}
      style={{ borderColor: 'var(--rule)' }}
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
            onClick={() => { if (!selected) onValueChange(o.value); }}
            className={cn(
              'inline-flex cursor-pointer items-center justify-center gap-1 whitespace-nowrap transition-colors',
              fill && 'min-w-0 flex-1',
              size === 'sm' ? 'px-2 text-[0.62rem]' : 'px-3 text-xs',
              'focus-visible:outline-2 focus-visible:-outline-offset-2 outline-(--brand)',
              selected
                ? 'bg-(--brand-soft,var(--surface)) font-medium text-(--foreground)'
                : 'bg-transparent text-(--slate) hover:bg-(--surface) hover:text-(--foreground)',
            )}
            style={i > 0 ? { borderLeft: '1px solid var(--rule)' } : undefined}
          >
            {o.label}
          </button>
        );
      })}
    </div>
  );
}
