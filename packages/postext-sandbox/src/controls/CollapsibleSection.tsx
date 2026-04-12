'use client';

import { useState, useRef, useEffect, type ReactNode } from 'react';
import { ChevronRight, RotateCcw } from 'lucide-react';
import { saveSectionState, loadSectionState } from '../storage/persistence';
import { Tooltip } from '../panels/Tooltip';
import { ConfirmPopover } from '../panels/ConfirmPopover';

interface CollapsibleSectionProps {
  title: string;
  sectionId?: string;
  defaultOpen?: boolean;
  children: ReactNode;
  onReset?: () => void;
  hasOverrides?: boolean;
  resetLabel?: string;
  resetConfirmMessage?: string;
}

export function CollapsibleSection({
  title,
  sectionId,
  defaultOpen = false,
  children,
  onReset,
  hasOverrides = false,
  resetLabel = 'Reset section',
  resetConfirmMessage = 'Reset this section to defaults?',
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(() => {
    if (sectionId) {
      const saved = loadSectionState(sectionId);
      if (saved !== null) return saved;
    }
    return defaultOpen;
  });
  const bodyRef = useRef<HTMLDivElement>(null);
  const [maxHeight, setMaxHeight] = useState<string>(open ? 'none' : '0px');

  useEffect(() => {
    if (open) {
      const el = bodyRef.current;
      if (el) {
        setMaxHeight(`${el.scrollHeight}px`);
        const timer = setTimeout(() => setMaxHeight('none'), 300);
        return () => clearTimeout(timer);
      }
    } else {
      const el = bodyRef.current;
      if (el) {
        setMaxHeight(`${el.scrollHeight}px`);
        requestAnimationFrame(() => {
          requestAnimationFrame(() => setMaxHeight('0px'));
        });
      }
    }
  }, [open]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (sectionId) {
      saveSectionState(sectionId, next);
    }
  };

  return (
    <div>
      <div
        className="flex w-full items-center border-b"
        style={{ borderColor: 'var(--rule)' }}
      >
        <button
          type="button"
          aria-expanded={open}
          onClick={toggle}
          className="flex flex-1 items-center justify-between px-3 py-2 text-xs font-semibold uppercase tracking-wider transition-colors"
          style={{ color: 'var(--gilt)', cursor: 'pointer', border: 'none', background: 'none' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
          onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--gilt)')}
        >
          {title}
          <ChevronRight
            size={14}
            aria-hidden="true"
            style={{
              transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 200ms ease',
            }}
          />
        </button>
        {hasOverrides && onReset && (
          <ConfirmPopover message={resetConfirmMessage} onConfirm={onReset}>
            {({ open: openConfirm }) => (
              <Tooltip content={resetLabel} side="bottom">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openConfirm();
                  }}
                  aria-label={resetLabel}
                  className="flex items-center justify-center rounded transition-colors"
                  style={{
                    color: 'var(--slate)',
                    width: 24,
                    height: 24,
                    marginRight: 8,
                    cursor: 'pointer',
                    border: 'none',
                    background: 'none',
                    flexShrink: 0,
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.color = 'var(--foreground)')}
                  onMouseLeave={(e) => (e.currentTarget.style.color = 'var(--slate)')}
                >
                  <RotateCcw size={12} aria-hidden="true" />
                </button>
              </Tooltip>
            )}
          </ConfirmPopover>
        )}
      </div>
      <div
        ref={bodyRef}
        style={{
          maxHeight,
          overflow: 'hidden',
          transition: maxHeight === 'none' ? undefined : 'max-height 300ms ease',
        }}
      >
        <div className="px-3 py-2">
          {children}
        </div>
      </div>
    </div>
  );
}
