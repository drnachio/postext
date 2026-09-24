'use client';

import { ChoiceCards, type ChoiceCard } from '../ui/choice-cards';
import { FieldRow } from './FieldRow';
import { useFieldIds } from './fieldContext';

interface ChoiceInputProps<T extends string> {
  label: string;
  value: T;
  options: readonly ChoiceCard<T>[];
  onChange: (value: T) => void;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
}

/** A field whose options are shown as picture cards under the label. */
export function ChoiceInput<T extends string>({ label, value, options, onChange, tooltip, isDefault, onReset }: ChoiceInputProps<T>) {
  return (
    <FieldRow
      label={label}
      tooltip={tooltip}
      isDefault={isDefault ?? false}
      onReset={onReset}
      stacked
      extraTerms={options.map((o) => o.label)}
    >
      <Cards label={label} value={value} options={options} onChange={onChange} />
    </FieldRow>
  );
}

function Cards<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: readonly ChoiceCard<T>[]; onChange: (v: T) => void }) {
  const ids = useFieldIds();
  return (
    <ChoiceCards
      value={value}
      onValueChange={onChange}
      options={options}
      ariaLabelledBy={ids?.labelId}
      ariaDescribedBy={ids?.descriptionId}
      ariaLabel={label}
    />
  );
}
