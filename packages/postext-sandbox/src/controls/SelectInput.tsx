'use client';

import type { ReactNode } from 'react';
import { Select } from '../ui/select';
import { SegmentedControl } from '../ui/segmented';
import { FieldRow } from './FieldRow';
import { useFieldIds } from './fieldContext';

interface SelectOption {
  value: string;
  label: string;
  /** One-line explanation shown under the option in the list. */
  description?: string;
  icon?: ReactNode;
}

interface SelectInputProps {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  /** `segmented` shows every option at once (two to four short choices). */
  variant?: 'dropdown' | 'segmented';
  /** Put the control under the label, full width. */
  stacked?: boolean;
}

export function SelectInput({ label, value, options, onChange, tooltip, isDefault, onReset, variant = 'dropdown', stacked }: SelectInputProps) {
  const muted = isDefault ?? false;
  return (
    <FieldRow
      label={label}
      tooltip={tooltip}
      isDefault={muted}
      onReset={onReset}
      stacked={stacked}
      extraTerms={options.map((o) => o.label)}
    >
      <SelectControl label={label} value={value} options={options} onChange={onChange} muted={muted} variant={variant} fill={stacked} />
    </FieldRow>
  );
}

function SelectControl({ label, value, options, onChange, muted, variant, fill }: {
  label: string;
  value: string;
  options: SelectOption[];
  onChange: (value: string) => void;
  muted: boolean;
  variant: 'dropdown' | 'segmented';
  fill?: boolean;
}) {
  const ids = useFieldIds();
  if (variant === 'segmented') {
    return (
      <SegmentedControl
        value={value}
        onValueChange={onChange}
        options={options.map((o) => ({ value: o.value, label: o.icon ?? o.label, title: o.icon ? o.label : o.description }))}
        ariaLabel={label}
        ariaLabelledBy={ids?.labelId}
        ariaDescribedBy={ids?.descriptionId}
        fill={fill}
      />
    );
  }
  return (
    <Select
      id={ids?.controlId}
      ariaLabelledBy={ids?.labelId}
      ariaDescribedBy={ids?.descriptionId}
      ariaLabel={label}
      value={value}
      onValueChange={onChange}
      options={options}
      muted={muted}
      className={fill ? 'w-full' : 'w-32'}
    />
  );
}
