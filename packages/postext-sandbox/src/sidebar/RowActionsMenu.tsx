'use client';

import { MoreHorizontal } from 'lucide-react';
import { useRef, type ReactNode } from 'react';
import { ConfirmPopover, IconButton, Menu } from '../ui';

/** The "⋯" button of a book row: every action with its name, instead of a
 *  strip of unlabelled icons. An item that needs confirming (delete,
 *  restore the original) asks next to the ⋯ button once the menu closes. */
export function RowActionsMenu({
  label,
  disabled,
  confirmMessage,
  onConfirm,
  children,
}: {
  label: string;
  disabled?: boolean;
  confirmMessage: ReactNode;
  onConfirm: () => void;
  children: (askConfirm: () => void) => ReactNode;
}) {
  const triggerRef = useRef<HTMLButtonElement>(null);
  return (
    <ConfirmPopover message={confirmMessage} onConfirm={onConfirm}>
      {({ open }) => (
        <Menu trigger={<IconButton ref={triggerRef} size={24} label={label} icon={<MoreHorizontal size={14} />} disabled={disabled} tooltip={false} />}>
          {children(() => open(triggerRef.current))}
        </Menu>
      )}
    </ConfirmPopover>
  );
}
