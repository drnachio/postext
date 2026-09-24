'use client';

import { NumberField as NumberFieldPrimitive } from '@base-ui/react/number-field';
import { Minus, Plus } from 'lucide-react';
import { cn } from './cn';

export interface NumberFieldProps {
  value: number;
  /** Fires while typing, stepping or scrubbing. */
  onValueChange: (value: number) => void;
  /** Fires when an edit settles (blur, pointer release, arrow key). */
  onValueCommitted?: (value: number) => void;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaLabel?: string;
  muted?: boolean;
  /** Width of the text box in characters (steppers excluded). */
  widthCh?: number;
  /** Hide the − / + buttons (e.g. inside dense grids). */
  steppers?: boolean;
  /** Accessible names of the − / + buttons. */
  decrementLabel?: string;
  incrementLabel?: string;
  className?: string;
}

const STEPPER =
  'inline-flex h-full w-5 shrink-0 cursor-pointer items-center justify-center text-(--slate) transition-colors hover:text-(--foreground) hover:bg-(--surface-2,var(--background)) data-disabled:cursor-default data-disabled:opacity-40';

/** Numeric input on Base UI's NumberField: − / + buttons (pointer only —
 *  keyboard users step with the arrow keys: Shift ×10, Alt ×0.1),
 *  locale-aware parsing and clamping to min/max. */
export function NumberField({
  value,
  onValueChange,
  onValueCommitted,
  min,
  max,
  step = 1,
  id,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaLabel,
  muted,
  widthCh,
  steppers = true,
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  className,
}: NumberFieldProps) {
  const decimals = decimalsOf(step);
  // Fixed width (fits "9999,99"): a box that grows with its value would
  // move the − / + buttons under the pointer between clicks.
  const chars = widthCh ?? 5;
  return (
    <NumberFieldPrimitive.Root
      id={id}
      value={value}
      min={min}
      max={max}
      step={step}
      smallStep={step / 10}
      largeStep={step * 10}
      format={{ maximumFractionDigits: Math.max(decimals, 2), useGrouping: false }}
      onValueChange={(v) => { if (v !== null && Number.isFinite(v)) onValueChange(v); }}
      onValueCommitted={(v) => { if (v !== null && Number.isFinite(v)) onValueCommitted?.(v); }}
      className={cn('inline-flex', className)}
    >
      <NumberFieldPrimitive.Group
        className={cn(
          'inline-flex h-7 items-stretch overflow-hidden rounded-md border border-(--rule) bg-(--surface) transition-colors',
          'hover:border-(--rule-strong,var(--slate)) focus-within:border-(--brand)',
        )}
      >
        {steppers && (
          <NumberFieldPrimitive.Decrement className={STEPPER} aria-label={decrementLabel} tabIndex={-1}>
            <Minus size={11} aria-hidden="true" />
          </NumberFieldPrimitive.Decrement>
        )}
        <NumberFieldPrimitive.Input
          aria-labelledby={ariaLabelledBy}
          aria-describedby={ariaDescribedBy}
          aria-label={ariaLabelledBy ? undefined : ariaLabel}
          className={cn(
            'min-w-0 bg-transparent px-1 text-center text-xs tabular-nums outline-none',
            muted ? 'text-(--slate)' : 'text-(--foreground)',
          )}
          style={{ width: `${chars}ch` }}
        />
        {steppers && (
          <NumberFieldPrimitive.Increment className={STEPPER} aria-label={incrementLabel} tabIndex={-1}>
            <Plus size={11} aria-hidden="true" />
          </NumberFieldPrimitive.Increment>
        )}
      </NumberFieldPrimitive.Group>
    </NumberFieldPrimitive.Root>
  );
}

function decimalsOf(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}
