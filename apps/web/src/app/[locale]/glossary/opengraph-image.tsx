import { getTranslations } from "next-intl/server";
import {
  generateOgImage,
  ogSize,
  ogContentType,
  ogTextLocale,
} from "@/lib/og-image";

export const alt = "Glossary — Postext";
export const size = ogSize;
export const contentType = ogContentType;

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const textLocale = ogTextLocale(locale);
  const t = await getTranslations({ locale: textLocale, namespace: "Glossary" });

  return generateOgImage({
    title: t("title"),
    description: t("metaDescription"),
    kicker: `Postext · ${t("kicker")}`,
  });
}
