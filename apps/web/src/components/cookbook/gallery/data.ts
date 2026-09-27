/**
 * What the gallery's server components render: the catalogue of the locale
 * (the same entries the client searches), the book structure with the
 * chapters that have recipes, the frontispiece, the editor's picks and the
 * collections. Server-only (reads the repo through lib/cookbook).
 */
import type { PartColor } from "@/components/brand/partColors";
import { buildCatalog } from "@/lib/cookbook/catalog";
import { getVisibleRecipes } from "@/lib/cookbook/recipes";
import { loadRegistry } from "@/lib/cookbook/registry";
import type { Catalog, CatalogRecipe, ChapterId, Locale, PartId } from "@/lib/cookbook/types";

/** A chapter as the gallery's chips, strip and shelves need it. */
export interface GalleryChapter {
  id: ChapterId;
  number: number;
  part: PartId;
  color: PartColor;
  title: string;
  count: number;
}

export interface GalleryPart {
  id: PartId;
  number: string;
  color: PartColor;
  title: string;
  chapters: GalleryChapter[];
}

export interface GalleryData {
  catalog: Catalog;
  parts: GalleryPart[];
  chapters: GalleryChapter[];
  /** Chapter intros for the shelf bands (not shipped to the client). */
  intros: Partial<Record<ChapterId, string>>;
  featured: CatalogRecipe | null;
  picks: CatalogRecipe[];
  collections: { id: string; title: string; summary: string; count: number }[];
  /** Chrome's major version the captures ran in, when any exist. */
  chrome: string | null;
}

export function getGalleryData(locale: Locale): GalleryData {
  const catalog = buildCatalog(locale);
  const empty: GalleryData = {
    catalog,
    parts: [],
    chapters: [],
    intros: {},
    featured: null,
    picks: [],
    collections: [],
    chrome: null,
  };
  if (catalog.recipes.length === 0) return empty;

  const registry = loadRegistry();
  const { taxonomy } = registry;
  const chapters: GalleryChapter[] = catalog.facets.chapters.map((c) => ({
    id: c.id,
    number: c.number,
    part: c.part,
    color: c.color,
    title: c.title,
    count: c.count,
  }));
  const parts: GalleryPart[] = taxonomy.parts
    .map((part) => ({
      id: part.id,
      number: part.number,
      color: part.color,
      title: part.title[locale],
      chapters: chapters.filter((c) => c.part === part.id),
    }))
    .filter((part) => part.chapters.length > 0);
  const intros = Object.fromEntries(taxonomy.chapters.map((c) => [c.id, c.intro[locale]]));

  const bySlug = new Map(catalog.recipes.map((r) => [r.slug, r]));
  const featuredList = (registry.collections.featured?.recipes ?? [])
    .map((slug) => bySlug.get(slug))
    .filter((r): r is CatalogRecipe => Boolean(r));
  // Without a curated frontispiece, the first plate in contents order.
  const featured = featuredList[0] ?? catalog.recipes[0] ?? null;

  const collections = Object.entries(registry.collections)
    .filter(([id]) => id !== "featured")
    .map(([id, c]) => ({
      id,
      title: c.title[locale],
      summary: c.summary[locale],
      count: catalog.recipes.filter((r) => r.collections.includes(id)).length,
    }))
    .filter((c) => c.count > 0);

  const chromes = getVisibleRecipes()
    .map((r) => r.capture?.chrome.split(".")[0])
    .filter((v): v is string => Boolean(v));

  return {
    catalog,
    parts,
    chapters,
    intros,
    featured,
    picks: featuredList.slice(1, 4),
    collections,
    chrome: chromes.sort((a, b) => Number(a) - Number(b))[0] ?? null,
  };
}
