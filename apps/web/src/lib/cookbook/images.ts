/**
 * URLs of a recipe's generated media (`public/cookbook/<slug>/<variant>/…`),
 * each with `?v=<hash8>` so a recapture busts caches. Every helper returns
 * null (or an empty list) for a recipe without a capture yet; the UI shows
 * a placeholder then.
 *
 * Isomorphic Node: relative `.ts` imports only.
 */
import path from "node:path";
import { variantFor } from "./compose.ts";
import { captureDir, PUBLIC_COOKBOOK_URL } from "./paths.ts";
import type { CaptureManifest, CaptureVariant, CardMode, Locale, Recipe } from "./types.ts";

type RecipeMedia = Pick<Recipe, "slug" | "meta" | "capture"> & { writeups?: Recipe["writeups"] };

/** "/cookbook/<slug>/<variant>/<file>?v=<hash8>" */
export function mediaUrl(slug: string, variant: Locale, file: string, hash8?: string): string {
  return `${PUBLIC_COOKBOOK_URL}/${slug}/${variant}/${file}${hash8 ? `?v=${hash8}` : ""}`;
}

/** The captured edition a site locale shows, or null before the capture. */
export function captureVariantFor(
  recipe: Pick<Recipe, "meta" | "capture">,
  locale: Locale,
): { variant: Locale; data: CaptureVariant } | null {
  const capture: CaptureManifest | null = recipe.capture;
  if (!capture) return null;
  const variant = variantFor(recipe.meta, locale);
  const data = capture.variants[variant] ?? capture.variants[recipe.meta.sample.locales[0]];
  if (!data) return null;
  return { variant: capture.variants[variant] ? variant : recipe.meta.sample.locales[0], data };
}

export interface CardImage {
  /** 960 × 720 stage. */
  src: string;
  /** 480 × 360 stage. */
  src480: string;
  w: number;
  h: number;
  mode: CardMode;
}

export function cardImage(recipe: RecipeMedia, locale: Locale): CardImage | null {
  const hit = captureVariantFor(recipe, locale);
  if (!hit) return null;
  const { variant, data } = hit;
  return {
    src: mediaUrl(recipe.slug, variant, data.card.file, data.hash8),
    src480: mediaUrl(recipe.slug, variant, data.card.file480, data.hash8),
    w: data.card.w,
    h: data.card.h,
    mode: data.card.mode,
  };
}

export interface PageImage {
  /** 1-based physical page. */
  n: number;
  /** Printed folio, or "" when the page has none. */
  label: string;
  role: "body" | "opener" | "part" | "blank";
  /** 1000-wide page. */
  src: string;
  /** 240-wide strip thumbnail. */
  thumb: string;
  w: number;
  h: number;
  bytes: number;
  /** The capture's alt text, extended by the write-up's `pageNotes` when
   *  both are in the page's language. */
  alt: string;
  /** The alt text's language, when the page shows another language's
   *  edition (an English-only sample on a Spanish page). */
  lang?: Locale;
  /** The write-up's note on the page, when it is in another language than
   *  `alt`: the light table offers it as the image's description. */
  note?: string;
}

/** The published pages of a locale's edition, in page order. */
export function pageImages(recipe: RecipeMedia, locale: Locale): PageImage[] {
  const hit = captureVariantFor(recipe, locale);
  if (!hit) return [];
  const { variant, data } = hit;
  const notes = recipe.writeups?.[locale]?.frontmatter.pageNotes ?? {};
  // Another language's edition: its alt text keeps that language (marked),
  // and the page-language note stays apart rather than mixing into it.
  const foreign = variant !== locale;
  return data.pages.map((page) => {
    const note = notes[String(page.n)];
    return {
      ...(foreign ? { lang: variant, ...(note ? { note } : {}) } : {}),
      n: page.n,
      label: page.label,
      role: page.role,
      src: mediaUrl(recipe.slug, variant, page.file, data.hash8),
      thumb: mediaUrl(recipe.slug, variant, page.strip, data.hash8),
      w: page.w,
      h: page.h,
      bytes: page.bytes,
      alt: note && !foreign ? `${page.alt.replace(/[.\s]*$/, "")}. ${note}` : page.alt,
    };
  });
}

/** The edge the edition's book is bound on: `"right"` when its capture
 *  says so (the light table then lays the spreads out mirrored). */
export function spreadBinding(recipe: RecipeMedia, locale: Locale): "left" | "right" {
  return captureVariantFor(recipe, locale)?.data.binding === "right" ? "right" : "left";
}

/** The published pages as spreads ([verso, recto]; page 1 alone), in
 *  reading order: a right-bound book shows each pair mirrored. */
export function spreadImages(recipe: RecipeMedia, locale: Locale): [PageImage | null, PageImage | null][] {
  const hit = captureVariantFor(recipe, locale);
  if (!hit) return [];
  const pages = pageImages(recipe, locale);
  return hit.data.spreads.map(([verso, recto]) => [
    verso === null ? null : (pages[verso] ?? null),
    recto === null ? null : (pages[recto] ?? null),
  ]);
}

/** The hero page or pair (`capture.hero`), in order. */
export function heroPages(recipe: RecipeMedia, locale: Locale): PageImage[] {
  const hero = [recipe.meta.capture.hero].flat();
  const pages = pageImages(recipe, locale);
  return hero.map((n) => pages.find((page) => page.n === n)).filter((page): page is PageImage => Boolean(page));
}

/** The spread that holds the hero page(s), for the light table's first view. */
export function heroSpread(recipe: RecipeMedia, locale: Locale): [PageImage | null, PageImage | null] | null {
  const first = [recipe.meta.capture.hero].flat()[0];
  return spreadImages(recipe, locale).find((pair) => pair.some((page) => page?.n === first)) ?? null;
}

/** Absolute path of the OG art on disk (the OG route reads the bytes), or null. */
export function ogImageFile(recipe: RecipeMedia, locale: Locale): string | null {
  const hit = captureVariantFor(recipe, locale);
  if (!hit) return null;
  return path.join(captureDir(recipe.slug), hit.variant, hit.data.og.file);
}

/** The PDF the pen produced, when the recipe offers it. */
export function pdfDownload(recipe: RecipeMedia, locale: Locale): { href: string; bytes: number; pages: number } | null {
  if (!recipe.meta.downloads?.pdf) return null;
  const hit = captureVariantFor(recipe, locale);
  if (!hit?.data.pdf) return null;
  const { file, bytes, pages } = hit.data.pdf;
  return { href: mediaUrl(recipe.slug, hit.variant, file, hit.data.hash8), bytes, pages };
}

/** The Sandbox link of a recipe: the edition in the page's language when it
 *  has a `.postext` bundle, else another edition's. The Sandbox reads
 *  `#recipe=<slug>&lang=<variant>` and fetches `bundle` itself. */
export function sandboxLink(
  recipe: RecipeMedia,
  locale: Locale,
): { href: string; variant: Locale; bundle: string } | null {
  const capture = recipe.capture;
  if (!capture) return null;
  const first = variantFor(recipe.meta, locale);
  const order = [first, ...recipe.meta.sample.locales.filter((l) => l !== first)];
  const variant = order.find((l) => capture.variants[l]?.sandbox);
  const data = variant && capture.variants[variant];
  if (!variant || !data?.sandbox) return null;
  return {
    href: `/${locale}/sandbox#recipe=${recipe.slug}&lang=${variant}`,
    variant,
    bundle: mediaUrl(recipe.slug, variant, data.sandbox.file),
  };
}
