'use client';

// A stacked field row of the resource detail pane, and the input styles
// its fields share.
import { FieldRow } from '../../../controls/FieldRow.js';

export const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-2 py-1.5';
export const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)', fontFamily: 'inherit', fontSize: 13, lineHeight: '20px' } as const;
export const labelStyle = { color: 'var(--slate)', fontSize: 11, lineHeight: '14px' } as const;

interface FieldProps {
  label: string;
  tooltip?: string;
  children: React.ReactNode;
  hint?: string;
}

export function Field({ label, tooltip, children, hint }: FieldProps) {
  return (
    <FieldRow stacked label={label} tooltip={tooltip} hint={hint} className="mb-0">
      {children}
    </FieldRow>
  );
}
