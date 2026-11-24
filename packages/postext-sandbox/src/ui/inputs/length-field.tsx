'use client';

import { useRef, useState, type KeyboardEvent } from 'react';
import { Minus, Plus } from 'lucide-react';
import { cn } from '../cn.js';
import { Select, type SelectOption } from './select.js';

export interface LengthFieldProps<U extends string> {
  value: number;
  unit: U;
  units: readonly SelectOption<U>[];
  /** Fires while a number is typed, stepped with the arrow keys or the
   *  − / + buttons. */
  onValueChange: (value: number) => void;
  /** Fires when an edit settles (Enter, blur). */
  onValueCommitted: (value: number) => void;
  onUnitChange: (unit: U) => void;
  /** The value, in the field's unit, of what was typed (`2cm`,
   *  `12pt + 2mm`); null when it is not a length. */
  parse: (text: string) => number | null;
  /** The value of a number still being typed, or null: such text shows
   *  its result at once, anything else on Enter. */
  parsePlain: (text: string) => number | null;
  min?: number;
  max?: number;
  step?: number;
  id?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaLabel?: string;
  /** Accessible name of the unit select. */
  unitLabel: string;
  muted?: boolean;
  decrementLabel?: string;
  incrementLabel?: string;
  className?: string;
}

const STEPPER =
  'inline-flex h-full w-5 pt-large:w-9 shrink-0 cursor-pointer items-center justify-center text-(--slate) transition-colors hover:text-(--foreground) hover:bg-(--surface-2,var(--background)) disabled:cursor-default disabled:opacity-50';

function decimalsOf(step: number): number {
  const s = String(step);
  const dot = s.indexOf('.');
  return dot === -1 ? 0 : s.length - dot - 1;
}

/** A length in one frame: − value + and its unit. The value is typed the
 *  way a designer types it — with a unit of its own or as arithmetic —
 *  and read back in the field's unit on Enter or blur; a text that is not
 *  a length is marked and dropped on blur. Arrow keys step (Shift ×10,
 *  Alt ×0.1); Escape puts back the value the edit started from. */
export function LengthField<U extends string>({
  value,
  unit,
  units,
  onValueChange,
  onValueCommitted,
  onUnitChange,
  parse,
  parsePlain,
  min,
  max,
  step = 1,
  id,
  ariaLabelledBy,
  ariaDescribedBy,
  ariaLabel,
  unitLabel,
  muted,
  decrementLabel = 'Decrease',
  incrementLabel = 'Increase',
  className,
}: LengthFieldProps<U>) {
  // The text while it is edited; null: the value as it is.
  const [draft, setDraft] = useState<string | null>(null);
  const [invalid, setInvalid] = useState(false);
  const startRef = useRef(value);
  const digits = Math.max(decimalsOf(step), 2);
  const shown = draft ?? new Intl.NumberFormat(undefined, { maximumFractionDigits: digits, useGrouping: false }).format(value);

  const clamp = (v: number) => {
    const rounded = Math.round(v * 100) / 100;
    return Math.min(max ?? Infinity, Math.max(min ?? -Infinity, rounded));
  };

  const settle = () => {
    if (draft === null) return;
    const parsed = parse(draft);
    setDraft(null);
    setInvalid(false);
    const settled = parsed === null ? value : clamp(parsed);
    // A later Escape goes back to this value, not to an older one.
    startRef.current = settled;
    onValueCommitted(settled);
  };

  const stepBy = (factor: number) => {
    const base = draft !== null ? parse(draft) ?? value : value;
    setDraft(null);
    setInvalid(false);
    onValueChange(clamp(base + step * factor));
  };

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const scale = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
      stepBy(e.key === 'ArrowUp' ? scale : -scale);
    } else if (e.key === 'Enter') {
      if (draft !== null && parse(draft) === null) {
        setInvalid(true);
        return;
      }
      settle();
      e.currentTarget.select();
    } else if (e.key === 'Escape' && draft !== null) {
      e.preventDefault();
      e.stopPropagation();
      setDraft(null);
      setInvalid(false);
      onValueCommitted(startRef.current);
    }
  };

  return (
    <div
      className={cn(
        'flex h-7 pt-large:h-11 w-full items-stretch overflow-hidden rounded-md border bg-(--surface) transition-colors',
        invalid ? 'border-(--destructive)' : 'border-(--pt-control-border) hover:border-(--slate) focus-within:border-(--brand)',
        'focus-within:outline-2 focus-within:outline-offset-1',
        invalid ? 'focus-within:outline-(--destructive)' : 'focus-within:outline-(--brand)',
        className,
      )}
    >
      <button type="button" tabIndex={-1} aria-label={decrementLabel} className={STEPPER} disabled={min !== undefined && value <= min} onClick={() => stepBy(-1)}>
        <Minus size={11} aria-hidden="true" />
      </button>
      <input
        id={id}
        dir="ltr"
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        aria-labelledby={ariaLabelledBy}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabelledBy ? undefined : ariaLabel}
        aria-invalid={invalid || undefined}
        value={shown}
        onFocus={(e) => { startRef.current = value; e.currentTarget.select(); }}
        onChange={(e) => {
          const text = e.target.value;
          setDraft(text);
          setInvalid(false);
          const plain = parsePlain(text);
          if (plain !== null && (min === undefined || plain >= min) && (max === undefined || plain <= max)) onValueChange(plain);
        }}
        onBlur={settle}
        onKeyDown={onKeyDown}
        className={cn(
          'min-w-0 flex-1 bg-transparent px-0.5 text-center text-xs tabular-nums outline-none',
          muted && draft === null ? 'text-(--slate)' : 'text-(--foreground)',
        )}
      />
      <button type="button" tabIndex={-1} aria-label={incrementLabel} className={STEPPER} disabled={max !== undefined && value >= max} onClick={() => stepBy(1)}>
        <Plus size={11} aria-hidden="true" />
      </button>
      <Select
        variant="bare"
        size="sm"
        value={unit}
        onValueChange={onUnitChange}
        options={units}
        ariaLabel={unitLabel}
        muted={muted}
        className="h-full! w-[2.9rem] shrink-0 border-s! border-(--rule)! ps-1.5"
      />
    </div>
  );
}
