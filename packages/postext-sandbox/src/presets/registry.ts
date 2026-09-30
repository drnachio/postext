import { matchContentLocale } from 'postext';
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
 *  (exact tag, then the same language — and script, for Chinese); otherwise
 *  the first default. */
export function findDefaultPrivatePreset(
  providers: PresetProvider[],
  locale: string,
): PresetProvider | null {
  const candidates = providers.filter((p) => p.summary.source === 'private' && p.summary.default);
  if (candidates.length === 0) return null;
  const tags = candidates.map((p) => p.summary.locale ?? '');
  const match = matchContentLocale(tags, locale);
  return (match !== undefined ? candidates[tags.indexOf(match)] : undefined) ?? candidates[0] ?? null;
}
