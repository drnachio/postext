import { DEFAULT_BINDING_MEASURES } from '../defaults/output/production.js';
import type {
  BindingMeasures,
  BindingProfile,
  ProductionLength,
  ProductionVersion,
  TrimMm,
} from '../types/output/production.js';

/** A {@link ProductionLength} for a trim, mm. */
export function resolveLength(length: ProductionLength, trim: TrimMm): number {
  if (typeof length === 'number') return length;
  if (Array.isArray(length)) {
    const step = length.find((s) => !s.upTo || (trim.width <= s.upTo.width && trim.height <= s.upTo.height));
    return (step ?? length[length.length - 1])?.mm ?? 0;
  }
  const raw = length.ratio * (length.of === 'height' ? trim.height : trim.width);
  return Math.min(length.max ?? Infinity, Math.max(length.min ?? -Infinity, raw));
}

/** Every measure of a binding as millimetres for one trim. */
export type ResolvedBindingMeasures = { [K in keyof BindingMeasures]: number };

/** The measures of a version for its trim: the defaults of its binding
 *  style, under the profile's, under the version's own overrides. */
export function resolveBindingMeasures(
  profile: BindingProfile,
  trim: TrimMm,
  overrides?: ProductionVersion['overrides'],
): ResolvedBindingMeasures {
  const merged: BindingMeasures = { ...DEFAULT_BINDING_MEASURES[profile.style], ...profile.measures };
  const out = {} as ResolvedBindingMeasures;
  for (const key of Object.keys(merged) as (keyof BindingMeasures)[]) {
    const own = overrides?.[key];
    out[key] = own !== undefined ? own : resolveLength(merged[key], trim);
  }
  return out;
}

/** A book a binding profile cannot make: its trim or spine is outside the
 *  profile's `accepts`. */
export interface ProfileOutOfRangeWarning {
  kind: 'profileOutOfRange';
  profile: string;
  measure: 'trimWidth' | 'trimHeight' | 'spine';
  /** The book's value and the limit it passes, mm. */
  value: number;
  limit: number;
  side: 'min' | 'max';
}

/** What of a book a binding profile does not accept. */
export function checkProfileAccepts(profile: BindingProfile, trim: TrimMm, spine: number): ProfileOutOfRangeWarning[] {
  const out: ProfileOutOfRangeWarning[] = [];
  const a = profile.accepts;
  if (!a) return out;
  const push = (measure: ProfileOutOfRangeWarning['measure'], value: number, limit: number | undefined, side: 'min' | 'max') => {
    if (limit === undefined) return;
    if (side === 'min' ? value < limit : value > limit) out.push({ kind: 'profileOutOfRange', profile: profile.id, measure, value, limit, side });
  };
  push('trimWidth', trim.width, a.trim?.min?.width, 'min');
  push('trimHeight', trim.height, a.trim?.min?.height, 'min');
  push('trimWidth', trim.width, a.trim?.max?.width, 'max');
  push('trimHeight', trim.height, a.trim?.max?.height, 'max');
  push('spine', spine, a.spine?.min, 'min');
  push('spine', spine, a.spine?.max, 'max');
  return out;
}
