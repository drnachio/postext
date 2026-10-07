// Pure edits of `PostextConfig.comics` for the Comics settings sections:
// every write goes through `pruneComics`, so a field put back to its unset
// state leaves no empty object behind and an untouched section stores
// nothing.

import type { ComicCastMember, ComicsConfig, PageMargins } from 'postext';
import { DEFAULT_BALLOON_STYLE_IDS } from 'postext';

type Nested = 'panel' | 'lettering' | 'gutter';

function isEmptyObject(v: unknown): boolean {
  return typeof v === 'object' && v !== null && !Array.isArray(v) && Object.values(v).every((x) => x === undefined);
}

/** Drop unset fields, empty sub-objects and empty lists; undefined when
 *  nothing is left (the config then has no `comics` key). */
export function pruneComics(config: ComicsConfig | undefined): ComicsConfig | undefined {
  if (!config) return undefined;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(config)) {
    if (v === undefined) continue;
    if (Array.isArray(v)) {
      if (v.length > 0) out[k] = v;
      continue;
    }
    if (typeof v === 'object' && v !== null) {
      if (k === 'frame') {
        const margins = (v as { margins?: PageMargins }).margins;
        if (margins && !isEmptyObject(margins)) out[k] = { margins };
        continue;
      }
      const inner = Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined));
      if (Object.keys(inner).length > 0) out[k] = inner;
      continue;
    }
    out[k] = v;
  }
  return Object.keys(out).length > 0 ? (out as ComicsConfig) : undefined;
}

/** Set (or, with `undefined`, unset) a top-level comics field. */
export function setComicsField<K extends keyof ComicsConfig>(config: ComicsConfig | undefined, key: K, value: ComicsConfig[K] | undefined): ComicsConfig | undefined {
  return pruneComics({ ...config, [key]: value });
}

/** Set (or unset) a field of `panel`, `lettering` or `gutter`. */
export function setNestedField<S extends Nested, K extends keyof NonNullable<ComicsConfig[S]>>(
  config: ComicsConfig | undefined,
  section: S,
  key: K,
  value: NonNullable<ComicsConfig[S]>[K] | undefined,
): ComicsConfig | undefined {
  const inner = { ...(config?.[section] as Record<string, unknown> | undefined), [key as string]: value };
  return pruneComics({ ...config, [section]: inner });
}

/** Whether `id` names one of the built-in balloon styles (always present;
 *  a config entry only changes it). */
export function isBuiltInBalloonStyle(id: string): boolean {
  return DEFAULT_BALLOON_STYLE_IDS.includes(id);
}

/** Lay `partial` over the entry of `id` (added when the list has none). */
export function upsertById<T extends { id: string }>(list: readonly T[] | undefined, id: string, partial: Partial<T>): T[] {
  const items = list ?? [];
  if (!items.some((s) => s.id === id)) return [...items, { ...partial, id } as T];
  return items.map((s) => (s.id === id ? { ...s, ...partial, id } : s));
}

/** Unset one field of the entry of `id`. A built-in balloon style left
 *  with nothing of its own is dropped from the list. */
export function resetFieldById<T extends { id: string }>(list: readonly T[] | undefined, id: string, field: keyof T, dropWhenBare = false): T[] {
  const out: T[] = [];
  for (const s of list ?? []) {
    if (s.id !== id) {
      out.push(s);
      continue;
    }
    const next = { ...s };
    delete next[field];
    if (dropWhenBare && Object.keys(next).length === 1) continue;
    out.push(next);
  }
  return out;
}

/** Rename an entry, never onto an id the list already has. */
export function renameById<T extends { id: string }>(list: readonly T[] | undefined, id: string, nextId: string): T[] {
  const items = list ?? [];
  if (items.some((s) => s.id === nextId)) return [...items];
  return items.map((s) => (s.id === id ? { ...s, id: nextId } : s));
}

export function removeById<T extends { id: string }>(list: readonly T[] | undefined, id: string): T[] {
  return (list ?? []).filter((s) => s.id !== id);
}

/** `prefix-N`, the first one no entry uses. */
export function nextFreeId(prefix: string, taken: Iterable<string>, start = 1): string {
  const used = new Set(taken);
  let n = start;
  while (used.has(`${prefix}-${n}`)) n++;
  return `${prefix}-${n}`;
}

/** Free text as a style id (`{whisper}`, `style=…`): lowercase ASCII
 *  letters, digits, `_` and `-`. */
export function slugifyStyleId(raw: string): string {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/** Free text as a speaker id: the characters a script line's key takes
 *  (letters of any script, digits, `_ . -`), the rest dropped. */
export function sanitizeSpeakerId(raw: string): string {
  return raw.trim().replace(/[^\p{L}\p{N}_.-]+/gu, '');
}

/** Cast members that speak in `from` move to `to` (a balloon style
 *  renamed), or lose it (`to` undefined: the style deleted). */
export function retargetCast(cast: readonly ComicCastMember[] | undefined, from: string, to: string | undefined): ComicCastMember[] | undefined {
  if (!cast) return undefined;
  return cast.map((c) => {
    if (c.balloonStyle !== from) return c;
    const next = { ...c };
    if (to === undefined) delete next.balloonStyle;
    else next.balloonStyle = to;
    return next;
  });
}
