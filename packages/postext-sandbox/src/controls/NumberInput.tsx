'use client';

import { useRef, useState } from 'react';
import { FieldRow } from './FieldRow';
import { NumberPopover } from './NumberPopover';
import { useDebouncedCommit } from './useDebouncedCommit';
import type { PopoverCloseReason } from '../ui';

interface NumberInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  suffix?: string;
}

export function NumberInput({ label, value, onChange, min = 0, max = 100, step = 1, tooltip, isDefault, onReset, suffix }: NumberInputProps) {
  // Typing into the field updates `typed` immediately but only commits
  // upstream after a short quiet window.
  const [typed, commitTyped, flushTyped] = useDebouncedCommit(value, onChange);
  const chars = Math.max(String(typed).length, 2);
  const muted = isDefault ?? false;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  const handleBlur = (e: React.FocusEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && popupRef.current?.contains(related)) return;
    flushTyped();
    setPopoverOpen(false);
  };

  const handleOpenChange = (next: boolean, reason: PopoverCloseReason, event: Event | undefined) => {
    // Clicking back into the input that opened the slider is not "outside".
    if (!next && reason === 'outside-press' && event && inputRef.current?.contains(event.target as Node)) return;
    setPopoverOpen(next);
  };

  return (
    <FieldRow ref={rowRef} label={label} tooltip={tooltip} isDefault={muted} onReset={onReset} extraTerms={suffix ? [suffix] : undefined}>
      <input
        ref={inputRef}
        type="number"
        value={typed}
        onChange={(e) => commitTyped(Number(e.target.value))}
        onFocus={() => setPopoverOpen(true)}
        onBlur={handleBlur}
        min={min}
        max={max}
        step={step}
        aria-label={label}
        className="postext-hide-spinners rounded border px-2 py-1 text-xs text-right"
        style={{
          width: `${chars + 2.2}ch`,
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: muted ? 'var(--slate)' : 'var(--foreground)',
        }}
      />
      {suffix && (
        <span className="text-xs" style={{ color: muted ? 'var(--slate)' : 'var(--foreground)' }}>
          {suffix}
        </span>
      )}
      <NumberPopover
        open={popoverOpen}
        onOpenChange={handleOpenChange}
        anchor={rowRef}
        popupRef={popupRef}
        value={value}
        onChange={onChange}
        min={min}
        max={max}
        step={step}
        label={label}
      />
    </FieldRow>
  );
}
