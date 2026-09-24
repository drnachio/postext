import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/landing/Navbar";
import { Footer } from "@/components/landing/Footer";
import type { Metadata } from "next";
import { buildMetadata } from "@/lib/seo";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "PrivacyPolicy" });
  return buildMetadata({
    locale,
    path: "/privacy-policy",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function PrivacyPolicyPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("PrivacyPolicy");

  return (
    <>
      <Navbar />
      <main id="main-content" role="main" className="flex-1">
        <div className="mx-auto max-w-6xl px-6 py-12 md:py-16 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
          <div aria-hidden="true" className="tri-stripe mb-10 h-1.5 w-full" />
          <h1 className="display text-[2.4rem] text-foreground md:text-[3.2rem]">
            {t("title")}
          </h1>
          <span aria-hidden="true" className="mt-5 block h-[3px] w-12 bg-brand" />
          <p className="kicker mt-5 text-slate">
            {t("lastUpdated")}
          </p>

          <div lang={locale} className="mt-10 space-y-8 font-body text-[0.95rem] leading-[1.75] text-foreground/80 lg:columns-2 lg:gap-12 2xl:gap-16 text-justify [hyphens:auto]">
            <section className="break-inside-avoid">
              <h2 className="font-head text-lg font-bold text-brand 2xl:text-xl">
                {t("controllerTitle")}
              </h2>
              <p className="mt-2">{t("controllerText")}</p>
            </section>

            <section className="break-inside-avoid">
              <h2 className="font-head text-lg font-bold text-brand 2xl:text-xl">
                {t("dataCollectedTitle")}
              </h2>
              <p className="mt-2">{t("dataCollectedText")}</p>
            </section>

            <section className="break-inside-avoid">
              <h2 className="font-head text-lg font-bold text-brand 2xl:text-xl">
                {t("legalBasisTitle")}
              </h2>
              <p className="mt-2">{t("legalBasisText")}</p>
            </section>

            <section className="break-inside-avoid">
              <h2 className="font-head text-lg font-bold text-brand 2xl:text-xl">
                {t("cookiesTitle")}
              </h2>
              <p className="mt-2">
                {t.rich("cookiesText", {
                  cookieLink: (chunks) => (
                    <Link
                      href="/cookie-policy"
                      className="font-medium text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand"
                    >
                      {chunks}
                    </Link>
                  ),
                })}
              </p>
            </section>

            <section className="break-inside-avoid">
              <h2 className="font-head text-lg font-bold text-brand 2xl:text-xl">
                {t("rightsTitle")}
              </h2>
              <p className="mt-2">{t("rightsText")}</p>
              <ul className="mt-3 list-inside list-disc space-y-1">
                <li>{t("rightAccess")}</li>
                <li>{t("rightRectification")}</li>
                <li>{t("rightErasure")}</li>
                <li>{t("rightPortability")}</li>
                <li>{t("rightObjection")}</li>
                <li>{t("rightWithdraw")}</li>
              </ul>
            </section>

            <section className="break-inside-avoid">
              <h2 className="font-head text-lg font-bold text-brand 2xl:text-xl">
                {t("childrenTitle")}
              </h2>
              <p className="mt-2">{t("childrenText")}</p>
            </section>

            <section className="break-inside-avoid">
              <h2 className="font-head text-lg font-bold text-brand 2xl:text-xl">
                {t("contactTitle")}
              </h2>
              <p className="mt-2">{t("contactText")}</p>
            </section>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
