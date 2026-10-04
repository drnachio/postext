import fs from "node:fs";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { hasLocale } from "next-intl";
import { routing } from "@/i18n/routing";
import { ogImageFile } from "@/lib/cookbook/images";
import { getRecipe, getVisibleRecipes, writeupFor } from "@/lib/cookbook/recipes";
import { loadRegistry } from "@/lib/cookbook/registry";
import type { Locale } from "@/lib/cookbook/types";
import { generateOgImage, ogContentType, ogSize, ogTextLocale } from "@/lib/og-image";

export const alt = "Postext Cookbook";
export const size = ogSize;
export const contentType = ogContentType;

/** Part colours legible as small caps on night (the vermilion lifted), as
 *  the docs' cards use them. */
const PART_INK = { blue: "#7f97f0", gilt: "#d8a21a", vermilion: "#e6765f" } as const;

// Like the page: unknown slugs are a 404, never rendered (and cached) on demand.
export const dynamicParams = false;

export function generateStaticParams() {
  const slugs = getVisibleRecipes().map((r) => r.slug);
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export default async function OgImage({ params }: { params: Promise<{ locale: string; slug: string }> }) {
  const { locale, slug } = await params;
  const textLocale = ogTextLocale(locale);
  const recipe = hasLocale(routing.locales, locale) ? getRecipe(slug) : null;
  const writeup = recipe ? writeupFor(recipe, textLocale as Locale) : null;
  if (!recipe || !writeup) notFound();

  const t = await getTranslations({ locale: textLocale, namespace: "CookbookRecipe" });
  const { taxonomy } = loadRegistry();
  const chapter = taxonomy.chapters.find((c) => c.id === recipe.meta.chapter);
  const part = taxonomy.parts.find((p) => p.id === chapter?.part);

  // The capture's OG art: the hero page(s) on a flat night ground, 580 × 622.
  const file = ogImageFile(recipe, locale as Locale);
  const art =
    file && fs.existsSync(file)
      ? { src: `data:image/jpeg;base64,${fs.readFileSync(file).toString("base64")}`, width: 580, height: 622 }
      : undefined;

  return generateOgImage({
    title: writeup.frontmatter.title,
    description: writeup.frontmatter.summary,
    kicker: t("ogKicker", { number: String(recipe.meta.number).padStart(3, "0"), chapter: chapter?.title[textLocale as Locale] ?? "" }),
    accent: PART_INK[part?.color ?? "blue"],
    art,
  });
}
