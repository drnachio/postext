'use client';

import { useRef, useState } from 'react';
import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';
import { NumberPopover } from './NumberPopover';

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
  const chars = Math.max(String(value).length, 2);
  const muted = isDefault ?? false;
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [anchorRect, setAnchorRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);

  const openPopover = () => {
    if (inputRef.current) {
      setAnchorRect(inputRef.current.getBoundingClientRect());
    }
    setPopoverOpen(true);
  };

  const handleBlur = (e: React.FocusEvent) => {
    const related = e.relatedTarget as Node | null;
    if (related && popoverRef.current?.contains(related)) return;
    setPopoverOpen(false);
  };

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex min-w-0 flex-1 items-center gap-1">
        {tooltip && <InfoTip text={tooltip} />}
        <label className="text-xs" title={label} style={{ color: 'var(--slate)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>
          {label}
        </label>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!muted && onReset && <ResetButton onClick={onReset} />}
        <input
          ref={inputRef}
          type="number"
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          onFocus={openPopover}
          onBlur={handleBlur}
          min={min}
          max={max}
          step={step}
          className="hide-spinners rounded border px-2 py-1 text-xs text-right"
          style={{
            width: `${chars + 2.2}ch`,
            borderColor: 'var(--rule)',
            backgroundColor: 'var(--surface)',
            color: muted ? 'var(--slate)' : 'var(--foreground)',
            MozAppearance: 'textfield',
          }}
        />
        {suffix && (
          <span className="text-xs" style={{ color: muted ? 'var(--slate)' : 'var(--foreground)' }}>
            {suffix}
          </span>
        )}
      </div>
      {popoverOpen && anchorRect && (
        <NumberPopover
          ref={popoverRef}
          value={value}
          onChange={onChange}
          anchorRect={anchorRect}
          onClose={() => setPopoverOpen(false)}
          min={min}
          max={max}
          step={step}
          label={label}
        />
      )}
    </div>
  );
}
