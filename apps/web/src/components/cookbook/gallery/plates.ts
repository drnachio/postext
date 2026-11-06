import { PUBLIC_COOKBOOK_URL } from "@/lib/cookbook/paths";
import type { Catalog, CatalogRecipe } from "@/lib/cookbook/types";
import { card480Of, type WirePlate } from "./plateWire";

export type PlateFacets = Pick<Catalog["facets"], "levels" | "genres">;

/** Where `PlateGrid` rebuilds a plate's link from its slug. */
export const PLATE_HREF_BASE = PUBLIC_COOKBOOK_URL;

/** A catalogue entry as a plate row (see `WirePlate`). */
export function toPlate(r: CatalogRecipe): WirePlate {
  return {
    slug: r.slug,
    number: r.number,
    title: r.title,
    summary: r.summary,
    ...(r.href !== `${PLATE_HREF_BASE}/${r.slug}` ? { href: r.href } : {}),
    level: r.level,
    // The plate names the first genre only.
    genres: r.genres.slice(0, 1),
    outputs: r.outputs,
    pages: r.pages,
    gap: r.gap,
    ...(r.draft ? { draft: r.draft } : {}),
    card: r.card.src,
    ...(r.card.src480 !== card480Of(r.card.src) ? { card480: r.card.src480 } : {}),
  };
}

/** The facet titles the given plates name (their level and first genre). */
export function plateFacets(facets: PlateFacets, plates: Pick<WirePlate, "genres">[]): PlateFacets {
  const genres = new Set(plates.map((p) => p.genres[0]));
  return { levels: facets.levels, genres: facets.genres.filter((g) => genres.has(g.id)) };
}
