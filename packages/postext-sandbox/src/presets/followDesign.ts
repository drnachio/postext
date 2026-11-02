// A book opened from a preset, edited, after the preset's design changed
// (#1381). The text stays the reader's: what follows is the design, field
// by field, except the fields the reader changed.

import { diffConfigLayers, mergeConfigLayers, type PostextConfig, type Resource } from 'postext';
import { presetSharedConfig, rebaseEdition, type ConfigLayers } from '../editions/configLayers.js';
import { hashChapters, hashConfig, hashResources } from './hash.js';
import type { AppliedPresetSnapshot, LoadedPreset } from './types.js';
import type { Chapter } from '../book/types.js';

export interface FollowDesignInput {
  /** The preset as its source has it now. */
  fresh: LoadedPreset;
  /** The source's fingerprint now. */
  live: string | null;
  /** The book's configuration. */
  config: PostextConfig;
  chapters: readonly Chapter[];
  resources: Resource[];
  /** The preset's configuration the book was applied from. */
  base: PostextConfig | null;
  layers: ConfigLayers | null;
  /** The whole copy of the general settings stored before #1381, if any. */
  storedCopy?: PostextConfig | null;
  snapshot: AppliedPresetSnapshot;
}

export interface FollowedDesign {
  config: PostextConfig;
  layers: ConfigLayers | null;
  snapshot: AppliedPresetSnapshot;
  /** Nothing else of the source is new: no reload left to offer. */
  current: boolean;
}

/** The book on the preset's design now, or null when it already is. General
 *  settings kept as a whole copy (before #1381) cannot tell the reader's
 *  changes from the design of the day they were written: they give way to
 *  the preset's own. A copy of the built-in guide whose text and resources
 *  nobody edited goes back to the original whole, once. */
export function followPresetDesign({ fresh, live, config, chapters, resources, base, layers, storedCopy, snapshot }: FollowDesignInput): FollowedDesign | null {
  const original = presetSharedConfig(fresh);
  const wholeCopy = original && (layers && !layers.base ? layers.shared : storedCopy) || null;
  const moved = !!base && hashConfig(base) !== hashConfig(fresh.config);
  if (!wholeCopy && !moved) return null;
  let next = config;
  if (wholeCopy && original) next = rebaseEdition(wholeCopy, original, next);
  if (moved) next = rebaseEdition(base, fresh.config, next);
  if (wholeCopy && fresh.summary.source === 'builtin' && hashChapters(chapters) === snapshot.markdownHash && hashResources(resources) === snapshot.resourcesHash) next = fresh.config;
  const nextLayers: ConfigLayers | null = !original
    ? null
    : {
        scope: layers?.scope ?? 'all',
        base: original,
        shared: layers?.base ? mergeConfigLayers(original, diffConfigLayers(layers.base, layers.shared)) : original,
      };
  const current = hashChapters(fresh.chapters) === snapshot.markdownHash && hashResources(fresh.resources) === snapshot.resourcesHash;
  return {
    config: next,
    layers: nextLayers,
    snapshot: { ...snapshot, configHash: hashConfig(fresh.config), ...(current ? { fingerprint: live } : {}) },
    current,
  };
}
