'use client';

import { FieldRow } from './FieldRow';

interface ToggleSwitchProps {
  label: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
}

export function ToggleSwitch({ label, checked, onChange, tooltip, isDefault, onReset }: ToggleSwitchProps) {
  const muted = isDefault ?? false;

  return (
    <FieldRow label={label} tooltip={tooltip} isDefault={muted} onReset={onReset}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={() => onChange(!checked)}
        className="focus-visible:outline-1 focus-visible:outline-offset-1 outline-(--brand-hover)"
        style={{
          position: 'relative',
          height: 20,
          width: 36,
          flexShrink: 0,
          borderRadius: 9999,
          border: '1px solid var(--rule)',
          cursor: 'pointer',
          backgroundColor: checked ? 'var(--brand)' : 'var(--surface)',
          transition: 'background-color 200ms ease',
          opacity: muted ? 0.7 : 1,
        }}
      >
        <span
          style={{
            position: 'absolute',
            left: 1.5,
            top: 1.5,
            height: 16,
            width: 16,
            borderRadius: 9999,
            backgroundColor: checked ? 'var(--background)' : 'var(--slate)',
            transform: checked ? 'translateX(16px)' : 'translateX(0)',
            transition: 'transform 200ms ease',
          }}
        />
      </button>
    </FieldRow>
  );
}
