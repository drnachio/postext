/**
 * The Cookbook's recipe loader for the site: discovery, validation,
 * write-ups, captures, drafts, contents order and composition.
 *
 * Server-only (it reads the repo with `fs`). Memoised per process in
 * production; in development the files are re-read (at most every couple
 * of seconds) so edits show up without a restart.
 */
import fs from "node:fs";
import path from "node:path";
import { composePen, variantFor } from "./compose.ts";
import { captureDir, PUBLIC_COOKBOOK_URL } from "./paths.ts";
import { loadRegistry, resetRegistryCache } from "./registry.ts";
import { listRecipeSlugs, readKit, readRecipeMeta, readRecipeSources, resetKitCache } from "./sources.ts";
import type { CaptureManifest, ComposedPen, Locale, Recipe, RecipeWriteup, Registry, Taxonomy } from "./types.ts";
import { LOCALES } from "./types.ts";
import { validateRecipeMeta } from "./validate.ts";
import { readWriteup } from "./writeup.ts";

export type { Recipe } from "./types.ts";

const PRODUCTION = process.env.NODE_ENV === "production";
/** How long development reuses what it read (one render reads it many times). */
const DEV_TTL_MS = 1500;

/** Drafts show in development, or with COOKBOOK_DRAFTS=1; production lists
 *  published recipes only. */
export function showDrafts(): boolean {
  return process.env.NODE_ENV !== "production" || process.env.COOKBOOK_DRAFTS === "1";
}

// ─── Loading ────────────────────────────────────────────────────────────────

/** capture.json of a recipe, or null before its first capture. */
export function getCapture(slug: string): CaptureManifest | null {
  const file = path.join(captureDir(slug), "capture.json");
  if (!fs.existsSync(file)) return null;
  return JSON.parse(fs.readFileSync(file, "utf-8")) as CaptureManifest;
}

/** Reads one recipe folder. Throws with every validation error. */
export function loadRecipe(slug: string, registry: Registry = loadRegistry(), knownSlugs = listRecipeSlugs()): Recipe {
  const meta = readRecipeMeta(slug);
  const errors = validateRecipeMeta(meta, slug, registry, { knownSlugs });
  if (errors.length) {
    throw new Error(`Cookbook recipe "${slug}" is invalid:\n  ${errors.join("\n  ")}\nRun \`pnpm cookbook lint ${slug}\`.`);
  }
  const writeups: Partial<Record<Locale, RecipeWriteup>> = {};
  for (const locale of LOCALES) {
    const writeup = readWriteup(slug, locale, registry.taxonomy.sections);
    if (writeup) {
      const { frontmatter, body, sections } = writeup;
      writeups[locale] = { locale, frontmatter, body, sections };
    }
  }
  return { slug, meta, writeups, capture: getCapture(slug) };
}

interface Loaded {
  at: number;
  /** Every loadable recipe (any status), in contents order. */
  recipes: Recipe[];
}

let loaded: Loaded | null = null;

function load(): Loaded {
  if (loaded && (PRODUCTION || Date.now() - loaded.at < DEV_TTL_MS)) return loaded;
  if (!PRODUCTION && loaded) {
    resetRegistryCache();
    resetKitCache();
    composed.clear();
  }
  const slugs = listRecipeSlugs();
  const recipes: Recipe[] = [];
  let registry: Registry | null = null;
  if (slugs.length > 0) {
    try {
      registry = loadRegistry();
    } catch (error) {
      if (PRODUCTION) throw error;
      console.warn(`[cookbook] no recipes: ${(error as Error).message}`);
    }
  }
  if (registry) {
    for (const slug of slugs) {
      try {
        recipes.push(loadRecipe(slug, registry, slugs));
      } catch (error) {
        // A broken recipe fails the production build; in development the
        // rest of the Cookbook keeps working while it is being written.
        if (PRODUCTION) throw error;
        console.warn(`[cookbook] skipping ${slug}: ${(error as Error).message}`);
      }
    }
    sortContents(recipes, registry.taxonomy);
  }
  loaded = { at: Date.now(), recipes };
  return loaded;
}

/** Sorts in contents order, in place: part → chapter number → order → slug. */
export function sortContents<T extends { slug: string; meta: Pick<Recipe["meta"], "chapter" | "order"> }>(
  recipes: T[],
  taxonomy: Pick<Taxonomy, "parts" | "chapters">,
): T[] {
  const partIndex = new Map(taxonomy.parts.map((part, i) => [part.id, i]));
  const chapter = new Map(taxonomy.chapters.map((c) => [c.id, c]));
  const key = (r: T) => {
    const c = chapter.get(r.meta.chapter);
    return [c ? (partIndex.get(c.part) ?? 99) : 99, c?.number ?? 99, r.meta.order] as const;
  };
  return recipes.sort((a, b) => {
    const ka = key(a);
    const kb = key(b);
    return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || a.slug.localeCompare(b.slug);
  });
}

// ─── Queries ────────────────────────────────────────────────────────────────

/** Recipes in contents order: published ones, plus drafts when asked.
 *  Retired recipes only redirect, so they are never listed. */
export function getAllRecipes({ includeDrafts = false }: { includeDrafts?: boolean } = {}): Recipe[] {
  return load().recipes.filter((r) => r.meta.status === "published" || (includeDrafts && r.meta.status === "draft"));
}

/** What the site lists: published recipes, and drafts where `showDrafts()`. */
export function getVisibleRecipes(): Recipe[] {
  return getAllRecipes({ includeDrafts: showDrafts() });
}

/** A visible recipe, or null (unknown, retired, or a draft in production). */
export function getRecipe(slug: string): Recipe | null {
  return getVisibleRecipes().find((r) => r.slug === slug) ?? null;
}

/** Previous and next visible recipes in contents order. */
export function neighbours(slug: string): { prev: Recipe | null; next: Recipe | null } {
  return neighboursIn(getVisibleRecipes(), slug);
}

export function neighboursIn<T extends { slug: string }>(list: T[], slug: string): { prev: T | null; next: T | null } {
  const i = list.findIndex((r) => r.slug === slug);
  if (i === -1) return { prev: null, next: null };
  return { prev: list[i - 1] ?? null, next: list[i + 1] ?? null };
}

/** Locale-less recipe path ("/cookbook/<slug>"), or the localised one. */
export function recipeHref(slug: string, locale?: Locale): string {
  return `${locale ? `/${locale}` : ""}${PUBLIC_COOKBOOK_URL}/${slug}`;
}

/** The write-up for a locale (falling back to the other one while a
 *  translation is missing). */
export function writeupFor(recipe: Pick<Recipe, "writeups">, locale: Locale): RecipeWriteup | null {
  return recipe.writeups[locale] ?? LOCALES.map((l) => recipe.writeups[l]).find(Boolean) ?? null;
}

// ─── Composition ────────────────────────────────────────────────────────────

const composed = new Map<string, ComposedPen>();

/** The pen a site locale shows (its own sample edition, else the first). */
export function getComposed(slug: string, locale: Locale): ComposedPen | null {
  const recipe = load().recipes.find((r) => r.slug === slug);
  if (!recipe) return null;
  const variant = variantFor(recipe.meta, locale);
  const key = `${slug}|${variant}`;
  const hit = composed.get(key);
  if (hit) return hit;
  const pen = composePen(readRecipeSources(slug), recipe.meta, variant, { kit: readKit() });
  composed.set(key, pen);
  return pen;
}
