import { getTranslations } from "next-intl/server";
import { routing } from "@/i18n/routing";
import { generateOgImage, ogSize, ogContentType } from "@/lib/og-image";

export const alt = "Postext — Cookbook";
export const size = ogSize;
export const contentType = ogContentType;

// Rendered once per locale at build time (a route handler does not inherit
// the layout's params), not on every request.
export const dynamicParams = false;

export function generateStaticParams() {
  return routing.locales.map((locale) => ({ locale }));
}

export default async function OgImage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Cookbook" });

  return generateOgImage({
    // The title carries an <em> word, set in gilt italic like the page's.
    title: t.raw("ogTitle") as string,
    description: t("ogDescription"),
    kicker: t("kicker"),
  });
}
