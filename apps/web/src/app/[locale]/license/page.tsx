import { setRequestLocale } from "next-intl/server";
import { getTranslations } from "next-intl/server";
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
  const t = await getTranslations({ locale, namespace: "License" });
  return buildMetadata({
    locale,
    path: "/license",
    title: t("metaTitle"),
    description: t("metaDescription"),
  });
}

export default async function LicensePage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("License");

  return (
    <>
      <Navbar />
      <main id="main-content" role="main" className="flex-1">
        <div className="mx-auto max-w-5xl px-6 py-12 md:py-16 2xl:max-w-6xl 2xl:px-8 4xl:max-w-7xl 4xl:px-12">
          <div aria-hidden="true" className="tri-stripe mb-10 h-1.5 w-full" />
          <h1 className="display text-[2.4rem] text-foreground md:text-[3.2rem]">
            {t("title")}
          </h1>
          <span aria-hidden="true" className="mt-5 block h-[3px] w-12 bg-brand" />
          <p className="kicker mt-5 text-slate">
            {t("copyright")}
          </p>

          <div className="mt-10 space-y-6 font-body text-[0.95rem] leading-[1.75] text-foreground/80 lg:columns-2 lg:gap-12 2xl:gap-16 text-justify [hyphens:auto]">
            <p className="break-inside-avoid">{t("grant")}</p>
            <p className="break-inside-avoid">{t("condition")}</p>
            <p className="break-inside-avoid">{t("disclaimer")}</p>
          </div>

          <div className="mt-10 border-t border-rule pt-6">
            <p className="font-sans text-sm text-slate 2xl:text-base">
              {t.rich("sourceText", {
                repoLink: (chunks) => (
                  <a
                    href="https://github.com/drnachio/postext"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="font-medium text-brand underline decoration-brand/30 underline-offset-4 hover:decoration-brand"
                  >
                    {chunks}
                  </a>
                ),
              })}
            </p>
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
}
