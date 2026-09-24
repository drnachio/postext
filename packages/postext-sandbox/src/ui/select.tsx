'use client';

import type { ReactNode } from 'react';
import { Select as SelectPrimitive } from '@base-ui/react/select';
import { Check, ChevronsUpDown } from 'lucide-react';
import { cn } from './cn';
import { POPUP_SURFACE, POPUP_Z_INDEX } from './surface';

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  /** Second line in the list: what the choice does, in plain words. */
  description?: string;
  /** Small leading glyph (a sized lucide icon or an inline SVG). */
  icon?: ReactNode;
}

export interface SelectProps<T extends string> {
  value: T;
  onValueChange: (value: T) => void;
  options: readonly SelectOption<T>[];
  /** id of the visible label (the field row's label). */
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  /** Fallback accessible name when there is no visible label. */
  ariaLabel?: string;
  id?: string;
  /** The value equals the default: rendered in the muted colour. */
  muted?: boolean;
  disabled?: boolean;
  className?: string;
  size?: 'md' | 'sm';
}

/** Dropdown built on Base UI's Select (the primitive shadcn's `base-nova`
 *  style uses): keyboard typeahead, arrow keys, Home/End, proper listbox
 *  semantics, and options that can carry a one-line explanation. */
export function Select<T extends string>({
  value,
  onValueChange,
  options,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaLabel,
  id,
  muted,
  disabled,
  className,
  size = 'md',
}: SelectProps<T>) {
  const items = options.map((o) => ({ value: o.value, label: o.label }));
  const selected = options.find((o) => o.value === value);
  const hasDescriptions = options.some((o) => o.description);
  return (
    <SelectPrimitive.Root
      items={items}
      value={value}
      onValueChange={(v) => { if (v !== null) onValueChange(v as T); }}
      disabled={disabled}
      modal={false}
    >
      <SelectPrimitive.Trigger
        id={id}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        className={cn(
          'inline-flex min-w-0 cursor-pointer items-center justify-between gap-1.5 rounded-md border bg-(--surface) text-left transition-colors select-none',
          'border-(--rule) hover:border-(--rule-strong,var(--slate))',
          'focus-visible:outline-2 focus-visible:outline-offset-0 outline-(--brand)',
          'data-popup-open:border-(--brand) disabled:cursor-default disabled:opacity-50',
          size === 'sm' ? 'h-6 pr-1 pl-1.5 text-[0.66rem]' : 'h-7 pr-1.5 pl-2 text-xs',
          muted ? 'text-(--slate)' : 'text-(--foreground)',
          className,
        )}
      >
        <span className="flex min-w-0 items-center gap-1.5">
          {selected?.icon && <span aria-hidden="true" className="inline-flex shrink-0">{selected.icon}</span>}
          <SelectPrimitive.Value className="min-w-0 truncate" />
        </span>
        <SelectPrimitive.Icon className="inline-flex shrink-0 text-(--slate)">
          <ChevronsUpDown size={12} aria-hidden="true" />
        </SelectPrimitive.Icon>
      </SelectPrimitive.Trigger>
      <SelectPrimitive.Portal>
        <SelectPrimitive.Positioner
          sideOffset={4}
          alignItemWithTrigger={!hasDescriptions}
          collisionPadding={8}
          style={{ zIndex: POPUP_Z_INDEX, outline: 'none' }}
        >
          <SelectPrimitive.Popup
            data-postext-popup=""
            className="min-w-(--anchor-width) overflow-hidden"
            style={{ ...POPUP_SURFACE, padding: 0, maxWidth: hasDescriptions ? 300 : 260 }}
          >
            <SelectPrimitive.List className="max-h-(--available-height) overflow-y-auto p-1 outline-none">
              {options.map((o) => (
                <SelectPrimitive.Item
                  key={o.value}
                  value={o.value}
                  className={cn(
                    'grid cursor-default grid-cols-[14px_1fr] items-start gap-x-1.5 rounded px-1.5 py-1 outline-none select-none',
                    'data-highlighted:bg-(--surface-2,var(--background))',
                  )}
                >
                  <SelectPrimitive.ItemIndicator className="col-start-1 mt-[2px] text-(--brand)">
                    <Check size={12} aria-hidden="true" />
                  </SelectPrimitive.ItemIndicator>
                  <span className="col-start-2 flex min-w-0 flex-col">
                    <span className="flex items-center gap-1.5 text-xs">
                      {o.icon && <span aria-hidden="true" className="inline-flex shrink-0">{o.icon}</span>}
                      <SelectPrimitive.ItemText>{o.label}</SelectPrimitive.ItemText>
                    </span>
                    {o.description && (
                      <span className="text-[0.66rem] leading-[1.35] text-(--slate)">{o.description}</span>
                    )}
                  </span>
                </SelectPrimitive.Item>
              ))}
            </SelectPrimitive.List>
          </SelectPrimitive.Popup>
        </SelectPrimitive.Positioner>
      </SelectPrimitive.Portal>
    </SelectPrimitive.Root>
  );
}
