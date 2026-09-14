'use client';

import type { CSSProperties, ReactNode, Ref, RefObject } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { POPUP_SURFACE, POPUP_Z_INDEX } from './surface';

export type PopoverSide = 'top' | 'right' | 'bottom' | 'left';
export type PopoverAlign = 'start' | 'center' | 'end';
export type PopoverCloseReason = PopoverPrimitive.Root.ChangeEventReason;

export interface PopoverProps {
  open: boolean;
  /** `reason` and `event` let a caller ignore an outside press on its own
   *  trigger (e.g. the input that opened the popover on focus). */
  onOpenChange: (open: boolean, reason: PopoverCloseReason, event: Event | undefined) => void;
  /** Element (or ref) the popup is positioned against. */
  anchor: RefObject<Element | null> | Element | null;
  side?: PopoverSide;
  align?: PopoverAlign;
  sideOffset?: number;
  initialFocus?: boolean | RefObject<HTMLElement | null>;
  finalFocus?: boolean | RefObject<HTMLElement | null>;
  width?: number;
  ariaLabel: string;
  popupRef?: Ref<HTMLDivElement>;
  /** Extra inline style for the popup body (padding defaults to 10). */
  style?: CSSProperties;
  children: ReactNode;
}

/** Controlled, non-modal popover anchored to an arbitrary element. Renders
 *  in a portal and tracks the anchor through scroll and resize; flips to
 *  the opposite side, then to the other axis, when space runs out. */
export function Popover({
  open,
  onOpenChange,
  anchor,
  side = 'right',
  align = 'start',
  sideOffset = 8,
  initialFocus,
  finalFocus,
  width,
  ariaLabel,
  popupRef,
  style,
  children,
}: PopoverProps) {
  return (
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next, details) => onOpenChange(next, details.reason, details.event)}
      modal={false}
    >
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Positioner
          anchor={anchor}
          side={side}
          align={align}
          sideOffset={sideOffset}
          collisionPadding={8}
          collisionAvoidance={{ side: 'flip', align: 'shift', fallbackAxisSide: 'end' }}
          style={{ zIndex: POPUP_Z_INDEX }}
        >
          <PopoverPrimitive.Popup
            ref={popupRef}
            data-postext-popup=""
            aria-label={ariaLabel}
            initialFocus={initialFocus}
            finalFocus={finalFocus}
            style={{
              ...POPUP_SURFACE,
              width,
              maxHeight: 'var(--available-height)',
              overflowY: 'auto',
              padding: 10,
              ...style,
            }}
          >
            {children}
          </PopoverPrimitive.Popup>
        </PopoverPrimitive.Positioner>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
