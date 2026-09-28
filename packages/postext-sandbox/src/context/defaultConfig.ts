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

/** The fields of a built-in resource type, in a fixed order, for comparing
 *  a stored type with the built-in one whatever its key order. */
function typeKey(t: ResourceType): string {
  const { id, name, namePlural, shortLabel, captionPrefix, numberingTemplate, resetOn, counterFormat, ...rest } = t;
  return JSON.stringify([id, name, namePlural, shortLabel, captionPrefix, numberingTemplate, resetOn, counterFormat, Object.keys(rest).length]);
}

/** The document language the built-in strings follow: `locale`, else the
 *  hyphenation language, else the app language `uiLocale`. */
export function effectiveDocumentLanguage(config: PostextConfig, uiLocale: string): string {
  return config.locale ?? config.bodyText?.hyphenation?.locale ?? uiLocale;
}

/**
 * The resource types to store when the Document language changes to
 * `nextLocale` (`undefined`: back to unset): the new language's built-in
 * types when the config still holds the previous language's untouched
 * (a book started in Spanish and switched to Chinese then numbers 图 1-1,
 * not Figura 1.1); `undefined` when they were customised, or nothing
 * changes. `uiLocale` is the app language, the fallback of both.
 */
export function relocalizedResourceTypes(config: PostextConfig, nextLocale: string | undefined, uiLocale: string): ResourceType[] | undefined {
  const current = config.resourceTypes;
  if (!current || current.length === 0) return undefined;
  const from = defaultResourceTypes(effectiveDocumentLanguage(config, uiLocale));
  if (current.length !== from.length || current.some((t, i) => typeKey(t) !== typeKey(from[i]!))) return undefined;
  const next = defaultResourceTypes(effectiveDocumentLanguage({ ...config, locale: nextLocale }, uiLocale));
  return next.every((t, i) => typeKey(t) === typeKey(from[i]!)) ? undefined : next;
}
