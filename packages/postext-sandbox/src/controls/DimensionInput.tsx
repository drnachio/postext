'use client';

import { useCallback, useRef } from 'react';
import type { Dimension, DimensionUnit } from 'postext';
import { useSandboxLabels } from '../context/SandboxContext';
import { Select } from '../ui/select';
import { FieldRow } from './FieldRow';
import { NumberControl } from './NumberControl';
import { convertDimension } from './units';

interface DimensionInputProps {
  label: string;
  value: Dimension;
  onChange: (dimension: Dimension) => void;
  min?: number;
  max?: number;
  step?: number;
  tooltip?: string;
  isDefault?: boolean;
  onReset?: () => void;
  units?: DimensionUnit[];
}

const DEFAULT_UNITS: DimensionUnit[] = ['cm', 'mm', 'in', 'pt'];

export function DimensionInput({ label, value, onChange, min = 0, max, step = 0.1, tooltip, isDefault, onReset, units = DEFAULT_UNITS }: DimensionInputProps) {
  const muted = isDefault ?? false;
  return (
    <FieldRow label={label} tooltip={tooltip} isDefault={isDefault} onReset={onReset} extraTerms={units}>
      <DimensionControl label={label} value={value} onChange={onChange} min={min} max={max} step={step} units={units} muted={muted} />
    </FieldRow>
  );
}

interface DimensionControlProps {
  label: string;
  value: Dimension;
  onChange: (dimension: Dimension) => void;
  min?: number;
  max?: number;
  step?: number;
  units?: DimensionUnit[];
  muted?: boolean;
  /** Name the number box directly (no enclosing field row). */
  standalone?: boolean;
}

/** Number + unit pair. Switching the unit converts the value so the length
 *  on the page stays the same. */
export function DimensionControl({ label, value, onChange, min = 0, max, step = 0.1, units = DEFAULT_UNITS, muted, standalone }: DimensionControlProps) {
  const labels = useSandboxLabels();
  const unitRef = useRef(value.unit);
  unitRef.current = value.unit;
  const commitNumber = useCallback((v: number) => {
    onChange({ value: v, unit: unitRef.current });
  }, [onChange]);

  const unitOptions = (units.includes(value.unit) ? units : [...units, value.unit]).map((u) => ({
    value: u,
    label: u,
    description: unitDescription(u, labels),
  }));

  return (
    <span className="inline-flex items-center gap-1">
      <NumberControl
        value={value.value}
        onChange={commitNumber}
        min={min}
        max={max}
        step={step}
        muted={muted}
        ariaLabel={standalone ? label : undefined}
      />
      <Select
        size="sm"
        value={value.unit}
        onValueChange={(unit) => onChange({ value: convertDimension(value.value, value.unit, unit), unit })}
        options={unitOptions}
        ariaLabel={labels.dimensionUnit.replace('__label__', label)}
        muted={muted}
        className="w-[3.25rem]"
      />
    </span>
  );
}

function unitDescription(u: DimensionUnit, labels: ReturnType<typeof useSandboxLabels>): string | undefined {
  switch (u) {
    case 'cm': return labels.unitCm;
    case 'mm': return labels.unitMm;
    case 'in': return labels.unitIn;
    case 'pt': return labels.unitPt;
    case 'px': return labels.unitPx;
    case 'em': return labels.unitEm;
    case 'rem': return labels.unitRem;
  }
}
