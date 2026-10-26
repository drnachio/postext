'use client';

// Units, input classes, style id helpers and the field wrapper of the
// paragraph styles section (#1276: split out of ParagraphStylesSection.tsx).
import type { DimensionUnit, Dimension, ParagraphStyleConfig } from 'postext';
import { FieldRow } from '../../../../controls/FieldRow.js';

export const FONT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
export const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const SPACING_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const ZERO_EM: Dimension = { value: 0, unit: 'em' };
/** Tracking (#907): ems of the style's own size first. */
export const TRACKING_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];

export const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
export const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

/** Turn free text into a `:::paragraphs{style="…"}`-friendly id. */
export function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function nextStyleId(existing: ParagraphStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`style-${n}`)) n++;
  return `style-${n}`;
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
