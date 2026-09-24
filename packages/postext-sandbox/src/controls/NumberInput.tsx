'use client';

import { FieldRow } from './FieldRow';
import { NumberControl } from './NumberControl';

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
  const muted = isDefault ?? false;
  return (
    <FieldRow label={label} tooltip={tooltip} isDefault={isDefault} onReset={onReset} extraTerms={suffix ? [suffix] : undefined}>
      <NumberControl value={value} onChange={onChange} min={min} max={max} step={step} muted={muted} />
      {suffix && (
        <span className="min-w-[1.5ch] text-xs text-(--slate)">
          {suffix}
        </span>
      )}
    </FieldRow>
  );
}
