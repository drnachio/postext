import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { hasLocale } from "next-intl";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { preload } from "react-dom";
import "@/components/cookbook/cookbook.css";
import "@/components/cookbook/recipe.css";
import { LightTable } from "@/components/cookbook/recipe/LightTable";
import { formatKb, LICENSES, recipeView, type RecipeView } from "@/components/cookbook/recipe/model";
import { RecipeActionBar, RecipeActions, type RecipeActionsData } from "@/components/cookbook/recipe/RecipeActions";
import { SOURCES_ID, type RecipeSourcesPayload } from "@/components/cookbook/recipe/sources";
import { RecipeAside, RecipeAsideMobile } from "@/components/cookbook/recipe/RecipeAside";
import { RecipeBand, RecipeBreadcrumb } from "@/components/cookbook/recipe/RecipeBand";
import { CollectionStrips, PrevNext } from "@/components/cookbook/recipe/RecipeNeighbours";
import { RelatedRecipes } from "@/components/cookbook/recipe/RelatedRecipes";
import { Toaster } from "@/components/cookbook/recipe/toast";
import { Tombstone } from "@/components/cookbook/recipe/Tombstone";
import { WriteUp } from "@/components/cookbook/recipe/WriteUp";
import { routing } from "@/i18n/routing";
import { docAnchor } from "@/lib/cookbook/docLinks";
import { highlightCss } from "@/lib/cookbook/highlight";
import { cardImage, sandboxLink } from "@/lib/cookbook/images";
import { getRecipe, getVisibleRecipes, writeupFor } from "@/lib/cookbook/recipes";
import type { Locale } from "@/lib/cookbook/types";
import { SITE_NAME, SITE_URL, buildMetadata, localizedUrl } from "@/lib/seo";
import { htmlLang } from "@/i18n/locales";

type Params = Promise<{ locale: string; slug: string }>;

// Every visible recipe is prerendered; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  const slugs = getVisibleRecipes().map((r) => r.slug);
  return routing.locales.flatMap((locale) => slugs.map((slug) => ({ locale, slug })));
}

export async function generateMetadata({ params }: { params: Params }): Promise<Metadata> {
  const { locale, slug } = await params;
  const recipe = hasLocale(routing.locales, locale) ? getRecipe(slug) : null;
  const writeup = recipe ? writeupFor(recipe, locale as Locale) : null;
  if (!recipe || !writeup) return {};
  const t = await getTranslations({ locale, namespace: "CookbookRecipe" });
  const fm = writeup.frontmatter;
  return buildMetadata({
    locale,
    path: `/cookbook/${slug}`,
    title: `${fm.title} · ${t("metaSuffix")}`,
    description: fm.description ?? fm.summary,
    ogTitle: fm.title,
    ogDescription: fm.summary,
    type: "article",
    modifiedTime: recipe.meta.updated,
    // English and Spanish always exist; a Chinese page shows the English
    // write-up until its translation lands, and is neither an alternate
    // nor indexed meanwhile.
    availableLocales: routing.locales.filter((l) => recipe.writeups[l as Locale]),
    noindex: recipe.meta.status !== "published" || writeup.locale !== locale,
  });
}

const abs = (path: string) => (path.startsWith("http") ? path : `${SITE_URL}${path.replace(/\?.*$/, "")}`);

/** TechArticle (with its code as SoftwareSourceCode) and the breadcrumbs. */
function jsonLd(view: RecipeView, t: Awaited<ReturnType<typeof getTranslations>>) {
  const { recipe, registry, locale, chapter } = view;
  const { meta } = recipe;
  const card = cardImage(recipe, locale);
  const hero = view.spreads[view.heroSpread]?.flatMap((i) => (i === null ? [] : [view.pages[i].src])) ?? [];
  const cookbookUrl = localizedUrl(locale, "/cookbook");
  const dependencies = [`postext >= ${meta.engine.postext}`, ...(meta.engine.postextPdf ? [`postext-pdf >= ${meta.engine.postextPdf}`] : [])];
  const about = meta.features.primary
    .map((id) => registry.features[id])
    .filter(Boolean)
    .map((f) => {
      const href = docAnchor(f.docs, locale);
      return {
        "@type": "DefinedTerm",
        name: f.label[locale],
        description: f.definition[locale],
        ...(href ? { url: abs(href) } : {}),
      };
    });
  const author = meta.credits.authors.map((a) => ({
    "@type": "Person",
    name: a.name,
    ...(a.url || a.github ? { url: a.url ?? `https://github.com/${a.github}` } : {}),
  }));
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "TechArticle",
        "@id": `${view.url}#recipe`,
        headline: view.title,
        description: view.description,
        url: view.url,
        mainEntityOfPage: view.url,
        inLanguage: htmlLang(locale),
        image: [...(card ? [abs(card.src)] : []), ...hero.map(abs)],
        datePublished: meta.created,
        dateModified: meta.updated,
        author,
        publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
        ...(meta.level === 1 ? { proficiencyLevel: "Beginner" } : meta.level === 3 ? { proficiencyLevel: "Expert" } : {}),
        dependencies: dependencies.join(", "),
        about,
        isPartOf: { "@type": "CollectionPage", "@id": `${cookbookUrl}#collection`, url: cookbookUrl, name: t("cookbook") },
        license: LICENSES[meta.license.content]?.url,
        encoding: { "@type": "MediaObject", encodingFormat: "text/markdown", contentUrl: `${view.url}.md` },
        hasPart: {
          "@type": "SoftwareSourceCode",
          name: "script.js",
          programmingLanguage: "JavaScript",
          runtimePlatform: "Web browser",
          codeSampleType: "full solution",
          license: LICENSES.MIT?.url,
          codeRepository: view.githubUrl,
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: SITE_NAME, item: localizedUrl(locale) },
          { "@type": "ListItem", position: 2, name: t("cookbook"), item: cookbookUrl },
          { "@type": "ListItem", position: 3, name: chapter.title[locale], item: `${cookbookUrl}?cat=${chapter.id}` },
          { "@type": "ListItem", position: 4, name: view.title, item: view.url },
        ],
      },
    ],
  };
}

/** Open in Sandbox: an interactive recipe (a live page, a screenshot card)
 *  hands the Sandbox its document only, which the tooltip says. */
function sandboxAction(recipe: NonNullable<ReturnType<typeof getRecipe>>, locale: Locale): RecipeActionsData["sandbox"] {
  const link = sandboxLink(recipe, locale);
  if (!link) return null;
  const { meta } = recipe;
  return { href: link.href, live: meta.outputs.includes("live") || meta.capture.card === "screenshot" };
}

export default async function RecipePage({ params }: { params: Params }) {
  const { locale, slug } = await params;
  if (!hasLocale(routing.locales, locale)) notFound();
  setRequestLocale(locale);
  const recipe = getRecipe(slug);
  if (!recipe) notFound();
  const view = await recipeView(recipe, locale);
  if (!view) notFound();
  const t = await getTranslations("CookbookRecipe");
  const { pen, pages, spreads, heroSpread, binding } = view;

  // The first spread is the page's largest paint.
  for (const i of spreads[heroSpread] ?? []) {
    if (i !== null && pages[i]) preload(pages[i].src, { as: "image", fetchPriority: "high" });
  }

  const data: RecipeActionsData = {
    slug,
    variant: pen.variant,
    penTitle: `${view.title} · ${t("metaSuffix")}`,
    description: `${view.summary}\n\n${view.url}`,
    tags: [view.chapter.id],
    pdf: view.pdf ? { href: view.pdf.href, size: formatKb(view.pdf.bytes, locale), pages: view.pdf.pages } : null,
    sandbox: sandboxAction(recipe, locale),
    githubUrl: view.githubUrl,
  };
  // Only pen.json travels as JSON: Copy, CodePen and the .html download
  // rebuild the composed files from the whole-recipe view at click time
  // (a server-rendered script would travel twice, in the HTML and the RSC
  // payload).
  const sources: RecipeSourcesPayload = { [pen.variant]: { pen: pen.pen } };
  // The code's token colours, as classes (lib/cookbook/highlight).
  const syntaxCss = await highlightCss();

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd(view, t)).replace(/</g, "\\u003c") }}
      />
      <script
        type="application/json"
        id={SOURCES_ID}
        dangerouslySetInnerHTML={{ __html: JSON.stringify(sources).replace(/</g, "\\u003c") }}
      />
      <style dangerouslySetInnerHTML={{ __html: syntaxCss }} />
      <main id="main-content" className={`cb-recipe part-${view.color}`}>
        <RecipeBreadcrumb view={view} t={t} />
        <RecipeBand view={view} t={t} actions={<RecipeActions data={data} />} />
        <div className="cb-container">
          <RecipeAsideMobile view={view} t={t} />
        </div>
        <LightTable
          pages={pages}
          spreads={spreads}
          binding={binding}
          initial={heroSpread}
          total={view.capture?.specimen.pages ?? pages.length}
          title={view.title}
          textHref={`/${locale}/cookbook/${slug}.md`}
        >
          <Tombstone view={view} t={t} />
        </LightTable>

        <div className="cb-container cb-body">
          {/* A fallback write-up (English on a Chinese page) says its language. */}
          <article
            className="cb-article"
            lang={view.writeup.locale !== locale ? htmlLang(view.writeup.locale) : undefined}
          >
            <WriteUp view={view} t={t} data={data} />
          </article>
          <RecipeAside view={view} t={t} />
        </div>

        <div className="cb-container cb-after">
          <CollectionStrips view={view} t={t} />
          <RelatedRecipes view={view} t={t} />
          <PrevNext view={view} t={t} />
        </div>

        <RecipeActionBar data={data} />
        <Toaster />
      </main>
    </>
  );
}
