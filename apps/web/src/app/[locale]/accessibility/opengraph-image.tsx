import { getTranslations } from "next-intl/server";
import {
  generateOgImage,
  ogSize,
  ogContentType,
  ogTextLocale,
} from "@/lib/og-image";

export const alt = "Accessibility — Postext";
export const size = ogSize;
export const contentType = ogContentType;

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const textLocale = ogTextLocale(locale);
  const t = await getTranslations({ locale: textLocale, namespace: "AccessibilityStatement" });
  const footer = await getTranslations({ locale: textLocale, namespace: "Footer" });

  return generateOgImage({
    title: t("title"),
    description: t("metaDescription"),
    kicker: `Postext · ${footer("legal")}`,
  });
}
