import { getTranslations } from "next-intl/server";
import {
  generateOgImage,
  ogSize,
  ogContentType,
} from "@/lib/og-image";

export const alt = "MIT License — Postext";
export const size = ogSize;
export const contentType = ogContentType;

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "License" });
  const footer = await getTranslations({ locale, namespace: "Footer" });

  return generateOgImage({
    title: t("title"),
    description: t("metaDescription"),
    kicker: `Postext · ${footer("legal")}`,
  });
}
