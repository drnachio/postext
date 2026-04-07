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

  return generateOgImage({
    title: t("title"),
    description: t("ogDescription"),
  });
}
