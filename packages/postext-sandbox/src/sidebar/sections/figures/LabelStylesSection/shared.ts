'use client';

// Units, defaults, leader dashes, input classes and style id helpers of the
// label styles section (#1276: split out of LabelStylesSection.tsx).
import type { DimensionUnit, ColorValue, LabelStyle, Dimension, LeaderStyle } from 'postext';

export const SIZE_UNITS: DimensionUnit[] = ['pt', 'px', 'mm', 'cm', 'in', 'em'];
export const HALO_UNITS: DimensionUnit[] = ['px', 'pt', 'em'];
export const PLATE_UNITS: DimensionUnit[] = ['px', 'pt', 'em'];

/** What a halo or a plate starts as when it is switched on: white, so
 *  dark lettering reads on a busy picture. */
export const WHITE: ColorValue = { hex: '#ffffff', model: 'hex' };
export const DEFAULT_HALO: NonNullable<LabelStyle['halo']> = { color: WHITE, width: { value: 2, unit: 'px' } };
export const DEFAULT_PADDING: Dimension = { value: 2, unit: 'px' };
/** A plate's outline when it is switched on (#1058): a hairline in the
 *  words' colour. */
export const DEFAULT_BORDER_WIDTH: Dimension = { value: 0.5, unit: 'pt' };
export const LINE_UNITS: DimensionUnit[] = ['pt', 'px', 'mm'];
/** The dash patterns the leader's look offers (#1057): solid (none
 *  written), dashed and dotted, in points. */
export const DASHES: Record<'dashed' | 'dotted', Dimension[]> = {
  dashed: [{ value: 3, unit: 'pt' }, { value: 2, unit: 'pt' }],
  dotted: [{ value: 0.75, unit: 'pt' }, { value: 1.5, unit: 'pt' }],
};
type DashName = 'solid' | 'dashed' | 'dotted' | 'custom';
/** Which of {@link DASHES} a dash pattern is. */
export function dashName(dash: Dimension[] | undefined): DashName {
  if (!dash || dash.length === 0) return 'solid';
  for (const name of ['dashed', 'dotted'] as const) {
    const d = DASHES[name];
    if (d.length === dash.length && d.every((x, i) => x.value === dash[i]!.value && x.unit === dash[i]!.unit)) return name;
  }
  return 'custom';
}
/** The leader look of a style with `patch` applied: an undefined value takes
 *  the key off; the look stays (as `{}`) while the leader is on. */
export function withLeaderLook(look: LeaderStyle | undefined, patch: Partial<LeaderStyle>): LeaderStyle {
  const next: LeaderStyle = { ...(look ?? {}), ...patch };
  for (const k of Object.keys(patch) as (keyof LeaderStyle)[]) if (patch[k] === undefined) delete next[k];
  return next;
}
/** The value of the select that stands for "the field is not written". */
export const INHERIT = '__inherit__';
export const NO_PARAGRAPH_STYLE = '';

export const inputClass = 'min-w-0 flex-1 rounded border bg-transparent px-1.5 py-1 text-xs';
export const inputStyle = { borderColor: 'var(--pt-control-border)', color: 'var(--foreground)' } as const;

/** Turn free text into a `style="…"`-friendly id. */
export function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function nextStyleId(existing: LabelStyle[]): string {
  const taken = new Set(existing.map((s) => s.id));
  let n = existing.length + 1;
  while (taken.has(`label-${n}`)) n++;
  return `label-${n}`;
}
