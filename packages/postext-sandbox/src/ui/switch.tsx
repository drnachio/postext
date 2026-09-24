'use client';

import { Switch as SwitchPrimitive } from '@base-ui/react/switch';
import { cn } from './cn';

export interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  /** id of the hidden input, so a `<label htmlFor>` toggles it. */
  id?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
  ariaLabel?: string;
  muted?: boolean;
  disabled?: boolean;
  className?: string;
}

/** On/off switch on Base UI's Switch: `role="switch"`, Space/Enter, and a
 *  hidden checkbox input a native label can point at. */
export function Switch({ checked, onCheckedChange, id, ariaLabelledBy, ariaDescribedBy, ariaLabel, muted, disabled, className }: SwitchProps) {
  return (
    <SwitchPrimitive.Root
      id={id}
      checked={checked}
      onCheckedChange={(v) => onCheckedChange(v)}
      disabled={disabled}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
      aria-label={ariaLabelledBy ? undefined : ariaLabel}
      className={cn(
        'relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border p-[2px] transition-colors',
        'border-(--rule) bg-(--surface) data-checked:border-(--brand) data-checked:bg-(--brand)',
        'focus-visible:outline-2 focus-visible:outline-offset-2 outline-(--brand)',
        'data-disabled:cursor-default data-disabled:opacity-50',
        muted && 'opacity-80',
        className,
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block h-3.5 w-3.5 rounded-full transition-transform duration-150',
          'bg-(--slate) data-checked:translate-x-4 data-checked:bg-(--brand-contrast,var(--background))',
        )}
      />
    </SwitchPrimitive.Root>
  );
}
