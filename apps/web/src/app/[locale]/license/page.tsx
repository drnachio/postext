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
        <div className="mx-auto max-w-5xl px-6 py-16 2xl:max-w-6xl 2xl:px-8 2xl:py-20 4xl:max-w-7xl 4xl:px-12 4xl:py-24">
          <h1 className="font-display text-3xl font-bold text-foreground 2xl:text-4xl 4xl:text-5xl">
            {t("title")}
          </h1>
          <p className="mt-2 text-sm text-slate 2xl:text-base">
            {t("copyright")}
          </p>

          <div className="mt-10 space-y-6 text-sm leading-relaxed text-slate 2xl:text-base 4xl:text-lg lg:columns-2 lg:gap-12 2xl:gap-16 text-justify [hyphens:auto]">
            <p className="break-inside-avoid">{t("grant")}</p>
            <p className="break-inside-avoid">{t("condition")}</p>
            <p className="break-inside-avoid">{t("disclaimer")}</p>
          </div>

          <div className="mt-10 border-t border-rule pt-6">
            <p className="text-sm text-slate 2xl:text-base 4xl:text-lg">
              {t.rich("sourceText", {
                repoLink: (chunks) => (
                  <a
                    href="https://github.com/drnachio/postext"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-foreground underline decoration-rule underline-offset-4 hover:decoration-foreground"
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
