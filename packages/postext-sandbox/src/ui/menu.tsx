'use client';

import type { ReactElement, ReactNode, Ref } from 'react';
import { Menu as MenuPrimitive } from '@base-ui/react/menu';
import { cn } from './cn';
import { usePortalContainer } from './portal';
import { POPUP_SURFACE, POPUP_Z_INDEX } from './surface';

interface MenuProps {
  /** The trigger element (a `Button` or `IconButton`); Base UI merges the
   *  trigger props into it. */
  trigger: ReactElement;
  side?: 'top' | 'right' | 'bottom' | 'left' | 'inline-start' | 'inline-end';
  align?: 'start' | 'center' | 'end';
  children: ReactNode;
  /** Controlled open state (uncontrolled when omitted). */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Content fixed above the items (a filter field): the items scroll
   *  under it. The popup is then a dialog holding the header and the list,
   *  and the list alone is the menu (a menu may own menu items only). */
  header?: ReactNode;
  /** With a header: the name of the list of items. */
  label?: string;
  /** Whether hovering an item highlights (and focuses) it. Off for a menu
   *  with a filter field, which keeps the focus while the pointer moves. */
  highlightItemOnHover?: boolean;
  popupRef?: Ref<HTMLDivElement>;
}

/** The popup's role: Base UI's `menu`, or a dialog when a header shares
 *  it with the list. */
export function menuPopupRole(header: boolean): { role?: 'dialog' } {
  return header ? { role: 'dialog' } : {};
}

/** What the popup holds: the items, or the header and the list of items,
 *  which is then the menu. */
export function MenuBody({ header, label, children }: { header?: ReactNode; label?: string; children: ReactNode }) {
  if (!header) return <>{children}</>;
  return (
    <>
      <div className="shrink-0">{header}</div>
      <div role="menu" aria-label={label} className="min-h-0 flex-1 overflow-y-auto" style={{ overscrollBehavior: 'contain' }}>{children}</div>
    </>
  );
}

/** Dropdown menu with keyboard navigation, portal rendering and anchor
 *  tracking. Compose `MenuItem`/`MenuSeparator` as children. The popup
 *  never runs past the viewport: a long menu (120 chapters) scrolls, and
 *  the highlighted item is scrolled into view as the keyboard moves. */
export function Menu({ trigger, side = 'bottom', align = 'end', children, open, onOpenChange, header, label, highlightItemOnHover, popupRef }: MenuProps) {
  const portalContainer = usePortalContainer();
  return (
    <MenuPrimitive.Root
      {...(open !== undefined ? { open } : {})}
      {...(onOpenChange ? { onOpenChange: (next: boolean) => onOpenChange(next) } : {})}
      {...(highlightItemOnHover !== undefined ? { highlightItemOnHover } : {})}
    >
      <MenuPrimitive.Trigger render={trigger} {...(header ? { 'aria-haspopup': 'dialog' as const } : {})} />
      <MenuPrimitive.Portal container={portalContainer}>
        <MenuPrimitive.Positioner
          side={side}
          align={align}
          sideOffset={4}
          collisionPadding={8}
          style={{ zIndex: POPUP_Z_INDEX }}
        >
          <MenuPrimitive.Popup
            ref={popupRef}
            {...menuPopupRole(!!header)}
            data-postext-popup=""
            style={{
              ...POPUP_SURFACE,
              padding: 4,
              minWidth: 160,
              maxHeight: 'var(--available-height)',
              ...(header
                ? { display: 'flex', flexDirection: 'column' }
                : { overflowY: 'auto', overscrollBehavior: 'contain' }),
            }}
          >
            <MenuBody header={header} label={label}>{children}</MenuBody>
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
  /** A group header that is itself an item (a part in the chapter menu,
   *  which opens the part's first chapter): set small and muted. */
  heading?: boolean;
  /** Tooltip (the full text of a truncated item). */
  title?: string;
  children: ReactNode;
}

export function MenuItem({ icon, onClick, disabled, destructive, selected, heading, title, children }: MenuItemProps) {
  return (
    <MenuPrimitive.Item
      onClick={onClick}
      disabled={disabled}
      aria-current={selected || undefined}
      title={title}
      className={(state) =>
        cn(
          'flex min-h-7 pt-large:min-h-11 cursor-pointer items-center gap-2 rounded px-2 text-xs outline-none select-none',
          heading ? 'pt-2 pb-1 text-[11px] tracking-wide' : 'py-1.5',
          'focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-(--brand)',
          state.highlighted && 'bg-(--background)',
          !state.disabled && 'hover:bg-(--background)',
          state.disabled && 'cursor-default opacity-50',
        )
      }
      style={{
        color: destructive ? 'var(--destructive)' : heading ? 'var(--slate)' : 'var(--foreground)',
        fontWeight: selected || heading ? 600 : 400,
      }}
    >
      {icon && <span aria-hidden="true" className="inline-flex shrink-0" style={{ color: destructive ? undefined : 'var(--slate)' }}>{icon}</span>}
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </MenuPrimitive.Item>
  );
}

export function MenuSeparator() {
  return <MenuPrimitive.Separator className="my-1 h-px" style={{ backgroundColor: 'var(--rule)' }} />;
}
