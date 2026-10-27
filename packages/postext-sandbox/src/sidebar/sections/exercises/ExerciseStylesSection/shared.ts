'use client';

// Units, input classes, style id helpers and the part types of the
// exercise styles section (#1276: split out of ExerciseStylesSection.tsx).
import type { DimensionUnit, ColorValue, ExerciseStyleConfig } from 'postext';

export const EM_UNITS: DimensionUnit[] = ['em', 'pt', 'mm'];
export const LINE_UNITS: DimensionUnit[] = ['pt', 'px'];
export const WHITE: ColorValue = { hex: '#ffffff', model: 'hex' };

export const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
export const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

/** Turn free text into a `:::exercise{style="…"}`-friendly id. */
export function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function uniqueId(base: string, taken: ReadonlySet<string>): string {
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** The parts of a style that are objects of their own. */
export type Part = 'number' | 'instruction' | 'options' | 'blank' | 'trueFalse' | 'match' | 'bank' | 'area' | 'grid' | 'arithmetic' | 'level' | 'answers' | 'solutions' | 'digital';
export type PartConfig<P extends Part> = NonNullable<ExerciseStyleConfig[P]>;
