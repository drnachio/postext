'use client';

import { NumberField } from '../ui/number-field';
import { useSandboxLabels } from '../context/SandboxContext';
import { useFieldIds } from './fieldContext';
import { useDebouncedCommit } from './useDebouncedCommit';

interface NumberControlProps {
  value: number;
  onChange: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  muted?: boolean;
  /** Accessible name when the control is not inside a field row. */
  ariaLabel?: string;
  widthCh?: number;
}

/** A NumberField wired to the enclosing field row (label + help ids) that
 *  commits upstream after a short quiet window while typing or holding a
 *  stepper, and at once when the edit settles — so a burst of keystrokes
 *  triggers one layout, not one per key. */
export function NumberControl({ value, onChange, min, max, step = 1, muted, ariaLabel, widthCh }: NumberControlProps) {
  const labels = useSandboxLabels();
  const ids = useFieldIds();
  const [local, stage, flush] = useDebouncedCommit(value, onChange);
  return (
    <NumberField
      id={ids?.controlId}
      ariaLabelledBy={ids?.labelId}
      ariaDescribedBy={ids?.descriptionId}
      ariaLabel={ariaLabel}
      value={local}
      onValueChange={stage}
      onValueCommitted={flush}
      min={min}
      max={max}
      step={step}
      muted={muted}
      widthCh={widthCh}
      decrementLabel={labels.decreaseValue}
      incrementLabel={labels.increaseValue}
    />
  );
}
