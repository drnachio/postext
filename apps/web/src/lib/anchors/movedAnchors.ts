/**
 * The heading ids that left a docs page when it was split, per language,
 * under the page that holds each heading now: the Configuration reference
 * (#655, `configurationAnchors.json`) and the pages split by
 * `scripts/docs/split-pages.mjs` (#884, `movedAnchors.json`, which also
 * holds the ids renamed on the page that stayed). The page's redirect reads
 * one language of it.
 */
import data from "./movedAnchors.json";
import type { OldAnchorTable } from "./oldAnchors";
import { CONFIGURATION_SLUG, movedConfigurationAnchors } from "./configurationAnchors";

const SPLIT: Record<string, Record<string, OldAnchorTable>> = data;

/** The moved ids of a page in a language, or null when none moved. */
export function movedAnchors(slug: string, locale: string): OldAnchorTable | null {
  const table: OldAnchorTable = {};
  const add = (from: OldAnchorTable) => {
    for (const [page, ids] of Object.entries(from)) table[page] = table[page] ? `${table[page]} ${ids}` : ids;
  };
  if (slug === CONFIGURATION_SLUG) add(movedConfigurationAnchors(locale));
  add(SPLIT[slug]?.[locale] ?? {});
  return Object.keys(table).length > 0 ? table : null;
}
