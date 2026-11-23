// The book's own printer profiles edited as data (#1669): binding profiles
// (a printer's measures for a binding style) and paper profiles, kept in
// `config.production` with the versions, exchanged as the engine's
// `.postext-production.json`.

import {
  BUILT_IN_BINDING_PROFILES,
  type BindingMeasures,
  type BindingProfile,
  type PaperProfile,
  type ProductionConfig,
  type ProductionLength,
} from 'postext/production';

/** The measures in the order the panel lists them, by the part of the
 *  binding they belong to. */
export const MEASURE_GROUPS: readonly { id: 'sheet' | 'softcover' | 'case' | 'jacket' | 'endpapers'; keys: readonly (keyof BindingMeasures)[] }[] = [
  { id: 'sheet', keys: ['bleed', 'safeMargin', 'designMargin'] },
  { id: 'softcover', keys: ['spineAllowance', 'hingeScore', 'flapWidth', 'flapFoldInset'] },
  { id: 'case', keys: ['board', 'square', 'joint', 'turnIn', 'boardSetback', 'caseSpineAllowance', 'roundSpineAllowance'] },
  { id: 'jacket', keys: ['jacketFoldAllowance', 'jacketFlapWidth', 'jacketBleed'] },
  { id: 'endpapers', keys: ['endpaperGlueStrip', 'endpaperBleed'] },
];

/** An id not yet taken among `ids`: `base`, then `base-2`… */
export function freeId(ids: Iterable<string>, base: string): string {
  const taken = new Set(ids);
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

function tidy(production: ProductionConfig): ProductionConfig | undefined {
  const next: Record<string, unknown> = { ...production };
  for (const k of ['bindings', 'papers'] as const) if (Array.isArray(next[k]) && (next[k] as unknown[]).length === 0) delete next[k];
  return Object.keys(next).length > 0 ? (next as ProductionConfig) : undefined;
}

/** Fields set to `undefined` are removed. */
function patched<T extends object>(item: T, patch: Partial<T>): T {
  const next: Record<string, unknown> = { ...item, ...patch };
  for (const [k, v] of Object.entries(next)) if (v === undefined) delete next[k];
  return next as T;
}

/** The production with a binding profile of its own, a copy of `from`
 *  (a built-in profile or one of the book's) named `name`. */
export function addBinding(production: ProductionConfig | undefined, from: BindingProfile, name: string): { production: ProductionConfig; id: string } {
  const own = production?.bindings ?? [];
  const id = freeId([...BUILT_IN_BINDING_PROFILES, ...own].map((b) => b.id), `${from.id}-own`);
  const copy: BindingProfile = { ...structuredClone(from), id, name };
  return { production: { ...production, bindings: [...own, copy] }, id };
}

export function updateBinding(production: ProductionConfig | undefined, id: string, patch: Partial<BindingProfile>): ProductionConfig | undefined {
  const bindings = (production?.bindings ?? []).map((b) => (b.id === id ? patched(b, patch) : b));
  return tidy({ ...production, bindings });
}

/** A measure of a profile set (or, `undefined`, given back to the style's
 *  default). */
export function setMeasure(profile: BindingProfile, key: keyof BindingMeasures, length: ProductionLength | undefined): Partial<BindingProfile> {
  const measures: Partial<BindingMeasures> = { ...profile.measures };
  if (length === undefined) delete measures[key];
  else measures[key] = length as never;
  return { measures: Object.keys(measures).length > 0 ? measures : undefined };
}

/** The versions bound with a profile. */
export function versionsBoundWith(production: ProductionConfig | undefined, id: string): string[] {
  return (production?.versions ?? []).filter((v) => (typeof v.binding === 'string' ? v.binding : v.binding.id) === id).map((v) => v.name);
}

export function removeBinding(production: ProductionConfig | undefined, id: string): ProductionConfig | undefined {
  return tidy({ ...production, bindings: (production?.bindings ?? []).filter((b) => b.id !== id) });
}

/** The production with a new paper profile named `name`. */
export function addPaper(production: ProductionConfig | undefined, name: string): { production: ProductionConfig; id: string } {
  const own = production?.papers ?? [];
  const id = freeId(own.map((p) => p.id), 'paper');
  return { production: { ...production, papers: [...own, { id, name, type: 'bookWove', grammage: 80 }] }, id };
}

export function updatePaper(production: ProductionConfig | undefined, id: string, patch: Partial<PaperProfile>): ProductionConfig | undefined {
  return tidy({ ...production, papers: (production?.papers ?? []).map((p) => (p.id === id ? patched(p, patch) : p)) });
}

export function removePaper(production: ProductionConfig | undefined, id: string): ProductionConfig | undefined {
  return tidy({ ...production, papers: (production?.papers ?? []).filter((p) => p.id !== id) });
}

/** Profiles read from a file added to the book's: one with an id the book
 *  has replaces it. */
export function mergeProfiles(production: ProductionConfig | undefined, papers: readonly PaperProfile[], bindings: readonly BindingProfile[]): ProductionConfig | undefined {
  const keep = <T extends { id: string }>(own: readonly T[] | undefined, incoming: readonly T[]) => [...(own ?? []).filter((o) => !incoming.some((i) => i.id === o.id)), ...incoming];
  return tidy({ ...production, papers: keep(production?.papers, papers), bindings: keep(production?.bindings, bindings) });
}
