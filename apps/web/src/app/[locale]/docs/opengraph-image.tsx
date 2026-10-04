import { getTranslations } from "next-intl/server";
import {
  generateOgImage,
  ogSize,
  ogContentType,
  ogTextLocale,
} from "@/lib/og-image";

export const alt = "Postext — Documentation";
export const size = ogSize;
export const contentType = ogContentType;

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const textLocale = ogTextLocale(locale);
  const t = await getTranslations({ locale: textLocale, namespace: "DocsIndex" });
  const docs = await getTranslations({ locale: textLocale, namespace: "Docs" });

  return generateOgImage({
    title: t("ogTitle"),
    description: t("ogDescription"),
    kicker: docs("contentsKicker"),
  });
}
