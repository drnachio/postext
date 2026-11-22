/**
 * The 3D book of a version (#1668): Folio binds the book as the version
 * it shows is bound, with the binding's settings under the book's own
 * `folio` settings, which always win.
 */

import type { FolioBindingConfig, FolioConfig } from '../types/output/folio.js';
import type { ProductionConfig, ProductionVersion } from '../types/output/production.js';
import { FOLIO_BINDING_OF_STYLE } from './measures.js';
import { findBindingProfile, isCaseBinding } from './version.js';

/** The version Folio shows: the one named, else the book's first. */
export function folioVersionOf(production: ProductionConfig | undefined, versionId?: string): ProductionVersion | undefined {
  const versions = production?.versions ?? [];
  return (versionId !== undefined ? versions.find((v) => v.id === versionId) : undefined) ?? versions[0];
}

/** The binding a version gives Folio's book: how it is bound and what its
 *  cover is made of (a cloth case, else a printed one). Undefined when
 *  the book has no version or its binding profile is not found. */
export function productionFolioBinding(production: ProductionConfig | undefined, versionId?: string): FolioBindingConfig | undefined {
  const version = folioVersionOf(production, versionId);
  if (!version) return undefined;
  const profile = findBindingProfile(version.binding, production?.bindings);
  if (!profile) return undefined;
  const cloth = isCaseBinding(profile.style) && version.caseMaterial === 'cloth';
  return { type: FOLIO_BINDING_OF_STYLE[profile.style], coverMaterial: cloth ? 'cloth' : 'paper' };
}

/** A book's `folio` settings with its version's binding under them: what
 *  Folio shows when the Design settings leave the binding alone. The book's
 *  own `folio` when it has no version. */
export function folioOfBook(config: { folio?: FolioConfig; production?: ProductionConfig }, versionId?: string): FolioConfig | undefined {
  const binding = productionFolioBinding(config.production, versionId);
  if (!binding) return config.folio;
  return { ...config.folio, binding: { ...binding, ...config.folio?.binding } };
}
