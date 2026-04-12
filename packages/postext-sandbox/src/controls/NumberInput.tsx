'use client';

import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';

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
}

export function NumberInput({ label, value, onChange, min, max, step, tooltip, isDefault, onReset }: NumberInputProps) {
  const chars = Math.max(String(value).length, 3);
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
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
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
        {!muted && onReset && <ResetButton onClick={onReset} />}
      </div>
    </div>
  );
}
