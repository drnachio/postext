'use client';

import { FieldRow } from './FieldRow';

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
    <FieldRow
      label={label}
      tooltip={tooltip}
      isDefault={muted}
      onReset={onReset}
      extraTerms={options.map((o) => o.label)}
    >
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
    </FieldRow>
  );
}
