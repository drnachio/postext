'use client';

import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';

interface SelectOption {
  value: string;
  label: string;
}

interface SelectInputProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
}

export function SelectInput({ label, value, options, onChange, tooltip, isDefault, onReset }: SelectInputProps) {
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
        <select
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-28 rounded border px-2 py-1 text-xs"
          style={{
            borderColor: 'var(--rule)',
            backgroundColor: 'var(--surface)',
            color: muted ? 'var(--slate)' : 'var(--foreground)',
          }}
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        {!muted && onReset && <ResetButton onClick={onReset} />}
      </div>
    </div>
  );
}
