'use client';

import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';

interface TextInputProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  widthCh?: number;
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
}: TextInputProps) {
  const muted = isDefault ?? false;
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
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          className="rounded border px-2 py-1 text-xs"
          style={{
            width: `${widthCh}ch`,
            borderColor: 'var(--rule)',
            backgroundColor: 'var(--surface)',
            color: muted ? 'var(--slate)' : 'var(--foreground)',
          }}
        />
      </div>
    </div>
  );
}
