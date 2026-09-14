'use client';

import type { ReactElement, ReactNode } from 'react';
import { Tooltip as TooltipPrimitive } from '@base-ui/react/tooltip';
import { POPUP_SURFACE, TOOLTIP_Z_INDEX } from './surface';

export type TooltipSide = 'top' | 'right' | 'bottom' | 'left';

/** Mount once near the sandbox root: shares the open delay across every
 *  tooltip and lets adjacent tooltips open instantly once one is showing. */
export function TooltipProvider({ children }: { children: ReactNode }) {
  return (
    <TooltipPrimitive.Provider delay={400} closeDelay={0}>
      {children}
    </TooltipPrimitive.Provider>
  );
}

interface TooltipProps {
  content: string;
  side?: TooltipSide;
  /** A single element that accepts a ref and event handlers (button, span,
   *  a…). Base UI merges its trigger props into it. */
  children: ReactElement;
}

/** Positioned by Base UI (floating-ui): follows the trigger through scroll
 *  and resize, flips when it would leave the viewport. */
export function Tooltip({ content, side = 'top', children }: TooltipProps) {
  return (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger render={children} />
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Positioner
          side={side}
          sideOffset={6}
          collisionPadding={8}
          style={{ zIndex: TOOLTIP_Z_INDEX }}
        >
          <TooltipPrimitive.Popup
            data-postext-popup=""
            style={{
              ...POPUP_SURFACE,
              border: '1px solid color-mix(in srgb, var(--gilt) 50%, transparent)',
              borderRadius: 6,
              boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)',
              padding: '4px 8px',
              maxWidth: 208,
              pointerEvents: 'none',
            }}
          >
            {content}
          </TooltipPrimitive.Popup>
        </TooltipPrimitive.Positioner>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
