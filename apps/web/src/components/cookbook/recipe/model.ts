/**
 * The recipe page's view model: what the band, the light table, the
 * write-up and the aside need, gathered once per render from the loaded
 * recipe, the registries, the capture and the composed pen.
 *
 * Server-only (it reads the repo through lib/cookbook).
 */
import GithubSlugger from "github-slugger";
import type { getTranslations } from "next-intl/server";
import { detectPen } from "@/lib/cookbook/detect";
import { highlightLines, type HighlightedLine } from "@/lib/cookbook/highlight";
import { captureVariantFor, pageImages, pdfDownload, spreadBinding, type PageImage } from "@/lib/cookbook/images";
import { getComposed, writeupFor } from "@/lib/cookbook/recipes";
import { loadRegistry } from "@/lib/cookbook/registry";
import type {
  CaptureManifest,
  CaptureVariant,
  ComposedPen,
  LicenseId,
  Locale,
  PartColor,
  Recipe,
  RecipeWriteup,
  Registry,
  SectionId,
  Taxonomy,
} from "@/lib/cookbook/types";
import { SECTION_ORDER } from "@/lib/cookbook/types";
import { localizedUrl } from "@/lib/seo";

export const REPO_URL = "https://github.com/drnachio/postext";

/** The page's translator (the "CookbookRecipe" namespace). */
export type RecipeT = Awaited<ReturnType<typeof getTranslations<"CookbookRecipe">>>;

export interface RecipeSection {
  id: SectionId;
  /** The heading's anchor (slugged like the docs' headings). */
  anchor: string;
  title: string;
}

export interface RecipeView {
  locale: Locale;
  recipe: Recipe;
  registry: Registry;
  writeup: RecipeWriteup;
  title: string;
  summary: string;
  description: string;
  question: string;
  /** "012" */
  numberLabel: string;
  chapter: Taxonomy["chapters"][number];
  part: Taxonomy["parts"][number];
  color: PartColor;
  pen: ComposedPen;
  /** Highlighted lines of the composed script (1-based line n is [n - 1]). */
  jsLines: HighlightedLine[];
  capture: CaptureVariant | null;
  engine: CaptureManifest["engine"] | null;
  pages: PageImage[];
  /** Indexes into `pages`: [verso, recto], in reading order. */
  spreads: [number | null, number | null][];
  /** The edge the book is bound on: a right-bound book (vertical Chinese)
   *  lies open mirrored, its recto on the left, and turns leftward. */
  binding: "left" | "right";
  /** The spread the light table opens on (the hero's). */
  heroSpread: number;
  pdf: { href: string; bytes: number; pages: number } | null;
  /** From the capture, or statically from the composed pen before it. */
  detected: { apis: string[]; configSections: string[]; features: string[] };
  /** The sections this page renders, in the template's order. */
  sections: RecipeSection[];
  url: string;
  githubUrl: string;
  editUrl: string;
}

export const formatNumber = (n: number) => String(n).padStart(3, "0");

/** The sections the page renders: authored ones when written, generated
 *  ones when they have something to show. */
function sectionsFor(view: Omit<RecipeView, "sections">): RecipeSection[] {
  const { writeup, recipe, pen, registry, locale } = view;
  const authored = writeup.sections;
  const has: Record<SectionId, boolean> = {
    build: Boolean(authored.build) || recipe.meta.answers.length > 0,
    short: Boolean(pen.ranges.regions.answer),
    ingredients: true,
    method: Boolean(authored.method),
    whole: true,
    variations: Boolean(authored.variations),
    pitfalls:
      Boolean(authored.pitfalls) ||
      (recipe.meta.gotchas ?? []).length > 0 ||
      (recipe.meta.explainsWarnings ?? []).length > 0,
    credits: true,
  };
  const slugger = new GithubSlugger();
  return SECTION_ORDER.filter((id) => has[id]).map((id) => {
    const title = registry.taxonomy.sections[id]?.[locale] ?? id;
    return { id, title, anchor: slugger.slug(title) };
  });
}

function detectedFor(pen: ComposedPen, capture: CaptureVariant | null): RecipeView["detected"] {
  if (capture) {
    const { apis, configSections, features } = capture.detected;
    return { apis, configSections, features };
  }
  const found = detectPen(pen);
  return { apis: found.apis, configSections: found.configKeys, features: [] };
}

/** Builds the view of a visible recipe for a locale, or null when it has
 *  no write-up or its script does not compose. */
export async function recipeView(recipe: Recipe, locale: Locale): Promise<RecipeView | null> {
  const writeup = writeupFor(recipe, locale);
  if (!writeup) return null;
  const pen = getComposed(recipe.slug, locale);
  if (!pen) return null;
  const registry = loadRegistry();
  const { meta } = recipe;
  const chapter = registry.taxonomy.chapters.find((c) => c.id === meta.chapter) ?? registry.taxonomy.chapters[0];
  const part = registry.taxonomy.parts.find((p) => p.id === chapter.part) ?? registry.taxonomy.parts[0];
  const fm = writeup.frontmatter;
  const question = fm.question ?? registry.questions[meta.answers[0]]?.text[locale] ?? "";

  const hit = captureVariantFor(recipe, locale);
  const pages = pageImages(recipe, locale);
  const spreads = hit?.data.spreads ?? [];
  const hero = [meta.capture.hero].flat()[0];
  const heroIndex = pages.findIndex((p) => p.n === hero);
  const heroSpread = Math.max(0, spreads.findIndex((pair) => pair.includes(heroIndex)));

  const base: Omit<RecipeView, "sections"> = {
    locale,
    recipe,
    registry,
    writeup,
    title: fm.title || recipe.slug,
    summary: fm.summary,
    description: fm.description ?? fm.summary,
    question,
    numberLabel: formatNumber(meta.number),
    chapter,
    part,
    color: part.color,
    pen,
    jsLines: await highlightLines(pen.js, "js"),
    capture: hit?.data ?? null,
    engine: recipe.capture?.engine ?? null,
    pages,
    spreads,
    binding: spreadBinding(recipe, locale),
    heroSpread,
    pdf: pdfDownload(recipe, locale),
    detected: detectedFor(pen, hit?.data ?? null),
    url: localizedUrl(locale, `/cookbook/${recipe.slug}`),
    githubUrl: `${REPO_URL}/tree/main/cookbook/${recipe.slug}`,
    editUrl: `${REPO_URL}/edit/main/cookbook/${recipe.slug}/${writeup.locale}.mdx`,
  };
  return { ...base, sections: sectionsFor(base) };
}

/** "Cookbook" filter URL for a facet value (the gallery's URL grammar). */
export function galleryHref(locale: Locale, param?: string, value?: string | number): string {
  return `/${locale}/cookbook${param && value !== undefined ? `?${param}=${encodeURIComponent(String(value))}` : ""}`;
}

/** Formats an ISO date (YYYY-MM-DD) for the page's locale. */
export function formatDate(iso: string, locale: Locale): string {
  const date = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return iso;
  // The site writes British English: "25 Sept 2026".
  return new Intl.DateTimeFormat(locale === "en" ? "en-GB" : locale, {
    day: "numeric",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** Bytes as whole kilobytes ("212 KB"). */
export function formatKb(bytes: number, locale: Locale): string {
  return `${new Intl.NumberFormat(locale).format(Math.max(1, Math.round(bytes / 1024)))} KB`;
}

/** Licences by id: name and deed. */
export const LICENSES: Partial<Record<LicenseId, { name: string; url: string }>> = {
  MIT: { name: "MIT", url: "https://opensource.org/licenses/MIT" },
  // An older work licensed as "the Creative Commons Attribution License", with no version.
  "CC-BY": { name: "CC BY", url: "https://creativecommons.org/licenses/" },
  "CC-BY-3.0": { name: "CC BY 3.0", url: "https://creativecommons.org/licenses/by/3.0/" },
  "CC-BY-4.0": { name: "CC BY 4.0", url: "https://creativecommons.org/licenses/by/4.0/" },
  "CC-BY-SA-4.0": { name: "CC BY-SA 4.0", url: "https://creativecommons.org/licenses/by-sa/4.0/" },
  "CC0-1.0": { name: "CC0 1.0", url: "https://creativecommons.org/publicdomain/zero/1.0/" },
  PD: { name: "PD", url: "https://creativecommons.org/publicdomain/mark/1.0/" },
  "OFL-1.1": { name: "SIL OFL 1.1", url: "https://openfontlicense.org" },
  "Apache-2.0": { name: "Apache 2.0", url: "https://www.apache.org/licenses/LICENSE-2.0" },
};

/** A licence's display name ("CC BY 4.0", "public domain"). */
export function licenceName(id: LicenseId, t: RecipeT): string {
  if (id === "PD") return t("licPD");
  if (id === "original") return t("licOriginal");
  if (id === "reproduction-authorised") return t("licAuthorised");
  return LICENSES[id]?.name ?? id;
}
