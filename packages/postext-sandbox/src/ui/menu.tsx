'use client';

import type { ReactElement, ReactNode } from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from './cn';
import { POPUP_SURFACE, POPUP_Z_INDEX } from './surface';

interface MenuProps {
  /** The trigger element (a `Button` or `IconButton`); Base UI merges the
   *  trigger props into it. */
  trigger: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left';
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
}

/** Dropdown menu with keyboard navigation, portal rendering and anchor
 *  tracking. Compose `MenuItem`/`MenuSeparator` as children. */
export function Menu({ trigger, side = 'bottom', align = 'end', children }: MenuProps) {
  return (
    <MenuPrimitive.Root>
      <MenuPrimitive.Trigger render={trigger} />
      <MenuPrimitive.Portal>
        <MenuPrimitive.Positioner
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          style={{ zIndex: POPUP_Z_INDEX }}
        >
          <MenuPrimitive.Popup
            data-postext-popup=""
            style={{ ...POPUP_SURFACE, padding: 4, minWidth: 160 }}
          >
            {children}
          </MenuPrimitive.Popup>
        </MenuPrimitive.Positioner>
      </MenuPrimitive.Portal>
    </MenuPrimitive.Root>
  );
}

interface MenuItemProps {
  icon?: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  /** Marks the current choice (e.g. the active chapter). */
  selected?: boolean;
  children: ReactNode;
}

export function MenuItem({ icon, onClick, disabled, destructive, selected, children }: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      onClick={onClick}
      disabled={disabled}
      aria-current={selected || undefined}
      className={(state) =>
        cn(
          'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-xs outline-none select-none',
          state.highlighted && 'bg-(--background)',
          state.disabled && 'cursor-default opacity-40',
        )
      }
      style={{ color: destructive ? 'var(--destructive)' : 'var(--foreground)', fontWeight: selected ? 600 : 400 }}
    >
      {icon && <span aria-hidden="true" className="inline-flex shrink-0" style={{ color: destructive ? undefined : 'var(--slate)' }}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </MenuPrimitive.Item>
  );
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px" style={{ backgroundColor: 'var(--rule)' }} />;
}
