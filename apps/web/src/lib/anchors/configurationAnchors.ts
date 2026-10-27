/**
 * The heading ids the Configuration reference had while it was one page
 * (#655), per language, under the page that holds each heading now.
 * `configurationAnchors.json` is written by
 * `scripts/docs/split-configuration.mjs` from the split itself; the entry
 * page's redirect reads one language of it.
 */
import data from "./configurationAnchors.json";
import type { OldAnchorTable } from "./oldAnchors";

export const CONFIGURATION_SLUG = "configuration";

const TABLES: Record<string, OldAnchorTable> = data;

/** Every id of the old page in a language, the entry page's own included. */
export function oldConfigurationAnchors(locale: string): OldAnchorTable {
  return TABLES[locale] ?? {};
}

/** The ids that left `/docs/configuration`, by the page they moved to. */
export function movedConfigurationAnchors(locale: string): OldAnchorTable {
  return Object.fromEntries(Object.entries(oldConfigurationAnchors(locale)).filter(([slug]) => slug !== CONFIGURATION_SLUG));
}
