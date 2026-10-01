'use client';

import { forwardRef, type ComponentProps, type ReactNode } from 'react';
import { cn } from './cn';

export type ButtonVariant = 'outline' | 'ghost' | 'primary';
export type ButtonSize = 'xs' | 'sm';

export interface ButtonProps extends ComponentProps<'button'> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  /** Leading icon (pass a sized lucide element, 12–13px). */
  icon?: ReactNode;
  /** Trailing icon, e.g. a chevron for menu triggers. */
  trailingIcon?: ReactNode;
}

const VARIANT: Record<ButtonVariant, string> = {
  outline:
    'border border-(--pt-control-border) bg-(--surface) text-(--foreground) enabled:hover:border-(--slate)',
  ghost:
    'border border-transparent bg-transparent text-(--slate) enabled:hover:text-(--foreground) enabled:hover:bg-(--surface)',
  primary:
    'border border-(--brand) bg-transparent text-(--brand) enabled:hover:bg-(--surface)',
};

// Pixel units on purpose: the host page scales its root font size with the
// display (18–30px), and rem-based sizes would grow the buttons with it —
// the sandbox chrome, and the popups it portals out of its root, keep a
// fixed 11–12px scale like every other primitive here.
// Both sizes are 44px tall (WCAG 2.5.5, Target Size Enhanced); `xs`
// keeps the smaller type.
const SIZE: Record<ButtonSize, string> = {
  xs: 'min-h-[44px] min-w-[44px] px-[12px] text-[11px] leading-[16px] gap-[6px]',
  sm: 'min-h-[44px] min-w-[44px] px-[14px] text-[12px] leading-[16px] gap-[6px]',
};

/** Text button with the sandbox's three looks. Hover and disabled states
 *  are CSS-driven, so no JS colour swapping is needed. */
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(function Button(
  { variant = 'outline', size = 'xs', icon, trailingIcon, className, children, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center justify-center rounded font-medium whitespace-nowrap transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-1 outline-(--brand-hover)',
        'disabled:cursor-default disabled:opacity-50',
        VARIANT[variant],
        SIZE[size],
        className,
      )}
      {...rest}
    >
      {icon && <span aria-hidden="true" className="inline-flex shrink-0">{icon}</span>}
      {children}
      {trailingIcon && <span aria-hidden="true" className="inline-flex shrink-0">{trailingIcon}</span>}
    </button>
  );
});
