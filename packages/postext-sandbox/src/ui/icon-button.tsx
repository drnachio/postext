'use client';

import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';
import { Tooltip, type TooltipSide } from './tooltip';

export interface IconButtonProps extends Omit<ComponentProps<'button'>, 'children'> {
  /** Accessible name; also the tooltip text. */
  label: string;
  /** A sized lucide element: 14 in panel headers, 13 in rows, 11 inline. */
  icon: ReactNode;
  tooltipSide?: TooltipSide;
  /** Pressed/selected look (gilt icon on surface). */
  active?: boolean;
  destructive?: boolean;
  /** Former hit areas (18/24/28 px). Every icon button is now 44×44
   *  (WCAG 2.5.5, Target Size Enhanced); the prop stays for callers. */
  size?: 18 | 24 | 28 | 44;
  /** Set false to render without a tooltip (e.g. when a parent shows one). */
  tooltip?: boolean;
}

const SIZE = 'h-11 w-11';

/** The one icon button: a 44×44 hit area, slate at rest, foreground
 *  on hover, gilt when active, faded when disabled. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, tooltipSide = 'bottom', active, destructive, size: _size, tooltip = true, className, type = 'button', ...rest },
  ref,
) {
  const button = (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      aria-pressed={active}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded border-0 bg-transparent p-0 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand-hover)',
        'disabled:cursor-default disabled:opacity-50',
        'text-(--slate) enabled:hover:text-(--foreground) enabled:hover:bg-(--surface)',
        active && 'text-(--brand) bg-(--surface) enabled:hover:text-(--brand)',
        destructive && 'text-(--destructive) enabled:hover:text-(--destructive)',
        SIZE,
        className,
      )}
      {...rest}
    >
      <span aria-hidden="true" className="inline-flex items-center justify-center">{icon}</span>
    </button>
  );
  if (!tooltip) return button;
  return (
    <Tooltip content={label} side={tooltipSide}>
      {button}
    </Tooltip>
  );
});
