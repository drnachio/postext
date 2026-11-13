/**
 * The docs ↔ Cookbook index of a locale (#1589), built from the published
 * recipes and the registries when the site renders, like the docs search
 * index: nothing in it is written by hand except the pins and hides of
 * cookbook/_registry/docExamples.json. Production builds it once per locale;
 * development rebuilds it with the recipes (every couple of seconds).
 *
 * Server-only (it reads the repo through recipes.ts and docLinks.ts).
 */
import { getDocSlugsForLocale } from "../../docs.ts";
import { docToc, resolveDocAnchor } from "../docLinks.ts";
import { pageExamples, rankDocExamples, type ExampleRecipe, type ExampleSources, type PageExamples, type ResolveAnchor } from "./rank.ts";
import { cardImage } from "../images.ts";
import { getAllRecipes, recipeHref, writeupFor } from "../recipes.ts";
import { loadRegistry } from "../registry.ts";
import type { Locale, Recipe, Registry } from "../types.ts";

/** What a docs card shows of a recipe, in one locale. */
export interface DocExampleCard {
  slug: string;
  number: number;
  title: string;
  /** "/<locale>/cookbook/<slug>" */
  href: string;
  /** 480 × 360 stage, or "" before the first capture. */
  card480: string;
}

export interface DocExamplesIndex {
  locale: Locale;
  /** Docs slug → its sections, strips and closing list. Pages with no
   *  recipe are left out. */
  pages: Record<string, PageExamples>;
  /** Every recipe a page links, by slug. */
  recipes: Record<string, DocExampleCard>;
}

const PRODUCTION = process.env.NODE_ENV === "production";
const DEV_TTL_MS = 1500;
const memo = new Map<Locale, { at: number; index: DocExamplesIndex }>();

/** The ranking's view of a recipe. Published recipes are captured, so the
 *  APIs and config keys come from the capture of their first edition. */
export function exampleRecipe(recipe: Recipe): ExampleRecipe {
  const { meta } = recipe;
  const detected = recipe.capture?.variants[meta.sample.locales[0]]?.detected;
  return {
    slug: recipe.slug,
    number: meta.number,
    primary: meta.features.primary,
    also: meta.features.also,
    apis: detected?.apis ?? [],
    configKeys: detected?.configKeys ?? [],
    editions: meta.sample.locales,
  };
}

/** The registry maps the ranking reads. */
export function exampleSources(registry: Registry): ExampleSources {
  const { featured, ...rest } = registry.collections;
  return {
    features: registry.features,
    apis: registry.apis,
    config: registry.config,
    overrides: registry.docExamples ?? {},
    featured: featured?.recipes ?? [],
    collected: [...new Set(Object.values(rest).flatMap((c) => c.recipes))],
  };
}

/** Builds the index of a locale from recipes and registries already loaded
 *  (the tests call it with fixtures). `docSlugs` lists the pages to index. */
export function buildDocExamplesFrom(
  locale: Locale,
  recipes: readonly Recipe[],
  registry: Registry,
  docSlugs: readonly string[],
): DocExamplesIndex {
  const sources = exampleSources(registry);
  const resolve: ResolveAnchor = (anchor) => resolveDocAnchor(anchor, locale);
  const ranked = rankDocExamples(recipes.map(exampleRecipe), sources, resolve, locale);
  // The feature most recipes use, per heading, for the "all recipes" link.
  const uses = new Map<string, number>();
  for (const r of recipes) for (const id of new Set([...r.meta.features.primary, ...r.meta.features.also])) uses.set(id, (uses.get(id) ?? 0) + 1);
  const featureAt = new Map<string, string>();
  for (const [id, feature] of Object.entries(registry.features)) {
    const hit = resolve(feature.docs);
    if (!hit) continue;
    const key = `${hit.slug}#${hit.id}`;
    const best = featureAt.get(key);
    if (!best || (uses.get(id) ?? 0) > (uses.get(best) ?? 0)) featureAt.set(key, id);
  }
  const pages: Record<string, PageExamples> = {};
  const linked = new Set<string>();
  for (const slug of docSlugs) {
    const toc = docToc(slug, locale);
    if (!toc) continue;
    const page = pageExamples(slug, toc, ranked, sources, resolve);
    if (!page.count) continue;
    for (const group of page.groups) {
      const feature = featureAt.get(`${slug}#${group.id}`);
      if (feature && group.more > 0) group.feature = { id: feature, label: registry.features[feature]!.label[locale] };
    }
    pages[slug] = page;
    for (const section of page.sections) for (const r of section.recipes) linked.add(r);
  }
  const cards: Record<string, DocExampleCard> = {};
  for (const recipe of recipes) {
    if (!linked.has(recipe.slug)) continue;
    cards[recipe.slug] = {
      slug: recipe.slug,
      number: recipe.meta.number,
      title: writeupFor(recipe, locale)?.frontmatter.title ?? recipe.slug,
      href: recipeHref(recipe.slug, locale),
      card480: cardImage(recipe, locale)?.src480 ?? "",
    };
  }
  return { locale, pages, recipes: cards };
}

/** The index of a locale over every docs page in it, from the published
 *  recipes. */
export function buildDocExamples(locale: Locale): DocExamplesIndex {
  const hit = memo.get(locale);
  if (hit && (PRODUCTION || Date.now() - hit.at < DEV_TTL_MS)) return hit.index;
  const recipes = getAllRecipes();
  const index = recipes.length
    ? buildDocExamplesFrom(locale, recipes, loadRegistry(), getDocSlugsForLocale(locale))
    : { locale, pages: {}, recipes: {} };
  memo.set(locale, { at: Date.now(), index });
  return index;
}
