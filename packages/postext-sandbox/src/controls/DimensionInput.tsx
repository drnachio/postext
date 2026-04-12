'use client';

import type { Dimension, DimensionUnit } from 'postext';
import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';

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
}

const UNITS: DimensionUnit[] = ['cm', 'mm', 'in', 'pt'];

const TO_PT: Record<DimensionUnit, number> = {
  pt: 1,
  mm: 2.83465,
  cm: 28.3465,
  in: 72,
};

function convert(val: number, from: DimensionUnit, to: DimensionUnit): number {
  const pts = val * TO_PT[from];
  return Math.round((pts / TO_PT[to]) * 100) / 100;
}

export function DimensionInput({ label, value, onChange, min, max, step = 0.1, tooltip, isDefault, onReset }: DimensionInputProps) {
  const handleValueChange = (v: number) => {
    onChange({ value: v, unit: value.unit });
  };

  const handleUnitChange = (unit: DimensionUnit) => {
    const converted = convert(value.value, value.unit, unit);
    onChange({ value: converted, unit });
  };

  const chars = Math.max(String(value.value).length, 3);
  const muted = isDefault ?? false;

  return (
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        {tooltip && <InfoTip text={tooltip} />}
        <label className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>
          {label}
        </label>
      </div>
      <div className="flex items-center gap-1">
        <input
          type="number"
          value={value.value}
          onChange={(e) => handleValueChange(Number(e.target.value))}
          min={min}
          max={max}
          step={step}
          className="rounded border px-2 py-1 text-xs text-right"
          style={{
            width: `${chars + 4}ch`,
            borderColor: 'var(--rule)',
            backgroundColor: 'var(--surface)',
            color: muted ? 'var(--slate)' : 'var(--foreground)',
          }}
        />
        <select
          value={value.unit}
          onChange={(e) => handleUnitChange(e.target.value as DimensionUnit)}
          className="rounded border px-1 py-1 text-xs"
          style={{
            borderColor: 'var(--rule)',
            backgroundColor: 'var(--surface)',
            color: muted ? 'var(--slate)' : 'var(--foreground)',
          }}
        >
          {UNITS.map((u) => (
            <option key={u} value={u}>{u}</option>
          ))}
        </select>
        {!muted && onReset && <ResetButton onClick={onReset} />}
      </div>
    </div>
  );
}
