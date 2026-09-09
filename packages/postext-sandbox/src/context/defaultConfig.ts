import type { PostextConfig } from 'postext';
import { cloneDefaultColorPalette, defaultResourceTypes } from 'postext';

/** The sandbox's pristine configuration: the default colour palette plus the
 *  built-in resource types localised to `locale`. Lives in its own module so
 *  both the context and the built-in preset can use it without a circular
 *  import. */
export function createDefaultConfig(locale = 'en'): PostextConfig {
  return { colorPalette: cloneDefaultColorPalette(), resourceTypes: defaultResourceTypes(locale) };
}

/** Ensure `config.resourceTypes` is populated, falling back to the built-in
 *  defaults (localised to `locale`) when unset (e.g. configs persisted before
 *  the feature existed). Returns a new config object only when a change is
 *  needed. */
export function withDefaultResourceTypes(config: PostextConfig, locale = 'en'): PostextConfig {
  if (config.resourceTypes && config.resourceTypes.length > 0) return config;
  return { ...config, resourceTypes: defaultResourceTypes(locale) };
}
