// The book's production versions edited as data (#1669): what the Cover
// panel and the tools write into `config.production`, which belongs to the
// book (kept, deleted and copied with it), never to its design.

import type { PostextConfig } from 'postext';
import { BUILT_IN_BINDING_PROFILES, type BindingProfile, type ProductionConfig, type ProductionVersion } from 'postext/production';

export type VersionKind = 'paperback' | 'hardcover';

/** The binding profiles a version may name: the built-in ones, then the
 *  book's own (an own profile with a built-in id replaces it). */
export function bindingProfiles(production: ProductionConfig | undefined): BindingProfile[] {
  const own = production?.bindings ?? [];
  return [...BUILT_IN_BINDING_PROFILES.filter((b) => !own.some((o) => o.id === b.id)), ...own];
}

/** The profile a version is bound with: the one it names, or its own. */
export function versionProfile(production: ProductionConfig | undefined, version: ProductionVersion): BindingProfile | undefined {
  return typeof version.binding === 'string' ? bindingProfiles(production).find((b) => b.id === version.binding) : version.binding;
}

/** An id not yet taken: `base`, then `base-2`, `base-3`… */
export function freeVersionId(versions: readonly ProductionVersion[], base: string): string {
  const taken = new Set(versions.map((v) => v.id));
  if (!taken.has(base)) return base;
  let n = 2;
  while (taken.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}

/** A new version of a kind: a perfect-bound paperback or a flat-spined
 *  case, named `name`. */
export function newVersion(versions: readonly ProductionVersion[], kind: VersionKind, name: string): ProductionVersion {
  return kind === 'paperback'
    ? { id: freeVersionId(versions, 'pb'), name, binding: 'perfect' }
    : { id: freeVersionId(versions, 'hc'), name, binding: 'case-flat', caseMaterial: 'printed' };
}

function withVersions(production: ProductionConfig | undefined, versions: ProductionVersion[]): ProductionConfig | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { versions: _old, ...rest } = production ?? {};
  const next: ProductionConfig = versions.length > 0 ? { ...rest, versions } : rest;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The production with a version added at the end. */
export function addVersion(production: ProductionConfig | undefined, version: ProductionVersion): ProductionConfig {
  return withVersions(production, [...(production?.versions ?? []), version])!;
}

/** The production with a version's fields changed; a field set to
 *  `undefined` is removed. */
export function updateVersion(production: ProductionConfig | undefined, id: string, patch: Partial<ProductionVersion>): ProductionConfig | undefined {
  const versions = (production?.versions ?? []).map((v) => {
    if (v.id !== id) return v;
    const next: Record<string, unknown> = { ...v, ...patch };
    for (const [k, val] of Object.entries(next)) if (val === undefined) delete next[k];
    return next as unknown as ProductionVersion;
  });
  return withVersions(production, versions);
}

/** The production without a version. */
export function removeVersion(production: ProductionConfig | undefined, id: string): ProductionConfig | undefined {
  return withVersions(production, (production?.versions ?? []).filter((v) => v.id !== id));
}

/** The production with its collection changed; an empty one goes. */
export function setCollection(production: ProductionConfig | undefined, collection: ProductionConfig['collection']): ProductionConfig | undefined {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { collection: _old, ...rest } = production ?? {};
  const keep = collection && (collection.name || collection.isbn || collection.catalogue?.length);
  const next: ProductionConfig = keep ? { ...rest, collection } : rest;
  return Object.keys(next).length > 0 ? next : undefined;
}

/** The config patch that writes a production. */
export const productionPatch = (production: ProductionConfig | undefined): Partial<PostextConfig> => ({ production });
