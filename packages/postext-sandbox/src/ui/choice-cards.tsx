'use client';

import type { KeyboardEvent, ReactNode } from 'react';
import { cn } from './cn';

export interface ChoiceCard<T extends string> {
  value: T;
  label: string;
  /** Small drawing of the choice (an inline SVG sized ~40×28). */
  picture: ReactNode;
  /** Plain-words explanation; becomes the option's description. */
  description?: string;
}

interface ChoiceCardsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly ChoiceCard<T>[];
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaLabel?: string;
  className?: string;
}

/** A row of picture cards for a choice that is easier to recognise than to
 *  read (column layouts, alignments). Radio-group semantics with roving
 *  focus: Tab enters on the selected card, arrow keys move and select. */
export function ChoiceCards<T extends string>({ value, onValueChange, options, ariaLabelledBy, ariaDescribedBy, ariaLabel, className }: ChoiceCardsProps<T>) {
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
    e.currentTarget.querySelectorAll<HTMLButtonElement>('[role="radio"]')[next]?.focus();
  };

  return (
    <div
      role="radiogroup"
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      onKeyDown={onKeyDown}
      className={cn('grid w-full gap-1.5', className)}
      style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}
    >
      {options.map((o) => {
        const selected = o.value === value;
        return (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-description={o.description}
            title={o.description}
            tabIndex={selected ? 0 : -1}
            onClick={() => { if (!selected) onValueChange(o.value); }}
            className={cn(
              'flex min-w-0 cursor-pointer flex-col items-center gap-1 rounded-md border px-1 pt-2 pb-1.5 transition-colors',
              'focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand)',
              selected
                ? 'border-(--brand) bg-(--brand-soft,var(--surface)) text-(--foreground)'
                : 'border-(--rule) text-(--slate) hover:border-(--rule-strong,var(--slate)) hover:text-(--foreground)',
            )}
          >
            <span aria-hidden="true" className={cn('flex h-7 items-center', selected ? 'text-(--brand)' : 'text-current')}>
              {o.picture}
            </span>
            <span className="w-full truncate text-center text-[0.66rem] leading-[1.3]">{o.label}</span>
          </button>
        );
      })}
    </div>
  );
}
