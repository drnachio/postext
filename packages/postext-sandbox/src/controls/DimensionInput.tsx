'use client';

import { useCallback, useRef, useState } from 'react';
import type { Dimension, DimensionUnit } from 'postext';
import { FieldRow } from './FieldRow';
import { NumberPopover } from './NumberPopover';
import { useDebouncedCommit } from './useDebouncedCommit';
import type { PopoverCloseReason } from '../ui';

interface DimensionInputProps {
  label: string;
  value: Dimension;
  onChange: (dimension: Dimension) => void;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  units?: DimensionUnit[];
}

const DEFAULT_UNITS: DimensionUnit[] = ['cm', 'mm', 'in', 'pt'];

const TO_PT: Record<DimensionUnit, number> = {
  pt: 1,
  mm: 2.83465,
  cm: 28.3465,
  in: 72,
  px: 0.75,
  em: 12,
  rem: 12,
};

function convert(val: number, from: DimensionUnit, to: DimensionUnit): number {
  const pts = val * TO_PT[from];
  return Math.round((pts / TO_PT[to]) * 100) / 100;
}

// Sensible max ranges per unit for the slider
const MAX_BY_UNIT: Record<DimensionUnit, number> = {
  cm: 100,
  mm: 1000,
  in: 40,
  pt: 2880,
  px: 3840,
  em: 10,
  rem: 10,
};

export function DimensionInput({ label, value, onChange, min = 0, max, step = 0.1, tooltip, isDefault, onReset, units = DEFAULT_UNITS }: DimensionInputProps) {
  const unitRef = useRef(value.unit);
  unitRef.current = value.unit;
  // Callback used by the slider popover — commits a new value in the
  // currently-selected unit. Stable so `useDebouncedCommit` inside the
  // popover doesn't see a new onChange every render.
  const commitNumber = useCallback((v: number) => {
    onChange({ value: v, unit: unitRef.current });
  }, [onChange]);
  // Same path for typing in the number field, but debounced.
  const [typedValue, commitTyped, flushTyped] = useDebouncedCommit(value.value, commitNumber);

  const handleUnitChange = (unit: DimensionUnit) => {
    flushTyped();
    const converted = convert(value.value, value.unit, unit);
    onChange({ value: converted, unit });
  };

  const chars = Math.max(String(typedValue).length, 2);
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
    if (!next && reason === 'outside-press' && event && inputRef.current?.contains(event.target as Node)) return;
    setPopoverOpen(next);
  };

  const sliderMax = max ?? MAX_BY_UNIT[value.unit];

  return (
    <FieldRow ref={rowRef} label={label} tooltip={tooltip} isDefault={muted} onReset={onReset} extraTerms={units}>
      <input
        ref={inputRef}
        type="number"
        value={typedValue}
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
      <select
        value={value.unit}
        onChange={(e) => handleUnitChange(e.target.value as DimensionUnit)}
        aria-label={`${label} unit`}
        className="rounded border px-1 py-1 text-xs"
        style={{
          width: '3rem',
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: muted ? 'var(--slate)' : 'var(--foreground)',
        }}
      >
        {units.map((u) => (
          <option key={u} value={u}>{u}</option>
        ))}
      </select>
      <NumberPopover
        open={popoverOpen}
        onOpenChange={handleOpenChange}
        anchor={rowRef}
        popupRef={popupRef}
        value={value.value}
        onChange={commitNumber}
        min={min}
        max={sliderMax}
        step={step}
        label={`${label} (${value.unit})`}
      />
    </FieldRow>
  );
}
