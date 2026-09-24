'use client';

import { Switch } from '../ui/switch';
import { FieldRow } from './FieldRow';
import { useFieldIds } from './fieldContext';

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
    <FieldRow label={label} tooltip={tooltip} isDefault={isDefault} onReset={onReset}>
      <SwitchControl label={label} checked={checked} onChange={onChange} muted={muted} />
    </FieldRow>
  );
}

function SwitchControl({ label, checked, onChange, muted }: { label: string; checked: boolean; onChange: (v: boolean) => void; muted: boolean }) {
  const ids = useFieldIds();
  return (
    <Switch
      id={ids?.controlId}
      ariaLabelledBy={ids?.labelId}
      ariaDescribedBy={ids?.descriptionId}
      ariaLabel={label}
      checked={checked}
      onCheckedChange={onChange}
      muted={muted}
    />
  );
}
