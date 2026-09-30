/**
 * `catalog.json` (per locale): what the gallery's filters and search load on
 * demand, and what the ⌘K palette maps to recipe and warning rows. Built
 * from the visible recipes, the registries and the captures (falling back
 * to static detection before a recipe's first capture).
 *
 * Server-only.
 */
import { variantFor } from "./compose.ts";
import { detectPen } from "./detect.ts";
import { cardImage } from "./images.ts";
import { getComposed, getVisibleRecipes, recipeHref, writeupFor } from "./recipes.ts";
import { loadRegistry } from "./registry.ts";
import { readRecipeSources } from "./sources.ts";
import { stepTitles } from "./sections.ts";
import type { Catalog, CatalogRecipe, ComposedPen, Locale, Recipe, Registry } from "./types.ts";
import { compareSemVer } from "./validate.ts";
import { packCatalog, type PackedCatalog } from "./wire.ts";

const PRODUCTION = process.env.NODE_ENV === "production";
const memo = new Map<Locale, Catalog>();

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

/** APIs, config keys, directives and font families: from the capture when
 *  there is one, else from the composed pen and its content files. */
function detected(recipe: Recipe, locale: Locale): Pick<CatalogRecipe["search"], "apis" | "configKeys" | "directives" | "fonts"> {
  const variant = variantFor(recipe.meta, locale);
  const captured = recipe.capture?.variants[variant]?.detected;
  if (captured) {
    return {
      apis: captured.apis,
      configKeys: captured.configKeys,
      directives: unique([...captured.directives, ...captured.inline]),
      fonts: unique(captured.fonts.map((f) => f.family)),
    };
  }
  let pen: ComposedPen | null = null;
  try {
    pen = getComposed(recipe.slug, locale);
  } catch {
    // A script that does not compose yet (development): nothing to detect.
  }
  if (!pen) return { apis: [], configKeys: [], directives: [], fonts: [] };
  const found = detectPen(pen, Object.values(readRecipeSources(recipe.slug).content));
  return {
    apis: found.apis,
    configKeys: found.configKeys,
    directives: unique([...found.directives, ...found.inline]),
    fonts: found.families,
  };
}

/** The catalogue entry of one recipe. */
export function catalogRecipe(recipe: Recipe, locale: Locale, registry: Registry, collections: string[]): CatalogRecipe {
  const { meta } = recipe;
  // The title in another language, so an English query finds a Spanish or
  // Chinese page's recipe (and a Spanish one an English page's).
  const other: Locale = locale === "en" ? "es" : "en";
  const writeup = writeupFor(recipe, locale);
  const fm = writeup?.frontmatter;
  const features = [...meta.features.primary, ...meta.features.also];
  const question = registry.questions[meta.answers[0]];
  const variant = variantFor(meta, locale);
  const captured = recipe.capture?.variants[variant] ?? recipe.capture?.variants[meta.sample.locales[0]];
  const card = cardImage(recipe, locale);
  const gaps = (meta.gaps ?? []).map((id) => registry.gaps[id]).filter(Boolean);
  return {
    slug: recipe.slug,
    number: meta.number,
    chapter: meta.chapter,
    order: meta.order,
    level: meta.level,
    genres: meta.genres,
    outputs: meta.outputs,
    features,
    primary: meta.features.primary,
    warnings: meta.explainsWarnings ?? [],
    collections,
    gap: gaps.length > 0,
    ...(meta.status === "draft" ? { draft: true as const } : {}),
    created: meta.created,
    updated: meta.updated,
    pages: captured?.specimen.pages ?? captured?.pages.length ?? 0,
    title: fm?.title ?? recipe.slug,
    summary: fm?.summary ?? "",
    question: fm?.question ?? question?.text[locale] ?? "",
    href: recipeHref(recipe.slug),
    // Empty before the first capture: the card shows its placeholder.
    card: { src: card?.src ?? "", src480: card?.src480 ?? "" },
    search: {
      questions: unique(meta.answers.flatMap((id) => [registry.questions[id]?.text[locale] ?? "", registry.questions[id]?.index[locale] ?? ""])),
      aliases: unique([...(fm?.aliases ?? []), ...gaps.flatMap((gap) => [gap.label[locale], ...gap.aliases[locale]])]),
      featureLabels: unique(
        features.flatMap((id) => {
          const feature = registry.features[id];
          return feature ? [feature.label[locale], ...(feature.aliases?.[locale] ?? [])] : [];
        }),
      ),
      ...detected(recipe, locale),
      headings: unique(writeup ? stepTitles(writeup.body) : []),
      gotchas: unique((meta.gotchas ?? []).map((id) => registry.gotchas[id]?.title[locale] ?? "")),
      otherTitle: recipe.writeups[other]?.frontmatter.title ?? "",
    },
  };
}

/** The catalogue of a locale: visible recipes in contents order, and the
 *  facet vocabularies they use (chapters with no recipe are hidden). */
export function buildCatalog(locale: Locale): Catalog {
  const cached = PRODUCTION ? memo.get(locale) : undefined;
  if (cached) return cached;
  const recipes = getVisibleRecipes();
  const registry: Registry | null = recipes.length > 0 ? loadRegistry() : null;
  const catalog: Catalog = {
    locale,
    testedWith: "",
    facets: { chapters: [], genres: [], outputs: [], levels: [], features: [], warnings: [], collections: [] },
    recipes: [],
  };
  if (!registry) {
    if (PRODUCTION) memo.set(locale, catalog);
    return catalog;
  }
  const { taxonomy } = registry;
  const collectionIds = Object.keys(registry.collections).filter((id) => id !== "featured");
  catalog.recipes = recipes.map((recipe) =>
    catalogRecipe(
      recipe,
      locale,
      registry,
      collectionIds.filter((id) => registry.collections[id].recipes.includes(recipe.slug)),
    ),
  );

  const used = <T>(pick: (r: CatalogRecipe) => readonly T[]) => new Set(catalog.recipes.flatMap(pick));
  const chapters = used((r) => [r.chapter]);
  const genres = used((r) => r.genres);
  const outputs = used((r) => r.outputs);
  const features = used((r) => r.features);
  const warnings = used((r) => r.warnings);
  const collections = used((r) => r.collections);
  const partOf = new Map(taxonomy.parts.map((part) => [part.id, part]));
  catalog.facets = {
    chapters: taxonomy.chapters
      .filter((c) => chapters.has(c.id))
      .sort((a, b) => a.number - b.number)
      .map((c) => ({
        id: c.id,
        number: c.number,
        part: c.part,
        color: partOf.get(c.part)?.color ?? "blue",
        title: c.title[locale],
        count: catalog.recipes.filter((r) => r.chapter === c.id).length,
      })),
    genres: taxonomy.genres.filter((g) => genres.has(g.id)).map((g) => ({ id: g.id, title: g.title[locale] })),
    outputs: taxonomy.outputs.filter((o) => outputs.has(o.id)).map((o) => ({ id: o.id, title: o.title[locale] })),
    levels: taxonomy.levels.map((l) => ({ id: l.id, title: l.title[locale] })),
    features: Object.entries(registry.features)
      .filter(([id]) => features.has(id))
      .map(([id, f]) => ({ id, label: f.label[locale], group: f.group, aliases: f.aliases?.[locale] ?? [] })),
    warnings: Object.entries(registry.warnings)
      .filter(([kind]) => warnings.has(kind))
      .map(([kind, w]) => ({ kind, label: w.label[locale] })),
    collections: collectionIds.filter((id) => collections.has(id)).map((id) => ({ id, title: registry.collections[id].title[locale] })),
  };
  const versions = recipes.map((r) => r.capture?.engine.postext).filter((v): v is NonNullable<typeof v> => Boolean(v));
  catalog.testedWith = versions.sort(compareSemVer)[0] ?? "";
  catalog.gaps = Object.entries(registry.gaps).map(([id, gap]) => ({
    id,
    label: gap.label[locale],
    aliases: gap.aliases[locale],
    explanation: gap.explanation[locale],
    recipes: recipes.filter((r) => r.meta.gaps?.includes(id)).map((r) => r.slug),
  }));
  if (PRODUCTION) memo.set(locale, catalog);
  return catalog;
}

/** `catalog.json` as served: the catalogue with its registry text shipped
 *  once, keyed by id (lib/cookbook/wire.ts; the client unpacks it). */
export function buildCatalogWire(locale: Locale): PackedCatalog {
  const catalog = buildCatalog(locale);
  const recipes = new Map(getVisibleRecipes().map((r) => [r.slug, r.meta]));
  const registry: Registry | null = catalog.recipes.length > 0 ? loadRegistry() : null;
  const ids = (slug: string) => ({ answers: recipes.get(slug)?.answers ?? [], gotchas: recipes.get(slug)?.gotchas ?? [] });
  const terms: PackedCatalog["terms"] = { questions: {}, gotchas: {} };
  for (const recipe of catalog.recipes) {
    const { answers, gotchas } = ids(recipe.slug);
    for (const id of answers) {
      const q = registry?.questions[id];
      terms.questions[id] = q ? [q.text[locale], q.index[locale]] : [];
    }
    for (const id of gotchas) terms.gotchas[id] = registry?.gotchas[id]?.title[locale] ?? "";
  }
  return packCatalog(catalog, ids, terms);
}
