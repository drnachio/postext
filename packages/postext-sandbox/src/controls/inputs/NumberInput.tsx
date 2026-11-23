'use client';

import { FieldRow } from '../FieldRow.js';
import { NumberControl } from './NumberControl.js';
import { fontWeightName } from './fontWeightName.js';

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
  /** Width of the value, in characters (5 by default). */
  widthCh?: number;
}

export function NumberInput({ label, value, onChange, min = 0, max = 100, step = 1, tooltip, isDefault, onReset, suffix: suffixProp, widthCh }: NumberInputProps) {
  const muted = isDefault ?? false;
  // A font weight (the fields that run from 100 to 900) is read with the
  // name designers give it: 400 Regular, 700 Bold.
  const suffix = suffixProp ?? (min === 100 && max === 900 ? fontWeightName(value) : undefined);
  return (
    <FieldRow label={label} tooltip={tooltip} isDefault={muted} onReset={onReset} extraTerms={suffixProp ? [suffixProp] : undefined}>
      {/* A width of its own (a year, a page count) keeps it; otherwise
          the row's control width, the suffix inside the frame. */}
      {widthCh !== undefined ? (
        <NumberControl value={value} onChange={onChange} min={min} max={max} step={step} muted={muted} widthCh={widthCh} suffix={suffix} />
      ) : (
        <span className="inline-flex w-(--pt-field-w)">
          <NumberControl value={value} onChange={onChange} min={min} max={max} step={step} muted={muted} fill suffix={suffix} />
        </span>
      )}
    </FieldRow>
  );
}
