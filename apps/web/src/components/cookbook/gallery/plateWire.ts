import type { PlateRecipe } from "@/components/cookbook/RecipeCard";

/** A plate as the server book view hands it to `PlateGrid`: the fields a
 *  plate shows, nothing else, and nothing the client can rebuild. The RSC
 *  payload carries ~180 of these rows inline in the gallery page, so the
 *  recipe link (`<base>/<slug>`) and the 480-wide card (`card.480.webp`
 *  beside `card.webp`) are left out when they follow the pattern. Client
 *  safe: no Node imports (`plates.ts` builds the rows on the server). */
export type WirePlate = Omit<PlateRecipe, "href" | "card"> & {
  /** Only when it is not `<base>/<slug>`. */
  href?: string;
  /** The 960-wide card, "" before the first capture. */
  card: string;
  /** Only when it is not the 960-wide card's `card.480.webp` sibling. */
  card480?: string;
};

/** The 480-wide card beside a 960-wide one. */
export function card480Of(src: string): string {
  return src.replace("/card.webp", "/card.480.webp");
}

/** A plate row back as the plate's recipe. */
export function fromWirePlate(plate: WirePlate, hrefBase: string): PlateRecipe {
  const { href, card, card480, ...rest } = plate;
  return {
    ...rest,
    href: href ?? `${hrefBase}/${plate.slug}`,
    card: { src: card, src480: card480 ?? card480Of(card) },
  };
}
