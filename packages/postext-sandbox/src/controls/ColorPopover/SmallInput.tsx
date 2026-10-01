'use client';

import { clamp } from '../color-utils';

export function SmallInput({
  value,
  onChange,
  label,
  min = 0,
  max = 255,
}: {
  value: number;
  onChange: (v: number) => void;
  label: string;
  min?: number;
  max?: number;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
      <input
        type="number"
        aria-label={label}
        value={value}
        onChange={(e) => onChange(clamp(Number(e.target.value), min, max))}
        min={min}
        max={max}
        style={{
          width: 42,
          padding: '3px 4px',
          fontSize: 10,
          textAlign: 'center',
          borderRadius: 3,
          border: '1px solid var(--pt-control-border)',
          backgroundColor: 'var(--background)',
          color: 'var(--foreground)',
        }}
      />
      <span aria-hidden="true" style={{ fontSize: 10, color: 'var(--slate)' }}>{label}</span>
    </div>
  );
}
