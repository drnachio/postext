'use client';

import { useRef, useState } from 'react';
import type { Dimension, DimensionUnit } from 'postext';
import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';
import { NumberPopover } from './NumberPopover';

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
  const handleValueChange = (v: number) => {
    onChange({ value: v, unit: value.unit });
  };

  const handleUnitChange = (unit: DimensionUnit) => {
    const converted = convert(value.value, value.unit, unit);
    onChange({ value: converted, unit });
  };

  const chars = Math.max(String(value.value).length, 2);
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

  const sliderMax = max ?? MAX_BY_UNIT[value.unit];

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
          value={value.value}
          onChange={(e) => handleValueChange(Number(e.target.value))}
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
        <select
          value={value.unit}
          onChange={(e) => handleUnitChange(e.target.value as DimensionUnit)}
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
      </div>
      {popoverOpen && anchorRect && (
        <NumberPopover
          ref={popoverRef}
          value={value.value}
          onChange={handleValueChange}
          anchorRect={anchorRect}
          onClose={() => setPopoverOpen(false)}
          min={min}
          max={sliderMax}
          step={step}
          label={`${label} (${value.unit})`}
        />
      )}
    </div>
  );
}
