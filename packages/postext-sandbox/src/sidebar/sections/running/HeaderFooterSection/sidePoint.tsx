'use client';

import type { SidePosition } from 'postext';
import { useSandboxLabels } from '../../../../context/SandboxContext.js';
import { NumberInput, SelectInput } from '../../../../controls/index.js';

/** A point along a side as the select shows it: a word, `fraction` for a
 *  number, `''` for unset. */
export function sidePointChoice(at: SidePosition | undefined): '' | 'start' | 'center' | 'end' | 'fraction' {
  if (at === undefined) return '';
  if (typeof at === 'number') return 'fraction';
  return at === 'start' || at === 'center' || at === 'end' ? at : '';
}

/** What choosing in the select writes: a fraction starts from the point it
 *  replaces (0, ½, 1). */
export function sidePointFromChoice(choice: string, prev: SidePosition | undefined): SidePosition | undefined {
  if (choice === 'start' || choice === 'center' || choice === 'end') return choice;
  if (choice === 'fraction') {
    if (typeof prev === 'number') return prev;
    return prev === 'start' ? 0 : prev === 'end' ? 1 : 0.5;
  }
  return undefined;
}

interface SidePointFieldsProps {
  label: string;
  tooltip?: string;
  value: SidePosition | undefined;
  /** The unset value has a choice of its own («the edge's own point»);
   *  without it unset reads as the middle. */
  ownLabel?: string;
  onChange: (at: SidePosition | undefined) => void;
}

/** The point along a side (#1055/#1056): its start, middle or end, or a
 *  fraction from its start. */
export function SidePointFields({ label, tooltip, value, ownLabel, onChange }: SidePointFieldsProps) {
  const labels = useSandboxLabels();
  const choice = sidePointChoice(value);
  const shown = choice === '' && !ownLabel ? 'center' : choice;
  return (
    <>
      <SelectInput
        label={label}
        tooltip={tooltip}
        value={shown}
        options={[
          ...(ownLabel ? [{ value: '', label: ownLabel }] : []),
          { value: 'start', label: labels.sidePointStart },
          { value: 'center', label: labels.sidePointCenter },
          { value: 'end', label: labels.sidePointEnd },
          { value: 'fraction', label: labels.sidePointFraction },
        ]}
        onChange={(v) => onChange(sidePointFromChoice(v, value))}
        isDefault={value === undefined}
        onReset={() => onChange(undefined)}
      />
      {typeof value === 'number' && (
        <NumberInput
          label={labels.sidePointValue}
          value={value}
          onChange={(v) => onChange(Math.max(0, Math.min(1, v)))}
          min={0}
          max={1}
          step={0.05}
        />
      )}
    </>
  );
}
