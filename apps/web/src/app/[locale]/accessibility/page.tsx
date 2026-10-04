import { setRequestLocale, getTranslations } from "next-intl/server";
import type { Metadata } from "next";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import { ReadingPreferences } from "@/components/reading/ReadingPreferences";
import { buildMetadata } from "@/lib/seo";
import { htmlLang } from "@/i18n/locales";
import { abbreviationsFor } from "@/lib/glossary/abbreviations";

const ISSUES_URL = "https://github.com/drnachio/postext/issues";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "AccessibilityStatement" });
  return buildMetadata({
    locale,
    path: "/accessibility",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

const H2 = "font-head text-lg font-bold text-brand 2xl:text-xl";

export default async function AccessibilityPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("AccessibilityStatement");
  const a11y = await getTranslations("Accessibility");
  const wcag = abbreviationsFor(locale).get("WCAG");

  // The first WCAG and AAA of the page carry their expansion (3.1.4).
  const target = t("targetText")
    .split(/(WCAG|AAA)/)
    .map((part, i, all) => {
      const first = all.indexOf(part) === i;
      if (part === "WCAG" && first) return <abbr key={i} title={wcag?.title}>WCAG</abbr>;
      if (part === "AAA" && first) return <abbr key={i} title={t("aaaTitle")}>AAA</abbr>;
      return part;
    });

  const prefs = ["prefsTheme", "prefsAlign", "prefsSpacing", "prefsWidth", "prefsColors", "prefsZoom"] as const;
  const keys = ["keyboardTab", "keyboardSkip", "keyboardActivate", "keyboardEscape", "keyboardSearch"] as const;
  const limitations = t.raw("limitations") as string[];

  return (
    <>
      <Navbar />
      <main id="main-content" tabIndex={-1} role="main" className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
          <div aria-hidden="true" className="tri-stripe mb-10 h-1.5 w-full" />
          <h1 className="display text-[2.4rem] text-foreground md:text-[3.2rem]">{t("title")}</h1>
          <span aria-hidden="true" className="mt-5 block h-[3px] w-12 bg-brand" />
          <p className="kicker mt-5 text-slate">{t("lastUpdated")}</p>

          <div className="mt-10 grid gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12 2xl:grid-cols-[minmax(0,1fr)_24rem] 2xl:gap-16">
          <div
            lang={htmlLang(locale)}
            className="rp-prose min-w-0 space-y-10 font-body text-[0.95rem] leading-[1.75] text-foreground text-justify [hyphens:auto]"
          >
            <section aria-labelledby="a11y-target">
              <h2 id="a11y-target" className={H2}>{t("targetTitle")}</h2>
              <p className="mt-2">{target}</p>
            </section>

            <section aria-labelledby="a11y-prefs">
              <h2 id="a11y-prefs" className={H2}>{t("prefsTitle")}</h2>
              <p className="mt-2">{t("prefsText")}</p>
              <ul className="mt-3 list-disc space-y-1 ps-5">
                {prefs.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
              <p className="mt-4">{t("prefsHere")}</p>
              <p className="mt-4">{t("sandboxTargets")}</p>
            </section>

            <section aria-labelledby="a11y-keyboard">
              <h2 id="a11y-keyboard" className={H2}>{t("keyboardTitle")}</h2>
              <ul className="mt-3 list-disc space-y-1 ps-5">
                {keys.map((k) => (
                  <li key={k}>{t(k)}</li>
                ))}
              </ul>
            </section>

            {/* Known limitations: kept current by hand as gaps are found and fixed. */}
            <section aria-labelledby="a11y-limitations">
              <h2 id="a11y-limitations" className={H2}>{t("limitationsTitle")}</h2>
              <p className="mt-2">{t("limitationsIntro")}</p>
              <ul className="mt-3 list-disc space-y-1 ps-5">
                {limitations.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            </section>

            <section aria-labelledby="a11y-report">
              <h2 id="a11y-report" className={H2}>{t("reportTitle")}</h2>
              <p className="mt-2">
                {t.rich("reportText", {
                  issuesLink: (chunks) => (
                    <a
                      href={ISSUES_URL}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-brand underline decoration-brand/50 underline-offset-4 hover:decoration-brand"
                    >
                      {chunks}
                      <span className="sr-only"> ({a11y("opensInNewTab")})</span>
                    </a>
                  ),
                })}
              </p>
            </section>
          </div>
          {/* The panel itself, beside the text on wide screens. */}
          <aside aria-label={t("prefsTitle")} className="text-start lg:sticky lg:top-24 lg:self-start">
            <ReadingPreferences variant="panel" />
          </aside>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
