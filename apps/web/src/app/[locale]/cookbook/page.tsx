import { Suspense } from "react";
import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { ChapterShelves } from "@/components/cookbook/gallery/ChapterShelf";
import { CookbookColophon } from "@/components/cookbook/gallery/CookbookColophon";
import { CookbookFilters, CookbookFiltersFallback } from "@/components/cookbook/gallery/CookbookFilters";
import { CookbookFrontispiece } from "@/components/cookbook/gallery/CookbookFrontispiece";
import { CookbookResults, ResultsSkeleton } from "@/components/cookbook/gallery/CookbookResults";
import { ContentsStrip } from "@/components/cookbook/gallery/ContentsStrip";
import { getGalleryData } from "@/components/cookbook/gallery/data";
import { EditorsPicks } from "@/components/cookbook/gallery/EditorsPicks";
import { plateLabels } from "@/components/cookbook/gallery/labels";
import { askRecipeUrl } from "@/components/cookbook/gallery/links";
import type { Locale } from "@/lib/cookbook/types";
import { buildMetadata, localizedUrl, SITE_NAME, SITE_URL } from "@/lib/seo";
import { htmlLang } from "@/i18n/locales";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Cookbook" });
  return buildMetadata({
    locale,
    path: "/cookbook",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

/** The Cookbook's gallery. Static: the server never reads `searchParams`.
 *  Unfiltered, the book view below is the page (for crawlers and readers
 *  without JavaScript); the filter and results islands take over when the
 *  URL carries a query or a facet. */
export default async function CookbookPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  setRequestLocale(raw);
  const locale = raw as Locale;
  const t = await getTranslations("Cookbook");
  const data = getGalleryData(locale);
  const { catalog } = data;
  const labels = plateLabels(t, catalog.facets);
  const published = catalog.recipes.filter((r) => !r.draft);

  const url = localizedUrl(locale, "/cookbook");
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      "@id": `${url}#collection`,
      name: t("metaTitle"),
      description: t("metaDescription"),
      url,
      inLanguage: htmlLang(locale),
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      mainEntity: {
        "@type": "ItemList",
        numberOfItems: published.length,
        itemListOrder: "https://schema.org/ItemListOrderAscending",
        itemListElement: published.map((r, i) => ({
          "@type": "ListItem",
          position: i + 1,
          url: localizedUrl(locale, r.href),
          name: r.title,
        })),
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: localizedUrl(locale) },
        { "@type": "ListItem", position: 2, name: t("metaTitle"), item: url },
      ],
    },
  ];

  const parts = data.parts.map(({ id, number, color, title }) => ({ id, number, color, title }));

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <noscript dangerouslySetInnerHTML={{ __html: "<style>.cb-bar{display:none!important}</style>" }} />
      <main id="main-content" className="min-w-0 flex-1">
        <CookbookFrontispiece data={data} locale={locale} />

        {catalog.recipes.length === 0 ? (
          <p className="mx-auto max-w-2xl px-4 pt-16 text-center font-body text-lg text-slate italic sm:px-6">
            {t("emptyBook")}{" "}
            <a
              href={askRecipeUrl()}
              target="_blank"
              rel="noopener noreferrer"
              className="font-sans text-base font-semibold text-(--brand) not-italic underline underline-offset-4"
            >
              {t("askRecipe")} ↗
            </a>
          </p>
        ) : (
          <>
            <ContentsStrip parts={data.parts} locale={locale} />
            <Suspense fallback={<CookbookFiltersFallback locale={locale} chapters={data.chapters} />}>
              <CookbookFilters locale={locale} chapters={data.chapters} />
            </Suspense>
            <div id="cb-book" className="cb-book">
              <EditorsPicks data={data} labels={labels} locale={locale} />
              <ChapterShelves data={data} labels={labels} locale={locale} />
            </div>
            <Suspense fallback={<ResultsSkeleton />}>
              <CookbookResults locale={locale} parts={parts} />
            </Suspense>
          </>
        )}

        <CookbookColophon data={data} />
      </main>
    </>
  );
}
