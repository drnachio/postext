import { getTranslations } from "next-intl/server";
import {
  generateOgImage,
  ogSize,
  ogContentType,
} from "@/lib/og-image";

export const alt = "Postext — Programmable Typesetter for the Web";
export const size = ogSize;
export const contentType = ogContentType;

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "Metadata" });
  const hero = await getTranslations({ locale, namespace: "Hero" });

  return generateOgImage({
    title: hero.raw("title") as string,
    description: t("ogDescription"),
    kicker: hero("kicker"),
  });
}
