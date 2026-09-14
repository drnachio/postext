// Presets the user hid from the Projects panel. Presets are never stored
// locally (built-in + remote sources), so "delete" means hide, and a hidden
// preset can always be shown again. Pure list helpers.

import { BUILTIN_PRESET_ID } from './builtin';
import type { PresetSummary } from './types';

export function hidePresetId(ids: readonly string[], id: string): string[] {
  if (id === BUILTIN_PRESET_ID || ids.includes(id)) return [...ids];
  return [...ids, id];
}

export function unhidePresetId(ids: readonly string[], id: string): string[] {
  return ids.filter((x) => x !== id);
}

export function isPresetHideable(id: string): boolean {
  return id !== BUILTIN_PRESET_ID;
}

/** Split the summaries into shown and hidden lists; the built-in preset is
 *  always shown and ids that no longer match a preset are ignored. */
export function partitionPresets(
  presets: readonly PresetSummary[],
  hiddenIds: readonly string[],
): { visible: PresetSummary[]; hidden: PresetSummary[] } {
  const hiddenSet = new Set(hiddenIds);
  const visible: PresetSummary[] = [];
  const hidden: PresetSummary[] = [];
  for (const p of presets) {
    if (p.id !== BUILTIN_PRESET_ID && hiddenSet.has(p.id)) hidden.push(p);
    else visible.push(p);
  }
  return { visible, hidden };
}
