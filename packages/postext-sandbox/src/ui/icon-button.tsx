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
  /** Hit area in px. With large targets on, every icon button is 44×44
   *  (WCAG 2.5.5, Target Size Enhanced) whatever the size. */
  size?: 18 | 24 | 28 | 44;
  /** Set false to render without a tooltip (e.g. when a parent shows one). */
  tooltip?: boolean;
}

const SIZE: Record<NonNullable<IconButtonProps['size']>, string> = {
  18: 'h-[18px] w-[18px]',
  24: 'h-6 w-6',
  28: 'h-7 w-7',
  44: 'h-11 w-11',
};

/** The one icon button: 24px hit area by default (44×44 with large
 *  targets on), slate at rest, foreground
 *  on hover, gilt when active, faded when disabled. */
export const IconButton = forwardRef<HTMLButtonElement, IconButtonProps>(function IconButton(
  { label, icon, tooltipSide = 'bottom', active, destructive, size = 24, tooltip = true, className, type = 'button', ...rest },
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
        SIZE[size],
        'pt-large:h-11 pt-large:w-11',
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
