import type { PostextConfig } from 'postext';
import { cloneDefaultColorPalette, defaultResourceTypes } from 'postext';

/** The sandbox's pristine configuration: the default colour palette plus the
 *  built-in resource types localised to `locale`. Lives in its own module so
 *  both the context and the built-in preset can use it without a circular
 *  import. */
export function createDefaultConfig(locale = 'en'): PostextConfig {
  return { colorPalette: cloneDefaultColorPalette(), resourceTypes: defaultResourceTypes(locale) };
}
