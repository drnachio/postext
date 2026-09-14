'use client';

import { useCallback, useRef, useState, type ReactNode, type SyntheticEvent } from 'react';
import { Popover as PopoverPrimitive } from '@base-ui/react/popover';
import { useSandboxLabels } from '../context/SandboxContext';
import { POPUP_SURFACE, POPUP_Z_INDEX } from './surface';
import { Button } from './button';

/** Argument accepted by `open`: the click event of the trigger (its
 *  `currentTarget` becomes the anchor) or an explicit element. */
export type ConfirmOpenArg = SyntheticEvent<Element> | Element | null | undefined;

interface ConfirmPopoverProps {
  message: ReactNode;
  onConfirm: () => void;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Render prop: call `open(e)` from the trigger's click handler. */
  children: (props: { open: (e?: ConfirmOpenArg) => void }) => ReactNode;
}

/** Small inline confirmation anchored to the button that opened it. Tracks
 *  the anchor through scroll; Escape and outside press cancel. */
export function ConfirmPopover({ message, onConfirm, confirmLabel, cancelLabel, children }: ConfirmPopoverProps) {
  const labels = useSandboxLabels();
  const [visible, setVisible] = useState(false);
  const wrapperRef = useRef<HTMLSpanElement>(null);
  const anchorRef = useRef<Element | null>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  const open = useCallback((e?: ConfirmOpenArg) => {
    let el: Element | null = null;
    if (e && typeof e === 'object' && 'currentTarget' in e) el = e.currentTarget as Element;
    else if (e instanceof Element) el = e;
    anchorRef.current = el ?? wrapperRef.current?.firstElementChild ?? wrapperRef.current;
    setVisible(true);
  }, []);
  const close = useCallback(() => setVisible(false), []);
  const confirm = useCallback(() => {
    onConfirm();
    setVisible(false);
  }, [onConfirm]);

  return (
    <>
      <span ref={wrapperRef} className="contents">
        {children({ open })}
      </span>
      <PopoverPrimitive.Root open={visible} onOpenChange={(next) => { if (!next) close(); }} modal={false}>
        <PopoverPrimitive.Portal>
          <PopoverPrimitive.Positioner
            anchor={anchorRef}
            side="bottom"
            align="end"
            sideOffset={6}
            collisionPadding={8}
            collisionAvoidance={{ side: 'flip', align: 'shift', fallbackAxisSide: 'end' }}
            style={{ zIndex: POPUP_Z_INDEX }}
          >
            <PopoverPrimitive.Popup
              data-postext-popup=""
              initialFocus={confirmRef}
              style={{ ...POPUP_SURFACE, padding: '8px 10px', minWidth: 180, maxWidth: 260 }}
            >
              <div style={{ marginBottom: 8 }}>{message}</div>
              <div className="flex items-center justify-end gap-1.5">
                <Button variant="ghost" size="xs" onClick={close}>
                  {cancelLabel ?? labels.cancel}
                </Button>
                <Button ref={confirmRef} variant="primary" size="xs" onClick={confirm}>
                  {confirmLabel ?? labels.confirm}
                </Button>
              </div>
            </PopoverPrimitive.Popup>
          </PopoverPrimitive.Positioner>
        </PopoverPrimitive.Portal>
      </PopoverPrimitive.Root>
    </>
  );
}
