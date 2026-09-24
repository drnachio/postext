import { notFound } from "next/navigation";
import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import {
  getDocSource,
  extractToc,
  getAllDocs,
  getDocSlugsForLocale,
  hasLocaleVersion,
} from "@/lib/docs";
import { routing } from "@/i18n/routing";
import { MdxContent } from "@/components/docs/MdxContent";
import { DocsToc } from "@/components/docs/DocsToc";
import { DocsMobileNav } from "@/components/docs/DocsMobileNav";
import { SITE_NAME, SITE_URL, buildMetadata, localizedUrl } from "@/lib/seo";
import { docPart, partClass } from "@/lib/docParts";
import { DocOpener } from "@/components/docs/DocOpener";

const PART_LABEL_KEY = {
  foundations: "partFoundations",
  craft: "partCraft",
  practice: "partPractice",
} as const;

export async function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of routing.locales) {
    const slugs = getDocSlugsForLocale(locale);
    for (const slug of slugs) {
      params.push({ locale, slug });
    }
  }
  return params;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}): Promise<Metadata> {
  const { locale, slug } = await params;
  const doc = getDocSource(slug, locale);
  if (!doc) return {};

  const availableLocales = routing.locales.filter((l) =>
    hasLocaleVersion(slug, l)
  );

  return buildMetadata({
    locale,
    path: `/docs/${slug}`,
    title: `${doc.meta.title} — Postext`,
    description: doc.meta.description,
    ogTitle: doc.meta.title,
    ogDescription: doc.meta.description,
    availableLocales,
    type: "article",
    modifiedTime: doc.meta.lastUpdated || undefined,
  });
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  setRequestLocale(locale);

  const doc = getDocSource(slug, locale);
  if (!doc) notFound();

  const toc = extractToc(doc.source);
  const docs = getAllDocs();
  const availableLocales = routing.locales.filter((l) =>
    hasLocaleVersion(slug, l)
  );

  const t = await getTranslations("Docs");
  const tIndex = await getTranslations("DocsIndex");
  const part = docPart(doc.meta.order);
  const chapter = docs.filter((d) => d.locales[locale]).findIndex((d) => d.slug === slug) + 1;

  const url = localizedUrl(locale, `/docs/${slug}`);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: doc.meta.title,
      description: doc.meta.description,
      url,
      mainEntityOfPage: url,
      inLanguage: locale,
      ...(doc.meta.lastUpdated ? { dateModified: doc.meta.lastUpdated } : {}),
      ...(doc.meta.readingTime
        ? { timeRequired: `PT${parseInt(doc.meta.readingTime, 10) || 1}M` }
        : {}),
      isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
      author: { "@type": "Organization", name: "Postext contributors", url: SITE_URL },
      publisher: { "@type": "Organization", name: SITE_NAME, url: SITE_URL },
      encoding: {
        "@type": "MediaObject",
        encodingFormat: "text/markdown",
        contentUrl: `${url}.md`,
      },
    },
    {
      "@context": "https://schema.org",
      "@type": "BreadcrumbList",
      itemListElement: [
        { "@type": "ListItem", position: 1, name: SITE_NAME, item: localizedUrl(locale) },
        {
          "@type": "ListItem",
          position: 2,
          name: tIndex("ogTitle"),
          item: localizedUrl(locale, "/docs"),
        },
        { "@type": "ListItem", position: 3, name: doc.meta.title, item: url },
      ],
    },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <main
        id="main-content"
        className={`min-w-0 flex-1 px-4 py-6 lg:px-8 2xl:px-12 ${partClass(part.color)}`}
      >
        <div className="relative mb-6 lg:hidden">
          <DocsMobileNav docs={docs} toc={toc} />
        </div>

        <DocOpener
          id={toc[0]?.level === 1 ? toc[0].id : undefined}
          number={chapter}
          kicker={`${t("chapter")} ${chapter} · ${t("part")} ${part.number} · ${t(PART_LABEL_KEY[part.key])}`}
          title={doc.meta.title}
          lead={doc.meta.description}
          color={part.color}
        />

        <div className="mb-8 flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-rule pb-4 font-sans text-xs text-slate 2xl:text-sm">
          {doc.meta.lastUpdated && (
            <span className="whitespace-nowrap">
              {t("lastUpdated")} {doc.meta.lastUpdated}
            </span>
          )}
          {doc.meta.readingTime && (
            <>
              <span aria-hidden="true" className="size-1 rounded-full bg-rule-strong" />
              <span className="whitespace-nowrap">{doc.meta.readingTime}</span>
            </>
          )}
          {availableLocales.length > 1 && (
            <span className="ml-auto flex gap-1">
              {availableLocales.map((l) => (
                <a
                  key={l}
                  href={`/${l}/docs/${slug}`}
                  aria-current={l === locale ? "true" : undefined}
                  className={`rounded px-1.5 py-0.5 font-sans text-[0.68rem] font-semibold tracking-[0.12em] uppercase transition-colors ${
                    l === locale
                      ? "bg-(--part) text-(--part-on)"
                      : "text-slate hover:text-foreground"
                  }`}
                >
                  {l}
                </a>
              ))}
            </span>
          )}
        </div>

        <MdxContent source={doc.source} skipTitle />
      </main>

      <div className={`contents ${partClass(part.color)}`}>
        <DocsToc items={toc} />
      </div>
    </>
  );
}
