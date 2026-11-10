'use client';

// A resource's width (`placement.width`): a share of its slot in %, or a
// length in mm, cm, in or pt (#1461). The resource's card and the
// resource type's defaults both set it here.

import type { Dimension, ResourcePlacement } from 'postext';
import { NumberInput, DimensionInput, SelectInput } from '../../controls/index.js';
import { useSandboxLabels } from '../../context/SandboxContext.js';

type Width = ResourcePlacement['width'];

/** The units the engine reads a width length in (#1461): physical ones. */
const LENGTH_UNITS = ['mm', 'cm', 'in', 'pt'] as const;

/** Whether a width is a length rather than a share. */
export const isLengthWidth = (w: Width): w is Dimension => typeof w === 'object' && w !== null;

/** A share as the % field shows it (100 for none or a length). */
export const widthPercentOf = (w: Width, fallback = 1): number => Math.round((typeof w === 'number' ? w : fallback) * 100);

const DEFAULT_LENGTH: Dimension = { value: 80, unit: 'mm' };

interface PlacementWidthFieldProps {
  /** The width in force (the resource's own, else its type's). */
  value: Width;
  /** The share shown when no share is set (a wrapped picture's default). */
  fallbackShare?: number;
  /** Whether the value shown is inherited (nothing set here). */
  isDefault: boolean;
  onChange: (width: Width | undefined) => void;
  onReset: () => void;
  /** A share of 100 % clears the width (the type's field does: nothing
   *  is under it). A resource's card writes the share instead, so a share
   *  stands over a length its type sets. */
  clearAtWhole?: boolean;
}

export function PlacementWidthField({ value, fallbackShare = 1, isDefault, onChange, onReset, clearAtWhole }: PlacementWidthFieldProps) {
  const labels = useSandboxLabels();
  const length = isLengthWidth(value);
  return (
    <>
      <SelectInput
        variant="segmented"
        label={labels.resourcePlacementWidthKind}
        tooltip={labels.resourcePlacementWidthKindTooltip}
        value={length ? 'length' : 'share'}
        options={[
          { value: 'share', label: labels.resourcePlacementWidthShare },
          { value: 'length', label: labels.resourcePlacementWidthLength },
        ]}
        onChange={(v) => {
          if (v === 'length' && !length) onChange(DEFAULT_LENGTH);
          // Back to a share: the type's field clears its length; a
          // resource writes the share, which wins over its type's length.
          else if (v === 'share' && length) onChange(clearAtWhole ? undefined : fallbackShare);
        }}
        isDefault={isDefault}
        onReset={onReset}
      />
      {length ? (
        <DimensionInput
          label={labels.resourceTypePlacementWidth}
          tooltip={labels.resourcePlacementWidthLengthTooltip}
          value={value}
          onChange={(v) => onChange(v.value > 0 ? v : DEFAULT_LENGTH)}
          min={1}
          step={1}
          units={[...LENGTH_UNITS]}
          isDefault={isDefault}
          onReset={onReset}
        />
      ) : (
        <NumberInput
          label={labels.resourceTypePlacementWidth}
          tooltip={labels.resourceTypePlacementWidthTooltip}
          value={widthPercentOf(value, fallbackShare)}
          onChange={(v) => onChange(clearAtWhole && v >= 100 ? undefined : Math.min(100, Math.max(1, v)) / 100)}
          min={10}
          max={100}
          step={5}
          suffix="%"
          isDefault={isDefault}
          onReset={onReset}
        />
      )}
    </>
  );
}
