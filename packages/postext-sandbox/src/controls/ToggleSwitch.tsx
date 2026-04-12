'use client';

import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';

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
    <div className="mb-2 flex items-center justify-between gap-2">
      <div className="flex items-center gap-1">
        {tooltip && <InfoTip text={tooltip} />}
        <label className="text-xs shrink-0" style={{ color: 'var(--slate)' }}>
          {label}
        </label>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          role="switch"
          aria-checked={checked}
          aria-label={label}
          onClick={() => onChange(!checked)}
          style={{
            position: 'relative',
            height: 20,
            width: 36,
            flexShrink: 0,
            borderRadius: 9999,
            border: 'none',
            cursor: 'pointer',
            backgroundColor: checked ? 'var(--gilt)' : 'var(--rule)',
            transition: 'background-color 200ms ease',
            opacity: muted ? 0.5 : 1,
          }}
        >
          <span
            style={{
              position: 'absolute',
              left: 2,
              top: 2,
              height: 16,
              width: 16,
              borderRadius: 9999,
              backgroundColor: 'var(--background)',
              transform: checked ? 'translateX(16px)' : 'translateX(0)',
              transition: 'transform 200ms ease',
            }}
          />
        </button>
        {!muted && onReset && <ResetButton onClick={onReset} />}
      </div>
    </div>
  );
}
