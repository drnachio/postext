// Remote presets: an `index.json` at a base URL lists preset directories, each
// holding a `preset.json` manifest plus its markdown, resource and font files.
// Loading fetches everything into memory; nothing is written to storage here
// (see apply.ts).

import { parseBundle } from './bundle';
import { isPresetIndex } from './manifest';
import type {
  LoadedPreset,
  PresetIndexEntry,
  PresetProvider,
  PresetSource,
  PresetSummary,
} from './types';

/** Virtual file whose GET yields `{ fingerprint }` for a preset directory. */
export const FINGERPRINT_FILE = 'fingerprint.json';

function trimSlashes(s: string): string {
  return s.replace(/\/+$/, '');
}

/** Join URL path parts, URI-encoding every segment of each part. */
function presetUrl(baseUrl: string, ...parts: string[]): string {
  const encoded = parts
    .flatMap((p) => p.split('/'))
    .filter((seg) => seg.length > 0)
    .map(encodeURIComponent);
  return `${trimSlashes(baseUrl)}/${encoded.join('/')}`;
}

async function fetchOk(url: string): Promise<Response> {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText} for ${url}`);
  return res;
}

/** Fetch and validate a source's `index.json`. Any failure (404, network,
 *  malformed JSON) yields no entries — a missing private source is the normal
 *  case in production, so this only logs at debug level. */
export async function fetchPresetIndexEntries(baseUrl: string): Promise<PresetIndexEntry[]> {
  if (typeof fetch === 'undefined') return [];
  try {
    const res = await fetchOk(presetUrl(baseUrl, 'index.json'));
    const data: unknown = await res.json();
    if (!isPresetIndex(data)) {
      console.debug('[postext-sandbox] ignoring malformed preset index at', baseUrl);
      return [];
    }
    return data.presets;
  } catch (err) {
    console.debug('[postext-sandbox] no presets at', baseUrl, err);
    return [];
  }
}

export function summaryFromEntry(entry: PresetIndexEntry, source: PresetSource): PresetSummary {
  return {
    id: entry.id,
    name: entry.name,
    description: entry.description,
    locale: entry.locale,
    default: entry.default,
    source,
    available: true,
  };
}

/** Summaries of every preset a source lists; empty on any failure. */
export async function fetchPresetIndex(baseUrl: string, source: PresetSource): Promise<PresetSummary[]> {
  const entries = await fetchPresetIndexEntries(baseUrl);
  return entries.map((e) => summaryFromEntry(e, source));
}

export function createRemotePreset(
  baseUrl: string,
  entry: PresetIndexEntry,
  source: PresetSource,
): PresetProvider {
  const summary = summaryFromEntry(entry, source);
  const fileUrl = (file: string) => presetUrl(baseUrl, entry.dir, file);

  return {
    summary,
    // `<dir>/fingerprint.json` is served by the source (a virtual file on the
    // dev route) and changes whenever any bundle file does. Every failure —
    // static hosts without it, network errors, malformed body — is "unknown".
    async fingerprint(): Promise<string | null> {
      if (typeof fetch === 'undefined') return null;
      try {
        const res = await fetch(fileUrl(FINGERPRINT_FILE), { cache: 'no-store' });
        if (!res.ok) return null;
        const data: unknown = await res.json();
        const fp = (data as { fingerprint?: unknown } | null)?.fingerprint;
        return typeof fp === 'string' && fp.length > 0 ? fp : null;
      } catch {
        return null;
      }
    },
    async load(locale: string): Promise<LoadedPreset> {
      const manifestRes = await fetchOk(fileUrl('preset.json'));
      const manifest: unknown = await manifestRes.json();
      return parseBundle(
        manifest,
        (file) => fetchOk(fileUrl(file)).then((r) => r.arrayBuffer()),
        {
          locale,
          summary,
          onWarning: (w) => console.debug('[postext-sandbox] preset font skipped:', w),
        },
      );
    },
  };
}
