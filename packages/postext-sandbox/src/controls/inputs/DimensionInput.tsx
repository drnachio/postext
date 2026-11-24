'use client';

import { useCallback, useRef } from 'react';
import type { Dimension, DimensionUnit } from 'postext';
import { useSandboxLabels } from '../../context/SandboxContext.js';
import { LengthField } from '../../ui/inputs/length-field.js';
import { FieldRow } from '../FieldRow.js';
import { useFieldIds } from '../fieldContext.js';
import { evalLength, plainNumber } from './lengthExpression.js';
import { useDebouncedCommit } from './useDebouncedCommit.js';
import { convertDimension } from './units.js';

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
    <FieldRow label={label} tooltip={tooltip} isDefault={muted} onReset={onReset} extraTerms={units}>
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

/** A length: value and unit in one frame. Switching the unit converts the
 *  value so the length on the page stays the same; a value typed with a
 *  unit of its own, or as arithmetic, is converted to the field's unit
 *  (`lengthExpression.ts`). Edits reach the book after a short quiet
 *  window, and at once when they settle. */
export function DimensionControl({ label, value, onChange, min = 0, max, step = 0.1, units = DEFAULT_UNITS, muted, standalone }: DimensionControlProps) {
  const labels = useSandboxLabels();
  const ids = useFieldIds();
  const unitRef = useRef(value.unit);
  unitRef.current = value.unit;
  const commitNumber = useCallback((v: number) => {
    onChange({ value: v, unit: unitRef.current });
  }, [onChange]);
  const [local, stage, flush] = useDebouncedCommit(value.value, commitNumber);

  const unitOptions = (units.includes(value.unit) ? units : [...units, value.unit]).map((u) => ({
    value: u,
    label: u,
    description: unitDescription(u, labels),
  }));

  return (
    <span className={standalone ? 'inline-flex w-(--pt-field-w)' : 'flex w-full @[260px]:w-(--pt-field-w)'}>
      <LengthField
        id={standalone ? undefined : ids?.controlId}
        ariaLabelledBy={standalone ? undefined : ids?.labelId}
        ariaDescribedBy={standalone ? undefined : ids?.descriptionId}
        ariaLabel={label}
        value={local}
        unit={value.unit}
        units={unitOptions}
        onValueChange={stage}
        onValueCommitted={(v) => { stage(v); flush(); }}
        onUnitChange={(unit) => { flush(); onChange({ value: convertDimension(local, value.unit, unit), unit }); }}
        parse={(text) => evalLength(text, value.unit)}
        parsePlain={plainNumber}
        min={min}
        max={max}
        step={step}
        muted={muted}
        unitLabel={labels.dimensionUnit.replace('__label__', label)}
        decrementLabel={labels.decreaseValue}
        incrementLabel={labels.increaseValue}
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
