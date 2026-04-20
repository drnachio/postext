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
import { buildMetadata } from "@/lib/seo";

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

  return (
    <>
      <main
        id="main-content"
        className="min-w-0 flex-1 px-4 py-6 lg:px-8 2xl:px-12"
      >
        <div className="relative mb-6 lg:hidden">
          <DocsMobileNav docs={docs} toc={toc} />
        </div>

        {/* Title row: title left, metadata right on large screens */}
        <div className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-baseline lg:justify-between">
          <h1
            className="docs-heading font-display text-[1.5rem] font-bold italic tracking-tight text-foreground md:text-[2rem]"
            style={{ scrollMarginTop: "var(--docs-nav-h, 5rem)" }}
          >
            {doc.meta.title}
          </h1>
          <div className="flex flex-wrap items-center gap-3 text-sm text-slate lg:shrink-0">
            {doc.meta.lastUpdated && (
              <span className="whitespace-nowrap">
                {t("lastUpdated")}: {doc.meta.lastUpdated}
              </span>
            )}
            {doc.meta.readingTime && (
              <>
                <span className="text-rule">|</span>
                <span className="whitespace-nowrap">{doc.meta.readingTime}</span>
              </>
            )}
            {availableLocales.length > 1 && (
              <>
                <span className="text-rule">|</span>
                <span className="flex gap-1">
                  {availableLocales.map((l) => (
                    <a
                      key={l}
                      href={`/${l}/docs/${slug}`}
                      className={`rounded px-1.5 py-0.5 font-mono text-xs uppercase transition-colors ${
                        l === locale
                          ? "bg-surface text-foreground font-semibold"
                          : "text-slate hover:text-foreground"
                      }`}
                    >
                      {l}
                    </a>
                  ))}
                </span>
              </>
            )}
          </div>
        </div>

        <MdxContent source={doc.source} skipTitle />
      </main>

      <DocsToc items={toc} />
    </>
  );
}
