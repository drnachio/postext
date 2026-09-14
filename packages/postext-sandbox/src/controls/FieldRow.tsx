'use client';

import { forwardRef, type ReactNode } from 'react';
import { cn } from '../ui/cn';
import { InfoTip } from './InfoTip';
import { ResetButton } from './ResetButton';

export interface FieldRowProps {
  label: string;
  tooltip?: string;
  /** Value equals the engine default: label stays muted, no reset button. */
  isDefault?: boolean;
  onReset?: () => void;
  /** Label above the control instead of beside it (wide inputs). */
  stacked?: boolean;
  /** Hint under a stacked control. */
  hint?: ReactNode;
  /** Extra words the settings search should match (units, aliases). */
  extraTerms?: string[];
  htmlFor?: string;
  className?: string;
  children: ReactNode;
}

/** The one field row used by every settings control: info tip + label on
 *  the left, reset button + control on the right. Forward the ref to
 *  anchor a popover to the whole row. */
export const FieldRow = forwardRef<HTMLDivElement, FieldRowProps>(function FieldRow(
  { label, tooltip, isDefault, onReset, stacked, hint, htmlFor, className, children },
  ref,
) {
  const showReset = !isDefault && !!onReset;
  return (
    <div
      ref={ref}
      className={cn('mb-2 flex gap-2', stacked ? 'flex-col items-stretch' : 'items-center justify-between', className)}
    >
      <div className={cn('flex min-w-0 items-center gap-1', stacked ? 'justify-between' : 'flex-1')}>
        <span className="flex min-w-0 items-center gap-1">
          {tooltip && <InfoTip text={tooltip} />}
          <label
            htmlFor={htmlFor}
            className="min-w-0 truncate text-xs"
            title={label}
            style={{ color: 'var(--slate)' }}
          >
            {label}
          </label>
        </span>
        {stacked && showReset && <ResetButton onClick={onReset} />}
      </div>
      <div className={cn('flex items-center gap-1', stacked ? 'min-w-0' : 'shrink-0')}>
        {!stacked && showReset && <ResetButton onClick={onReset} />}
        {children}
      </div>
      {stacked && hint && (
        <div className="-mt-1 text-[10px] leading-[14px]" style={{ color: 'var(--slate)' }}>{hint}</div>
      )}
    </div>
  );
});
