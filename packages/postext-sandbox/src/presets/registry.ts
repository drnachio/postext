import { createRemotePreset, fetchPresetIndexEntries } from './remote';
import type { PresetProvider, PresetSourceSpec } from './types';

export interface ListPresetsOptions {
  sources: PresetSourceSpec[];
  builtin: PresetProvider;
}

/** Collect every available preset provider: the built-in one first, then each
 *  source's index in order. Duplicate ids keep the first occurrence. Sources
 *  that fail to respond simply contribute nothing. */
export async function listPresets({ sources, builtin }: ListPresetsOptions): Promise<PresetProvider[]> {
  const perSource = await Promise.all(
    sources.map(async (src) => {
      const kind = src.private ? 'private' : 'public';
      const entries = await fetchPresetIndexEntries(src.url);
      return entries.map((entry) => createRemotePreset(src.url, entry, kind));
    }),
  );

  const seen = new Set<string>();
  const out: PresetProvider[] = [];
  for (const p of [builtin, ...perSource.flat()]) {
    if (seen.has(p.summary.id)) continue;
    seen.add(p.summary.id);
    out.push(p);
  }
  return out;
}

/** Among private presets flagged `default`, pick the one matching `locale`
 *  (exact tag, then base language); otherwise the first default. */
export function findDefaultPrivatePreset(
  providers: PresetProvider[],
  locale: string,
): PresetProvider | null {
  const candidates = providers.filter((p) => p.summary.source === 'private' && p.summary.default);
  if (candidates.length === 0) return null;
  const wanted = locale.toLowerCase();
  const base = wanted.split(/[-_]/)[0];
  const exact = candidates.find((p) => p.summary.locale?.toLowerCase() === wanted);
  if (exact) return exact;
  const byBase = candidates.find((p) => p.summary.locale?.toLowerCase().split(/[-_]/)[0] === base);
  if (byBase) return byBase;
  return candidates[0];
}
