'use client';

// Units, input classes, style id and patch helpers and the field wrapper
// of the heading styles section (#1276: split out of HeadingStylesSection.tsx).
import type { DimensionUnit, Dimension, HeadingStyleConfig } from 'postext';
import { FieldRow } from '../../../../controls/FieldRow.js';

export const TEXT_SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'em', 'rem'];
export const LINE_HEIGHT_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const TRACKING_UNITS: DimensionUnit[] = ['pt', 'em', 'px'];
export const MARGIN_UNITS: DimensionUnit[] = ['em', 'pt', 'px'];
export const MIN_HEIGHT_UNITS: DimensionUnit[] = ['pt', 'mm', 'cm', 'in', 'em', 'px'];
export const ZERO_PT: Dimension = { value: 0, unit: 'pt' };
/** 字下げ counts body characters (`em` is the body size). */
export const INDENT_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];
export const ZERO_EM: Dimension = { value: 0, unit: 'em' };

export const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
export const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;
export const infoStyle = { color: 'var(--slate)' } as const;

export type MarginSide = 'top' | 'bottom' | 'left' | 'right';

/** Turn free text into a `{style="…"}`-friendly id. */
export function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function nextStyleId(existing: HeadingStyleConfig[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`style-${n}`)) n++;
  return `style-${n}`;
}

/** Copy of `obj` without `key`; `undefined` when nothing remains. */
export function omit<T extends object, K extends keyof T>(obj: T | undefined, key: K): T | undefined {
  if (!obj) return undefined;
  const next = { ...obj };
  delete next[key];
  return Object.keys(next).length > 0 ? next : undefined;
}

export function hasKeys(obj: object | undefined): boolean {
  return obj !== undefined && Object.keys(obj).length > 0;
}

export function Field({ label, tooltip, hint, children }: { label: string; tooltip?: string; hint?: string; children: React.ReactNode }) {
  return (
    <FieldRow stacked label={label} tooltip={tooltip} hint={hint} className="mb-0">
      {children}
    </FieldRow>
  );
}
