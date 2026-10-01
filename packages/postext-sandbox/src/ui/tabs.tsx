'use client';

import type { ReactNode } from 'react';
import { Tabs as TabsPrimitive } from '@base-ui/react/tabs';
import { cn } from './cn';

interface ChipTabsProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  ariaLabel: string;
  children: ReactNode;
  className?: string;
}

/** Horizontal chip-style tab strip with arrow-key roving (from Base UI). */
export function ChipTabs<T extends string>({ value, onValueChange, ariaLabel, children, className }: ChipTabsProps<T>) {
  return (
    <TabsPrimitive.Root value={value} onValueChange={(v) => onValueChange(v as T)}>
      <TabsPrimitive.List
        aria-label={ariaLabel}
        className={cn('flex flex-wrap items-center gap-1', className)}
      >
        {children}
      </TabsPrimitive.List>
    </TabsPrimitive.Root>
  );
}

interface ChipTabProps {
  value: string;
  children: ReactNode;
  /** Small gilt dot after the label (e.g. "has overrides"). */
  dot?: boolean;
  disabled?: boolean;
}

export function ChipTab({ value, children, dot, disabled }: ChipTabProps) {
  return (
    <TabsPrimitive.Tab
      value={value}
      disabled={disabled}
      className={(state) =>
        cn(
          'inline-flex h-11 min-w-11 cursor-pointer items-center justify-center gap-1 rounded-full border px-3 text-[11px] whitespace-nowrap transition-colors',
          'focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand-hover)',
          state.active
            ? 'border-(--pt-control-border) bg-(--surface) text-(--foreground)'
            : 'border-transparent text-(--slate) hover:text-(--foreground)',
          state.disabled && 'cursor-default opacity-40',
        )
      }
    >
      {children}
      {dot && <span aria-hidden="true" className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: 'var(--brand)' }} />}
    </TabsPrimitive.Tab>
  );
}
