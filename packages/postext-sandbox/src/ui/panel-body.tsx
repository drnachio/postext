'use client';

import { forwardRef, type ComponentProps } from 'react';
import { cn } from './cn';

interface PanelBodyProps extends ComponentProps<'div'> {
  /** `px-3 py-3` around the content (lists that draw their own rows leave it off). */
  padded?: boolean;
}

/** The scrolling area below a `PanelHeader`. */
export const PanelBody = forwardRef<HTMLDivElement, PanelBodyProps>(function PanelBody(
  { padded, className, ...rest },
  ref,
) {
  return (
    <div
      ref={ref}
      className={cn('min-h-0 flex-1 overflow-y-auto', padded && 'px-3 py-3', className)}
      {...rest}
    />
  );
});
