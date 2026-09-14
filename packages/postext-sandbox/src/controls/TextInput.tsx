'use client';

import { FieldRow } from './FieldRow';

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  widthCh?: number;
  onFocus?: () => void;
  onBlur?: () => void;
}

export function TextInput({
  label,
  value,
  onChange,
  placeholder,
  tooltip,
  isDefault,
  onReset,
  widthCh = 14,
  onFocus,
  onBlur,
}: TextInputProps) {
  const muted = isDefault ?? false;
  return (
    <FieldRow label={label} tooltip={tooltip} isDefault={muted} onReset={onReset}>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        className="rounded border px-2 py-1 text-xs"
        style={{
          width: `${widthCh}ch`,
          borderColor: 'var(--rule)',
          backgroundColor: 'var(--surface)',
          color: muted ? 'var(--slate)' : 'var(--foreground)',
        }}
      />
    </FieldRow>
  );
}
