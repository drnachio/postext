'use client';

import { useState, useRef, useEffect, useCallback, type ReactNode } from 'react';
import { Check, X } from 'lucide-react';

interface ConfirmPopoverProps {
  message: ReactNode;
  onConfirm: () => void;
  children: (props: { open: () => void }) => ReactNode;
}

export function ConfirmPopover({ message, onConfirm, children }: ConfirmPopoverProps) {
  const [visible, setVisible] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number; arrowLeft: number }>({ top: 0, left: 0, arrowLeft: 0 });
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const open = useCallback(() => setVisible(true), []);
  const close = useCallback(() => setVisible(false), []);

  const confirm = useCallback(() => {
    onConfirm();
    setVisible(false);
  }, [onConfirm]);

  // Position the popover below the trigger
  useEffect(() => {
    if (!visible || !triggerRef.current || !popoverRef.current) return;

    const trigger = triggerRef.current.getBoundingClientRect();
    const popover = popoverRef.current.getBoundingClientRect();
    const gap = 10;

    let top = trigger.bottom + gap;
    let left = trigger.left + trigger.width / 2 - popover.width / 2;

    // Keep within viewport
    const padding = 8;
    if (left < padding) left = padding;
    if (left + popover.width > window.innerWidth - padding) {
      left = window.innerWidth - padding - popover.width;
    }
    if (top + popover.height > window.innerHeight - padding) {
      top = trigger.top - popover.height - gap;
    }

    setPosition({ top, left, arrowLeft: trigger.left + trigger.width / 2 - left });
  }, [visible]);

  // Close on click outside
  useEffect(() => {
    if (!visible) return;
    const handleClick = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node) &&
          triggerRef.current && !triggerRef.current.contains(e.target as Node)) {
        close();
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [visible, close]);

  return (
    <>
      <div ref={triggerRef} className="contents">
        {children({ open })}
      </div>
      {visible && (
        <div
          ref={popoverRef}
          role="dialog"
          aria-modal="false"
          className="fixed z-50"
          style={{
            top: `${position.top}px`,
            left: `${position.left}px`,
          }}
        >
          {/* Arrow */}
          <div
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: -5,
              left: `${position.arrowLeft}px`,
              transform: 'translateX(-50%)',
              width: 10,
              height: 10,
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--rule)',
              borderRight: 'none',
              borderBottom: 'none',
              rotate: '45deg',
            }}
          />
          {/* Body */}
          <div
            className="rounded-md"
            style={{
              backgroundColor: 'var(--surface)',
              border: '1px solid var(--rule)',
              padding: '8px 10px',
              minWidth: 160,
              maxWidth: 240,
            }}
          >
            <div
              style={{
                color: 'var(--foreground)',
                fontSize: 12,
                lineHeight: '16px',
                margin: 0,
                marginBottom: 8,
              }}
            >
              {message}
            </div>
            <div className="flex items-center justify-end gap-1.5">
              <button
                type="button"
                onClick={close}
                className="flex items-center justify-center rounded transition-colors"
                style={{
                  color: 'var(--slate)',
                  width: 24,
                  height: 24,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
                aria-label="Cancel"
              >
                <X size={14} aria-hidden="true" />
              </button>
              <button
                type="button"
                onClick={confirm}
                className="flex items-center justify-center rounded transition-colors"
                style={{
                  color: 'var(--gilt)',
                  width: 24,
                  height: 24,
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
                onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--gilt)')}
                aria-label="Confirm"
              >
                <Check size={14} aria-hidden="true" />
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
