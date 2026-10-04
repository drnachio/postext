import type { Metadata } from "next";
import { getTranslations, setRequestLocale } from "next-intl/server";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { buildMetadata, localizedUrl, SITE_NAME, SITE_URL } from "@/lib/seo";
import { htmlLang, siteLocale } from "@/i18n/locales";
import { glossarySections } from "@/lib/glossary/glossary";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Glossary" });
  return buildMetadata({
    locale,
    path: "/glossary",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

const SECTION_TITLE = { type: "categoryType", cjk: "categoryCjk", arabic: "categoryArabic", web: "categoryWeb" } as const;

/** The site's glossary (WCAG 3.1.3 and 3.1.4): the trade words, grouped
 *  and sorted in the reader's language, then every abbreviation with its
 *  expansion. Each entry has a stable anchor (`#leading`, `#abbr-pdf`). */
export default async function GlossaryPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Glossary");
  const { categories, abbreviations } = glossarySections(siteLocale(locale));
  const url = localizedUrl(locale, "/glossary");

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "DefinedTermSet",
    "@id": `${url}#glossary`,
    name: t("title"),
    description: t("metaDescription"),
    url,
    inLanguage: htmlLang(locale),
    isPartOf: { "@type": "WebSite", name: SITE_NAME, url: SITE_URL },
    hasDefinedTerm: [
      ...categories.flatMap((c) =>
        c.terms.map((term) => ({ "@type": "DefinedTerm", name: term.term, description: term.definition, url: `${url}#${term.id}` })),
      ),
      ...abbreviations.map((a) => ({ "@type": "DefinedTerm", name: a.abbr, description: a.title, url: `${url}#abbr-${a.id}` })),
    ],
  };

  const sections = [
    ...categories.map((c) => ({ id: c.category, title: t(SECTION_TITLE[c.category]), count: c.terms.length })),
    { id: "abbreviations", title: t("abbreviations"), count: abbreviations.length },
  ];

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd).replace(/</g, "\\u003c") }}
      />
      <Navbar />
      <main id="main-content" tabIndex={-1} className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
          <div aria-hidden="true" className="tri-stripe mb-10 h-1.5 w-full" />
          <p className="kicker text-slate">{t("kicker")}</p>
          <h1 className="display mt-3 text-[2.4rem] text-foreground md:text-[3.2rem]">{t("title")}</h1>
          <span aria-hidden="true" className="mt-5 block h-[3px] w-12 bg-brand" />
          <p className="mt-6 max-w-[38rem] font-body text-lg leading-[1.7] text-foreground">{t("lead")}</p>

          <nav aria-label={t("contents")} className="mt-10 border-y border-rule py-4">
            <ul className="flex flex-wrap gap-x-2 gap-y-2">
              {sections.map((s) => (
                <li key={s.id}>
                  <a
                    href={`#${s.id}`}
                    className="inline-flex min-h-11 items-center gap-2 rounded-md px-3 font-sans text-sm font-medium text-foreground underline decoration-rule-strong underline-offset-4 transition-colors hover:text-brand hover:decoration-brand 2xl:text-base"
                  >
                    {s.title}
                    <span className="text-slate no-underline">{t("termCount").replace("__count__", String(s.count))}</span>
                  </a>
                </li>
              ))}
            </ul>
          </nav>

          {categories.map((c) => (
            <section key={c.category} aria-labelledby={c.category} className="mt-14">
              <h2
                id={c.category}
                className="scroll-mt-24 border-b border-rule pb-3 font-head text-2xl font-bold text-brand 2xl:text-3xl"
              >
                {t(SECTION_TITLE[c.category])}
              </h2>
              <dl className="mt-8 gap-12 lg:columns-2 2xl:gap-16">
                {c.terms.map((term) => (
                  <div key={term.id} id={term.id} className="mb-7 scroll-mt-24 break-inside-avoid">
                    <dt className="font-head text-lg font-bold text-foreground 2xl:text-xl">
                      {term.term}
                      {term.native && (
                        <span lang="zh-Hans" className="ml-2 font-body font-normal text-slate">
                          {term.native}
                        </span>
                      )}
                    </dt>
                    <dd className="mt-1.5 max-w-[36rem] font-body text-base leading-[1.7] text-foreground">
                      {term.definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}

          <section aria-labelledby="abbreviations" className="mt-14">
            <h2
              id="abbreviations"
              className="scroll-mt-24 border-b border-rule pb-3 font-head text-2xl font-bold text-brand 2xl:text-3xl"
            >
              {t("abbreviations")}
            </h2>
            <p className="mt-6 max-w-[38rem] font-body text-base leading-[1.7] text-foreground">{t("abbreviationsLead")}</p>
            <dl className="mt-8 grid grid-cols-1 gap-x-12 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 2xl:gap-x-16">
              {abbreviations.map((a) => (
                <div key={a.id} id={`abbr-${a.id}`} className="scroll-mt-24 border-t border-rule pt-3">
                  <dt className="font-sans text-base font-semibold text-foreground">
                    <abbr title={a.title} className="no-underline">
                      {a.abbr}
                    </abbr>
                  </dt>
                  <dd className="mt-1 font-body text-[0.95rem] leading-[1.6] text-foreground">{a.title}</dd>
                </div>
              ))}
            </dl>
          </section>
        </div>
      </main>
      <Footer />
    </>
  );
}
