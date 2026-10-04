import { getTranslations } from "next-intl/server";
import {
  generateOgImage,
  ogSize,
  ogContentType,
  ogTextLocale,
} from "@/lib/og-image";

export const alt = "Postext — Sandbox";
export const size = ogSize;
export const contentType = ogContentType;

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const textLocale = ogTextLocale(locale);
  const t = await getTranslations({ locale: textLocale, namespace: "Sandbox" });
  const hero = await getTranslations({ locale: textLocale, namespace: "Hero" });

  return generateOgImage({
    title: "Sandbox",
    description: t("metaDescription"),
    kicker: hero("kicker"),
  });
}
