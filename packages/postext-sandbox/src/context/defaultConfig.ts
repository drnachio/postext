import type { PostextConfig, ResourceType } from 'postext';
import { cloneDefaultColorPalette, defaultResourceTypes } from 'postext';

/** The sandbox's pristine configuration: the default colour palette plus the
 *  built-in resource types localised to `locale`. Lives in its own module so
 *  both the context and the built-in preset can use it without a circular
 *  import. */
export function createDefaultConfig(locale = 'en'): PostextConfig {
  return { colorPalette: cloneDefaultColorPalette(), resourceTypes: defaultResourceTypes(locale) };
}

/** Ensure `config.resourceTypes` is populated, falling back to the built-in
 *  defaults when unset (e.g. configs persisted before the feature existed),
 *  localised like the engine localises them: to the document's language
 *  (`locale`, else its hyphenation locale), else to `locale`. Returns a new
 *  config object only when a change is needed. */
export function withDefaultResourceTypes(config: PostextConfig, locale = 'en'): PostextConfig {
  if (config.resourceTypes && config.resourceTypes.length > 0) return config;
  const language = config.locale ?? config.bodyText?.hyphenation?.locale ?? locale;
  return { ...config, resourceTypes: defaultResourceTypes(language) };
}

/** JSON with sorted keys and no `undefined`: two resource-type lists that
 *  say the same thing compare equal whatever their key order. */
function canonicalJson(value: unknown): string {
  return JSON.stringify(value, (_key, v: unknown) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) return v;
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v).sort()) out[k] = (v as Record<string, unknown>)[k];
    return out;
  });
}

/** The resource types a document gets when its language moves to `to`:
 *  the built-in types of `to` when `types` are still, field for field, the
 *  built-in ones of a language in `from` (the language it was in, the
 *  interface's); null when they were customised (they stay) or already
 *  read as `to`'s. A book switched from Spanish to Chinese thus turns
 *  "Figura" into 图, while a renamed type keeps its name. */
export function relocalizedResourceTypes(
  types: readonly ResourceType[] | undefined,
  from: readonly string[],
  to: string,
): ResourceType[] | null {
  if (!types || types.length === 0) return null;
  const next = defaultResourceTypes(to);
  const current = canonicalJson(types);
  if (current === canonicalJson(next)) return null;
  return from.some((l) => canonicalJson(defaultResourceTypes(l)) === current) ? next : null;
}
