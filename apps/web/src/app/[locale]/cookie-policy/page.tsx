import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import type { Metadata } from "next";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "CookiePolicy" });
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function CookiePolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("CookiePolicy");

  return (
    <>
      <Navbar />
      <main id="main-content" role="main" className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-16 2xl:max-w-6xl 2xl:px-8 2xl:py-20 4xl:max-w-7xl 4xl:px-12 4xl:py-24">
          <h1 className="font-display text-3xl font-bold text-foreground 2xl:text-4xl 4xl:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-slate 2xl:text-base">
            {t("lastUpdated")}
          </p>

          <div lang={locale} className="mt-10 space-y-8 text-sm leading-relaxed text-slate 2xl:text-base 4xl:text-lg lg:columns-2 lg:gap-12 2xl:gap-16 text-justify [hyphens:auto]">
            <section className="break-inside-avoid">
              <h2 className="text-lg font-semibold text-foreground 2xl:text-xl">
                {t("whatAreCookiesTitle")}
              </h2>
              <p className="mt-2">{t("whatAreCookiesText")}</p>
            </section>

            <section className="break-inside-avoid">
              <h2 className="text-lg font-semibold text-foreground 2xl:text-xl">
                {t("cookiesWeUseTitle")}
              </h2>
              <p className="mt-2">{t("cookiesWeUseText")}</p>

              <div className="mt-4 overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b border-rule">
                      <th className="py-3 pr-4 font-mono text-xs uppercase tracking-widest text-slate">
                        {t("tableName")}
                      </th>
                      <th className="py-3 pr-4 font-mono text-xs uppercase tracking-widest text-slate">
                        {t("tableCategory")}
                      </th>
                      <th className="py-3 pr-4 font-mono text-xs uppercase tracking-widest text-slate">
                        {t("tableDuration")}
                      </th>
                      <th className="py-3 font-mono text-xs uppercase tracking-widest text-slate">
                        {t("tablePurpose")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-b border-rule/50">
                      <td className="py-3 pr-4 font-mono text-foreground">
                        postext_consent
                      </td>
                      <td className="py-3 pr-4">{t("categoryNecessary")}</td>
                      <td className="py-3 pr-4">{t("duration365")}</td>
                      <td className="py-3">{t("purposeConsent")}</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </section>

            <section className="break-inside-avoid">
              <h2 className="text-lg font-semibold text-foreground 2xl:text-xl">
                {t("categoriesTitle")}
              </h2>
              <ul className="mt-3 space-y-3">
                <li>
                  <strong className="text-foreground">
                    {t("categoryNecessaryLabel")}
                  </strong>{" "}
                  — {t("categoryNecessaryDesc")}
                </li>
                <li>
                  <strong className="text-foreground">
                    {t("categoryAnalyticsLabel")}
                  </strong>{" "}
                  — {t("categoryAnalyticsDesc")}
                </li>
                <li>
                  <strong className="text-foreground">
                    {t("categoryMarketingLabel")}
                  </strong>{" "}
                  — {t("categoryMarketingDesc")}
                </li>
              </ul>
            </section>

            <section className="break-inside-avoid">
              <h2 className="text-lg font-semibold text-foreground 2xl:text-xl">
                {t("manageCookiesTitle")}
              </h2>
              <p className="mt-2">{t("manageCookiesText")}</p>
            </section>

            <section className="break-inside-avoid">
              <h2 className="text-lg font-semibold text-foreground 2xl:text-xl">
                {t("moreInfoTitle")}
              </h2>
              <p className="mt-2">
                {t.rich("moreInfoText", {
                  privacyLink: (chunks) => (
                    <Link
                      href="/privacy-policy"
                      className="text-foreground underline decoration-rule underline-offset-4 hover:decoration-foreground"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
