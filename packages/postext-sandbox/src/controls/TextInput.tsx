'use client';

import { FieldRow } from './FieldRow';
import { useFieldIds } from './fieldContext';
import { cn } from '../ui/cn';

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
      <TextControl
        value={value}
        onChange={onChange}
        onFocus={onFocus}
        onBlur={onBlur}
        placeholder={placeholder}
        widthCh={widthCh}
        muted={muted}
      />
    </FieldRow>
  );
}

interface TextControlProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  widthCh?: number;
  muted?: boolean;
  ariaLabel?: string;
  onFocus?: () => void;
  onBlur?: () => void;
  className?: string;
}

/** Plain one-line text box, named by the enclosing field row. */
export function TextControl({ value, onChange, placeholder, widthCh, muted, ariaLabel, onFocus, onBlur, className }: TextControlProps) {
  const ids = useFieldIds();
  return (
    <input
      type="text"
      id={ids?.controlId}
      aria-describedby={ids?.descriptionId}
      aria-label={ids ? undefined : ariaLabel}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      className={cn(
        'h-7 rounded-md border border-(--rule) bg-(--surface) px-2 text-xs transition-colors outline-none',
        'placeholder:text-(--slate) placeholder:opacity-70 hover:border-(--rule-strong,var(--slate)) focus:border-(--brand)',
        muted ? 'text-(--slate)' : 'text-(--foreground)',
        className,
      )}
      style={widthCh ? { width: `${widthCh}ch` } : undefined}
    />
  );
}
