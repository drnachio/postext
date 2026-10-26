'use client';

// Units, input classes, style id helpers and the small field and button
// wrappers every part of the box styles section uses (#1276: split out of
// CalloutStylesSection.tsx).
import type { DimensionUnit, Dimension, CalloutStyleConfig, Resource } from 'postext';
import { IconButton } from '../../../../ui/index.js';
import { FieldRow } from '../../../../controls/FieldRow.js';

export const FONT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
export const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const STROKE_UNITS: DimensionUnit[] = ['pt', 'px', 'mm'];
export const OFFSET_UNITS: DimensionUnit[] = ['mm', 'pt', 'px', 'em'];
export const TRACKING_UNITS: DimensionUnit[] = ['pt', 'em', 'px'];
export const MIN_HEIGHT_UNITS: DimensionUnit[] = ['pt', 'mm', 'cm', 'in', 'em', 'px'];
export const ZERO_PT: Dimension = { value: 0, unit: 'pt' };

export const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
export const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

/** Turn free text into a `:::callout{type="…"}`-friendly id. */
export function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueId(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

export function nextStyleId(existing: CalloutStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`callout-${n}`)) n++;
  return `callout-${n}`;
}

/** Sub-objects of a callout style that are edited field by field. */
export type CalloutNumbering = NonNullable<CalloutStyleConfig['numbering']>;
export type Group = 'border' | 'padding' | 'stripe' | 'icon' | 'label' | 'marker' | 'titleStyle' | 'body' | 'lists';
export type GroupConfig<G extends Group> = NonNullable<CalloutStyleConfig[G]>;

export function iconLabel(r: Resource): string {
  const text = r.caption?.trim();
  return text ? `${text} (${r.id})` : r.id;
}

interface FieldProps {
  label: string;
  tooltip?: string;
  hint?: string;
  children: React.ReactNode;
}

export function Field({ label, tooltip, hint, children }: FieldProps) {
  return (
    <FieldRow stacked label={label} tooltip={tooltip} hint={hint} className="mb-0">
      {children}
    </FieldRow>
  );
}

export function CardButton({
  label,
  onClick,
  destructive,
  children,
}: {
  label: string;
  onClick: (e: React.MouseEvent<HTMLButtonElement>) => void;
  destructive?: boolean;
  children: React.ReactNode;
}) {
  return <IconButton label={label} icon={children} onClick={onClick} destructive={destructive} />;
}
