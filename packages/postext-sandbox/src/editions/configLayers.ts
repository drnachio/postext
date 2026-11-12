// A book in several languages keeps its design in two layers (#1209): the
// general settings every edition reads, and per edition the fields it sets
// differently. The Sandbox stores each edition's configuration whole (what
// it lays out with, as before) beside the general settings
// (`ProjectRecord.sharedConfig`); an edition's own fields are the
// difference between the two, worked out when they are needed.

import type { PostextConfig, ConfigOverride } from 'postext';
import { defaultResourceTypes, diffConfigLayers, leastConfigOverride, mergeConfigLayers, overridePaths, sameConfig, stripConfigDefaults, REMOVE_ENTRY } from 'postext';

/** Where the Design panel writes: the general settings, or the edition on
 *  screen alone. */
export type ConfigScope = 'all' | 'edition';

/** The general settings and the scope the Design panel edits in, for a
 *  book with two or more editions. */
export interface ConfigLayers {
  shared: PostextConfig;
  scope: ConfigScope;
  /** A preset's own general settings as it was applied: what the reader's
   *  changes are measured against (#1381). Absent for a project. */
  base?: PostextConfig;
}

/** A built-in resource type's fields, each language's own (its names,
 *  caption prefix, numbering template). */
const builtInFields = (t: Record<string, unknown>): string[] => Object.keys(t).filter((k) => k !== 'id');

const languageOf = (config: PostextConfig): string | undefined => config.locale ?? config.bodyText?.hyphenation?.locale;

/** `config` with what the built-in resource types of `locale` say left
 *  out ("Figure" in English, "Figura" in Spanish, the Arabic numbering):
 *  every edition reads its own language's, so it is no setting of the
 *  book's nor of an edition's. What a reader typed stays. */
function withoutBuiltInWording(config: PostextConfig, locale: string | undefined): PostextConfig {
  if (!locale || !config.resourceTypes) return config;
  const builtIn = new Map(defaultResourceTypes(locale).map((t) => [t.id, t as unknown as Record<string, unknown>]));
  const types = config.resourceTypes.map((t) => {
    const own = builtIn.get(t.id);
    if (!own) return t;
    const out = { ...(t as unknown as Record<string, unknown>) };
    for (const k of builtInFields(own)) if (out[k] !== undefined && JSON.stringify(out[k]) === JSON.stringify(own[k])) delete out[k];
    return out as unknown as typeof t;
  });
  return { ...config, resourceTypes: types };
}

/** `config` with the built-in resource types of `locale` filled in
 *  wherever its own say nothing. */
function withBuiltInWording(config: PostextConfig, locale: string | undefined): PostextConfig {
  if (!locale || !config.resourceTypes) return config;
  const builtIn = new Map(defaultResourceTypes(locale).map((t) => [t.id, t as unknown as Record<string, unknown>]));
  const types = config.resourceTypes.map((t) => {
    const own = builtIn.get(t.id);
    if (!own) return t;
    const out = { ...(t as unknown as Record<string, unknown>) };
    for (const k of builtInFields(own)) if (out[k] === undefined && own[k] !== undefined) out[k] = own[k];
    return out as unknown as typeof t;
  });
  return { ...config, resourceTypes: types };
}

/** The general settings as the Design panel shows them beside the edition
 *  on screen: with that edition's built-in resource types, which the
 *  general settings leave to each language. */
export function generalSettingsView(shared: PostextConfig, edition: PostextConfig): PostextConfig {
  return withBuiltInWording(shared, languageOf(edition));
}

/** General settings written from that view: the built-in resource types
 *  of the edition on screen taken out again. */
export function generalSettingsFrom(view: PostextConfig, edition: PostextConfig): PostextConfig {
  return withoutBuiltInWording(view, languageOf(edition));
}

/** The general settings a book starts with when its editions had none: the
 *  primary edition's configuration without its language and its resource
 *  types' built-in wording, which are every edition's own. */
export function initialSharedConfig(primary: PostextConfig): PostextConfig {
  const { locale: _locale, ...rest } = withoutBuiltInWording(primary, languageOf(primary));
  void _locale;
  // Not stripped of defaults: which values are defaults depends on each
  // edition's language, and a general value set on purpose stays set.
  return rest as PostextConfig;
}

/** An edition rebuilt from the general settings and its own fields: the
 *  built-in wording of its language filled in, its defaults stripped. */
function editionFrom(shared: PostextConfig, override: ConfigOverride, locale: string | undefined): PostextConfig {
  const merged = mergeConfigLayers(shared, override);
  return stripConfigDefaults(withBuiltInWording(merged, languageOf(merged) ?? locale));
}

/** The fields `edition` sets differently from `shared`: the override that
 *  rebuilds it. A `null` the edition reads the same without (the shared
 *  value is its default too, which stripping took out of the stored
 *  edition) is left out, so only real differences show as its own. */
export function editionOverride(shared: PostextConfig, edition: PostextConfig): ConfigOverride {
  return leastConfigOverride(shared, withoutBuiltInWording(edition, languageOf(edition)), stripConfigDefaults);
}

/** `edition` after the general settings went from `before` to `after`: its
 *  own fields kept, everything else read from the new general settings. */
export function rebaseEdition(before: PostextConfig, after: PostextConfig, edition: PostextConfig): PostextConfig {
  if (before === after) return edition;
  return editionFrom(after, withoutOrphans(editionOverride(before, edition), before, after), languageOf(edition));
}

/** `override` without its changes to list entries the general settings
 *  had (`before`) and no longer have (`after`): the entry went for every
 *  language, and what an edition changed of it would be left without the
 *  rest of it. */
function withoutOrphans(override: ConfigOverride, before: unknown, after: unknown): ConfigOverride {
  const walk = (o: unknown, b: unknown, a: unknown, key: string): unknown => {
    if (Array.isArray(o)) {
      const field = key === 'levels' ? 'level' : key === 'customFonts' ? 'name' : 'id';
      if (!o.every((e) => isPlainObject(e) && e[field] !== undefined)) return o;
      const find = (list: unknown, k: unknown) => (Array.isArray(list) ? list.find((x) => isPlainObject(x) && x[field] === k) : undefined);
      const out = o.flatMap((e) => {
        const entry = e as Json;
        if (entry[REMOVE_ENTRY] === true) return [entry];
        const was = find(b, entry[field]);
        const is = find(a, entry[field]);
        if (was !== undefined && is === undefined) return [];
        return was !== undefined ? [walk(entry, was, is, '') as Json] : [entry];
      });
      return out;
    }
    if (isPlainObject(o) && !('hex' in o) && !('value' in o && 'unit' in o)) {
      const out: Json = {};
      for (const [k, v] of Object.entries(o)) out[k] = walk(v, isPlainObject(b) ? b[k] : undefined, isPlainObject(a) ? a[k] : undefined, k);
      return out;
    }
    return o;
  };
  return walk(override, before, after, '') as ConfigOverride;
}

/** The edition with its own value at each of `paths` given back: those
 *  fields read the general settings again. */
export function withoutOwnFields(shared: PostextConfig, edition: PostextConfig, paths: readonly string[]): PostextConfig {
  const override = removePaths(editionOverride(shared, edition), paths);
  return editionFrom(shared, override, languageOf(edition));
}

/** The general settings with the edition's value at each of `paths`: what
 *  "apply to every language" writes. */
export function promoteFields(shared: PostextConfig, edition: PostextConfig, paths: readonly string[]): PostextConfig {
  const own = editionOverride(shared, edition);
  const keep = removePaths(own, paths);
  const taken = diffConfigLayers(keep as PostextConfig, own as PostextConfig);
  return stripConfigDefaults(mergeConfigLayers(shared, taken));
}

/** Whether two setting paths name the same field, or one holds the other
 *  (`bodyText` and `bodyText.fontSize`). */
export function pathsMeet(a: string, b: string): boolean {
  if (a === b) return true;
  const holds = (outer: string, inner: string) => inner.startsWith(outer) && (inner[outer.length] === '.' || inner[outer.length] === '[');
  return holds(a, b) || holds(b, a);
}

/** The paths of `override` that meet any of `paths`. */
export function ownPathsAt(override: ConfigOverride, paths: readonly string[]): string[] {
  return overridePaths(override).filter((o) => paths.some((p) => pathsMeet(o, p)));
}

type Json = Record<string, unknown>;
const isPlainObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/** `override` without what it sets at or under each of `paths`. */
export function removePaths(override: ConfigOverride, paths: readonly string[]): ConfigOverride {
  const walk = (node: unknown, path: string, key: string): unknown => {
    if (paths.some((p) => path !== '' && (p === path || pathsMeet(p, path) && p.length <= path.length))) return undefined;
    if (Array.isArray(node)) {
      const field = key === 'levels' ? 'level' : key === 'customFonts' ? 'name' : 'id';
      if (!node.every((e) => isPlainObject(e) && e[field] !== undefined)) return node;
      const out = node
        .map((e) => {
          const entry = e as Json;
          const at = `${path}[${field}=${String(entry[field])}]`;
          if (entry[REMOVE_ENTRY] === true) return paths.some((p) => pathsMeet(p, at)) ? undefined : entry;
          const rest = walk(Object.fromEntries(Object.entries(entry).filter(([k]) => k !== field)), at, '');
          return rest === undefined || (isPlainObject(rest) && Object.keys(rest).length === 0) ? undefined : { [field]: entry[field], ...(rest as Json) };
        })
        .filter((e) => e !== undefined);
      return out.length > 0 ? out : undefined;
    }
    if (isPlainObject(node) && !('hex' in node) && !('value' in node && 'unit' in node)) {
      const out: Json = {};
      for (const [k, v] of Object.entries(node)) {
        const kept = walk(v, path ? `${path}.${k}` : k, k);
        if (kept !== undefined) out[k] = kept;
      }
      return path !== '' && Object.keys(out).length === 0 ? undefined : out;
    }
    return node;
  };
  return (walk(override, '', '') as ConfigOverride | undefined) ?? {};
}

/** The general settings a preset in several languages ships (its bundle's
 *  shared configuration, or the built-in guide's), as the Sandbox keeps
 *  them; null for a preset in one language. */
export function presetSharedConfig(loaded: { sharedConfig?: PostextConfig; summary: { locales?: readonly string[] } }): PostextConfig | null {
  if (!loaded.sharedConfig || (loaded.summary.locales?.length ?? 0) < 2) return null;
  return initialSharedConfig(loaded.sharedConfig);
}

/** What {@link recordSharedConfig} reads of a stored book. */
interface LayeredRecord {
  config: PostextConfig;
  locale?: string;
  editions?: Record<string, { config: PostextConfig }>;
  editionLocales?: string[];
  sharedConfig?: PostextConfig;
}

/** The general settings of a stored book in several languages: the ones it
 *  keeps, else its primary edition's (see {@link initialSharedConfig}).
 *  Null for a book in one language. */
export function recordSharedConfig(record: LayeredRecord): PostextConfig | null {
  if (!record.editions || Object.keys(record.editions).length === 0) return null;
  if (record.sharedConfig) return record.sharedConfig;
  const first = record.editionLocales?.[0];
  const aside = first !== undefined && first !== record.locale ? record.editions[first] : undefined;
  return initialSharedConfig(aside?.config ?? record.config);
}

/** The editions kept aside after the general settings went from `before`
 *  to `after`, each keeping its own fields. */
export function rebaseEditions<E extends { config: PostextConfig }>(before: PostextConfig, after: PostextConfig, editions: Record<string, E>): Record<string, E> {
  if (sameConfig(before, after)) return editions;
  return Object.fromEntries(Object.entries(editions).map(([k, e]) => [k, { ...e, config: rebaseEdition(before, after, e.config) }]));
}

/** The general settings with the words `edition` gives the design texts
 *  they leave without any: a book in several languages keeps a text
 *  element's `content` (a kicker, a running title) in each edition, so its
 *  general settings hold the element without words. A design is taken
 *  from these (#1523), so it holds no text element the engine cannot set.
 *  Entries of a list are matched on their `id` (heading levels on
 *  `level`), as the layers match them. */
export function generalSettingsWithWording(shared: PostextConfig, edition: PostextConfig): PostextConfig {
  const keyOf = (e: unknown): unknown => (isPlainObject(e) ? e.id ?? e.level : undefined);
  const walk = (node: unknown, own: unknown): unknown => {
    if (Array.isArray(node)) {
      const list: unknown[] = Array.isArray(own) ? own : [];
      return node.map((e, i) => {
        const k = keyOf(e);
        return walk(e, k !== undefined ? list.find((o) => keyOf(o) === k) : list[i]);
      });
    }
    if (!isPlainObject(node)) return node;
    const out: Json = {};
    for (const [k, v] of Object.entries(node)) out[k] = walk(v, isPlainObject(own) ? own[k] : undefined);
    if (node.kind === 'text' && node.content === undefined && isPlainObject(own) && typeof own.content === 'string') out.content = own.content;
    return out;
  };
  return walk(shared, edition) as PostextConfig;
}
