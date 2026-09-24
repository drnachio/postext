'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from './cn';

export interface SegmentedOption<T extends string> {
  value: T;
  label: ReactNode;
}

interface SegmentedControlProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SegmentedOption<T>[];
  ariaLabel: string;
  className?: string;
}

/** One pill split into mutually exclusive choices: an outer border with
 *  rounded ends, a vertical rule between the options, and a solid fill on
 *  the selected one. Radio semantics; arrow keys move the selection. */
export function SegmentedControl<T extends string>({ value, onValueChange, options, ariaLabel, className }: SegmentedControlProps<T>) {
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
      aria-label={ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('inline-flex h-7 shrink-0 items-stretch overflow-hidden rounded-full border', className)}
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
            tabIndex={selected ? 0 : -1}
            onClick={() => { if (!selected) onValueChange(o.value); }}
            className={cn(
              'cursor-pointer px-3 text-xs whitespace-nowrap transition-colors',
              'focus-visible:outline-1 focus-visible:-outline-offset-2 outline-(--brand-hover)',
              selected
                ? 'bg-(--surface) font-medium text-(--foreground)'
                : 'bg-transparent text-(--slate) hover:text-(--foreground)',
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
