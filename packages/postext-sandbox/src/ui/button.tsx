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
    'border border-(--rule) bg-(--surface) text-(--foreground) enabled:hover:border-(--slate)',
  ghost:
    'border border-transparent bg-transparent text-(--slate) enabled:hover:text-(--foreground) enabled:hover:bg-(--surface)',
  primary:
    'border border-(--gilt) bg-transparent text-(--gilt) enabled:hover:bg-(--surface)',
};

const SIZE: Record<ButtonSize, string> = {
  xs: 'h-6 px-2 text-xs gap-1',
  sm: 'h-7 px-2.5 text-xs gap-1.5',
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
        'focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--gilt-hover)',
        'disabled:cursor-default disabled:opacity-40',
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
