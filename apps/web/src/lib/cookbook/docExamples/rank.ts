/**
 * Docs → Cookbook: which recipes each docs section points at (#1589).
 *
 * Recipes name their features in recipe.json, and the registries already
 * map every feature, exported API and top-level config key to the docs
 * heading that explains it. Read backwards, that gives each heading the
 * recipes that use what it describes. `docExamples.json` lets a curator pin
 * a recipe to a heading it would not reach on its own, or hide one that
 * only brushes past it.
 *
 * Ranking, per heading:
 *   1. pinned recipes, in the order the override lists them;
 *   2. recipes that teach the feature (a primary feature points here) before
 *      those that only use it;
 *   3. featured recipes, then recipes on a collection's reading path;
 *   4. the strength of the match (a primary feature counts 3, a secondary
 *      feature or an imported API 1, a config key ½, added up when a recipe
 *      reaches the heading several ways);
 *   5. the more focused recipe (fewer features in all);
 *   6. a recipe with a sample edition in the reader's language;
 *   7. the catalogue number, so the order is stable.
 * A secondary link that most recipes share (the PDF export, the palette,
 * `bodyText`) says nothing about a recipe, so a feature, API or config key
 * that more than a fifth of the recipes use only counts as a primary one.
 *
 * Pure and isomorphic: the loader (index.ts) feeds it.
 */
import type { DocAnchor, DocExampleEntry, Locale } from "../types.ts";

/** What the ranking needs of a published recipe. */
export interface ExampleRecipe {
  slug: string;
  number: number;
  primary: readonly string[];
  also: readonly string[];
  /** Exported symbols the script imports (the capture's detected APIs). */
  apis: readonly string[];
  /** Config paths the recipe sets; only the top-level key is matched. */
  configKeys: readonly string[];
  /** Languages of its sample editions. */
  editions: readonly Locale[];
}

/** The registry maps the ranking reads. */
export interface ExampleSources {
  features: Record<string, { docs: DocAnchor }>;
  apis: Record<string, DocAnchor>;
  config: Record<string, DocAnchor>;
  /** docExamples.json: pins and hides per heading. */
  overrides: Record<string, DocExampleEntry>;
  /** Featured recipes (collections.featured). */
  featured: readonly string[];
  /** Recipes on any other collection's reading path. */
  collected: readonly string[];
}

/** A heading of a docs page, in document order. */
export interface ExampleHeading {
  id: string;
  text: string;
  level: number;
}

/** A resolved anchor in the locale being built, or null when the doc or the
 *  heading is missing there. */
export type ResolveAnchor = (anchor: DocAnchor) => { slug: string; id: string } | null;

export interface SectionExamples {
  id: string;
  text: string;
  level: number;
  /** Every matching recipe, ranked. */
  recipes: string[];
  /** What the strip at the end of the section shows: at most STRIP_SIZE,
   *  pins always, other recipes only when no earlier strip on the page
   *  showed them. Empty: no strip. */
  strip: string[];
}

export interface PageExamples {
  /** Sections with at least one recipe, in document order. */
  sections: SectionExamples[];
  /** The page's closing list: each recipe once, under the section where it
   *  ranks best, in document order. The page shows GROUP_SIZE per section;
   *  the Markdown rendition lists them all. */
  groups: ExampleGroup[];
  /** Distinct recipes on the page. */
  count: number;
}

/** A section of the closing list. */
export interface ExampleGroup {
  id: string;
  text: string;
  /** Ranked; the page shows the first GROUP_SIZE. */
  recipes: string[];
  /** Recipes past GROUP_SIZE, which the page leaves to the Cookbook. */
  more: number;
  /** The feature documented here that most recipes use: the Cookbook's
   *  `feat=` filter lists the rest. Set by the loader. */
  feature?: { id: string; label: string };
}

export const STRIP_SIZE = 3;
export const GROUP_SIZE = 6;
/** A secondary link shared by more than this share of recipes is noise. */
export const UBIQUITY = 0.2;

const WEIGHT = { primary: 3, also: 1, api: 1, config: 0.5 } as const;

interface Match {
  pin: number;
  primary: boolean;
  weight: number;
}

/** Top-level config keys a recipe sets ("bodyText.fontSize" → "bodyText"). */
export function topLevelKeys(paths: readonly string[]): string[] {
  return [...new Set(paths.map((p) => p.split(/[.[]/)[0]!).filter(Boolean))];
}

function anchorKey(slug: string, id: string): string {
  return `${slug}#${id}`;
}

/** For every resolved heading ("<doc slug>#<id>"), the ranked recipe slugs. */
export function rankDocExamples(
  recipes: readonly ExampleRecipe[],
  sources: ExampleSources,
  resolve: ResolveAnchor,
  locale: Locale,
): Map<string, string[]> {
  const bySlug = new Map(recipes.map((r) => [r.slug, r]));
  // How many recipes share each secondary link.
  const usage = new Map<string, number>();
  const bump = (key: string) => usage.set(key, (usage.get(key) ?? 0) + 1);
  for (const r of recipes) {
    for (const id of new Set([...r.primary, ...r.also])) bump(`f:${id}`);
    for (const api of new Set(r.apis)) bump(`a:${api}`);
    for (const key of topLevelKeys(r.configKeys)) bump(`c:${key}`);
  }
  const limit = Math.max(1, Math.floor(recipes.length * UBIQUITY));
  const common = (key: string) => (usage.get(key) ?? 0) > limit;

  const resolved = new Map<DocAnchor, string | null>();
  const keyOf = (anchor: DocAnchor | undefined): string | null => {
    if (!anchor) return null;
    if (!resolved.has(anchor)) {
      const hit = resolve(anchor);
      resolved.set(anchor, hit ? anchorKey(hit.slug, hit.id) : null);
    }
    return resolved.get(anchor)!;
  };

  const matches = new Map<string, Map<string, Match>>();
  const add = (anchor: string | null, slug: string, weight: number, primary: boolean) => {
    if (!anchor) return;
    let section = matches.get(anchor);
    if (!section) matches.set(anchor, (section = new Map()));
    const hit = section.get(slug) ?? { pin: Infinity, primary: false, weight: 0 };
    hit.primary ||= primary;
    hit.weight += weight;
    section.set(slug, hit);
  };

  for (const r of recipes) {
    // One heading reached twice the same way (two features documented in
    // one section) counts once per way.
    const seen = new Set<string>();
    const link = (anchor: string | null, kind: keyof typeof WEIGHT) => {
      if (!anchor || seen.has(`${kind}|${anchor}`)) return;
      seen.add(`${kind}|${anchor}`);
      add(anchor, r.slug, WEIGHT[kind], kind === "primary");
    };
    for (const id of r.primary) link(keyOf(sources.features[id]?.docs), "primary");
    for (const id of r.also) if (!common(`f:${id}`)) link(keyOf(sources.features[id]?.docs), "also");
    for (const api of r.apis) if (!common(`a:${api}`)) link(keyOf(sources.apis[api]), "api");
    for (const key of topLevelKeys(r.configKeys)) if (!common(`c:${key}`)) link(keyOf(sources.config[key]), "config");
  }

  for (const override of Object.values(sources.overrides)) {
    const anchor = keyOf(override.docs);
    if (!anchor) continue;
    let section = matches.get(anchor);
    if (!section) matches.set(anchor, (section = new Map()));
    for (const slug of override.hide ?? []) section.delete(slug);
    (override.pin ?? []).forEach((slug, i) => {
      if (!bySlug.has(slug)) return;
      const hit = section.get(slug) ?? { pin: Infinity, primary: false, weight: 0 };
      hit.pin = Math.min(hit.pin, i);
      section.set(slug, hit);
    });
  }

  const featured = new Set(sources.featured);
  const collected = new Set(sources.collected);
  const curation = (slug: string) => (featured.has(slug) ? 2 : collected.has(slug) ? 1 : 0);
  const focus = (r: ExampleRecipe) => r.primary.length + r.also.length;
  const own = (r: ExampleRecipe) => (r.editions.includes(locale) ? 1 : 0);

  const out = new Map<string, string[]>();
  for (const [anchor, section] of [...matches].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))) {
    const ranked = [...section].sort(([sa, a], [sb, b]) => {
      const ra = bySlug.get(sa)!;
      const rb = bySlug.get(sb)!;
      return (
        a.pin - b.pin ||
        Number(b.primary) - Number(a.primary) ||
        curation(sb) - curation(sa) ||
        b.weight - a.weight ||
        focus(ra) - focus(rb) ||
        own(rb) - own(ra) ||
        ra.number - rb.number
      );
    });
    // Infinity - Infinity is NaN: two unpinned recipes fall through to the
    // next key, which `||` already does for NaN.
    if (ranked.length) out.set(anchor, ranked.map(([slug]) => slug));
  }
  return out;
}

/** Whether a slug was pinned to the heading (pins repeat across strips). */
function pinnedTo(sources: ExampleSources, resolve: ResolveAnchor, docSlug: string, id: string): Set<string> {
  const pins = new Set<string>();
  for (const override of Object.values(sources.overrides)) {
    const hit = resolve(override.docs);
    if (hit && hit.slug === docSlug && hit.id === id) for (const slug of override.pin ?? []) pins.add(slug);
  }
  return pins;
}

/** One docs page's strips and closing list, from the ranked index. */
export function pageExamples(
  docSlug: string,
  headings: readonly ExampleHeading[],
  ranked: Map<string, string[]>,
  sources: ExampleSources,
  resolve: ResolveAnchor,
): PageExamples {
  const sections: SectionExamples[] = [];
  const shown = new Set<string>();
  for (const heading of headings) {
    const recipes = ranked.get(anchorKey(docSlug, heading.id));
    if (!recipes?.length) continue;
    const pins = pinnedTo(sources, resolve, docSlug, heading.id);
    const strip = recipes.filter((slug) => pins.has(slug) || !shown.has(slug)).slice(0, STRIP_SIZE);
    for (const slug of strip) shown.add(slug);
    sections.push({ id: heading.id, text: heading.text, level: heading.level, recipes, strip });
  }

  // Each recipe once, where it ranks highest; the earlier section wins a tie.
  const home = new Map<string, { section: number; rank: number }>();
  sections.forEach((section, s) => {
    section.recipes.forEach((slug, rank) => {
      const best = home.get(slug);
      if (!best || rank < best.rank) home.set(slug, { section: s, rank });
    });
  });
  const groups = sections
    .map((section, s) => {
      const recipes = section.recipes.filter((slug) => home.get(slug)!.section === s);
      return { id: section.id, text: section.text, recipes, more: Math.max(0, recipes.length - GROUP_SIZE) };
    })
    .filter((group) => group.recipes.length > 0);
  return { sections, groups, count: home.size };
}
