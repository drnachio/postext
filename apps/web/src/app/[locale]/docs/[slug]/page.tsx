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
import { htmlLang } from "@/i18n/locales";
import { PlainSummary } from "@/components/brand/PlainSummary";
import { DocsPager, type PagerLink } from "@/components/docs/DocsPager";
import { OldAnchorRedirect } from "@/components/docs/OldAnchorRedirect";
import { AnchorOnLoad } from "@/components/docs/AnchorOnLoad";
import { CONFIGURATION_SLUG } from "@/lib/anchors/configurationAnchors";
import { movedAnchors } from "@/lib/anchors/movedAnchors";
import { docNumbers } from "@/lib/docNumbers";
import Link from "next/link";

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
  const tPlain = await getTranslations("PlainLanguage");
  const part = docPart(doc.meta.order);
  const chapters = docs.filter((d) => d.locales[locale]);
  const numbers = docNumbers(chapters, locale);
  const chapter = numbers.get(slug)!;
  const position = chapters.findIndex((d) => d.slug === slug);
  const pagerLink = (index: number): PagerLink | null => {
    const other = chapters[index];
    return other
      ? { href: `/${locale}/docs/${other.slug}`, number: numbers.get(other.slug)!, title: other.locales[locale]!.sidebarTitle }
      : null;
  };
  // A chapter split into pages lists them under its summary (the
  // Configuration entry page has its own index); a page of a chapter links
  // back to it.
  const parent = chapter.includes(".") ? chapters.find((d) => d.slug === doc.meta.parent) : undefined;
  const pages = chapter.includes(".") || slug === CONFIGURATION_SLUG ? [] : chapters.filter((d) => d.locales[locale]!.parent === slug);
  const moved = movedAnchors(slug, locale);

  const url = localizedUrl(locale, `/docs/${slug}`);
  const jsonLd = [
    {
      "@context": "https://schema.org",
      "@type": "TechArticle",
      headline: doc.meta.title,
      description: doc.meta.description,
      url,
      mainEntityOfPage: url,
      inLanguage: htmlLang(locale),
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
      {moved && (
        // The page was split: its old `#anchors` go to their pages.
        <OldAnchorRedirect locale={locale} pages={moved} />
      )}
      <AnchorOnLoad key={slug} />
      <main
        id="main-content"
        tabIndex={-1}
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
          {parent && (
            <>
              <span aria-hidden="true" className="size-1 rounded-full bg-rule-strong" />
              <span>
                {t("inChapter")}{" "}
                <Link href={`/${locale}/docs/${parent.slug}`} className="docs-link inline-flex min-h-10 items-center font-semibold text-(--part-ink)">
                  {numbers.get(parent.slug)} {parent.locales[locale]!.sidebarTitle}
                </Link>
              </span>
            </>
          )}
          {availableLocales.length > 1 && (
            <span className="ms-auto flex gap-1">
              {availableLocales.map((l) => (
                <a
                  key={l}
                  href={`/${l}/docs/${slug}`}
                  aria-current={l === locale ? "true" : undefined}
                  className={`inline-flex min-h-10 min-w-10 items-center justify-center rounded px-2 font-sans text-[0.68rem] font-semibold tracking-[0.12em] uppercase transition-colors ${
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

        {doc.meta.plainSummary && (
          <PlainSummary
            id="in-short"
            heading={tPlain("heading")}
            ink="text-(--part-ink)"
            rule="border-s-(--part)"
            className="mb-8"
          >
            {doc.meta.plainSummary}
          </PlainSummary>
        )}

        {pages.length > 0 && (
          <nav aria-labelledby="chapter-pages" className="mb-10 rounded-sm border border-rule px-5 py-4">
            <h2 id="chapter-pages" className="kicker text-[0.62rem] text-(--part-ink)">
              {t("chapterPages")}
            </h2>
            <ol className="mt-2 divide-y divide-rule">
              {pages.map((page) => (
                <li key={page.slug}>
                  <Link href={`/${locale}/docs/${page.slug}`} className="group flex min-h-11 gap-3 py-2">
                    <span className="w-9 shrink-0 pt-0.5 text-end font-sans text-sm font-bold text-(--part-ink) tabular-nums">
                      {numbers.get(page.slug)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-display font-semibold transition-colors group-hover:text-(--part-ink)">
                        {page.locales[locale]!.sidebarTitle}
                      </span>
                      <span className="block font-body text-[0.9rem] leading-snug text-slate italic">
                        {page.locales[locale]!.description}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </nav>
        )}

        <MdxContent source={doc.source} skipTitle />

        <DocsPager
          label={t("neighbours")}
          previousLabel={t("previousChapter")}
          nextLabel={t("nextChapter")}
          prev={pagerLink(position - 1)}
          next={pagerLink(position + 1)}
        />
      </main>

      <div className={`contents ${partClass(part.color)}`}>
        <DocsToc items={toc} />
      </div>
    </>
  );
}
