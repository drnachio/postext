import { routing } from "@/i18n/routing";
import {
  generateOgImage,
  ogSize,
  ogContentType,
} from "@/lib/og-image";
import { getTranslations } from "next-intl/server";
import { getDocSource, getDocSlugsForLocale } from "@/lib/docs";
import { docPart } from "@/lib/docParts";

export const alt = "Postext — Documentation";

/** Part colours legible as small caps on night (the vermilion lifted). */
const PART_INK = { blue: "#7f97f0", gilt: "#d8a21a", vermilion: "#e6765f" } as const;
export const size = ogSize;
export const contentType = ogContentType;

export async function generateStaticParams() {
  const params: { locale: string; slug: string }[] = [];
  for (const locale of routing.locales) {
    for (const slug of getDocSlugsForLocale(locale)) {
      params.push({ locale, slug });
    }
  }
  return params;
}

export default async function OgImage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug } = await params;
  const doc = getDocSource(slug, locale);

  const title = doc?.meta.title ?? "Postext";
  const description = doc?.meta.description;
  if (!doc) return generateOgImage({ title, description });

  const t = await getTranslations({ locale, namespace: "Docs" });
  const part = docPart(doc.meta.order);
  const name = t(`part${part.key[0]!.toUpperCase()}${part.key.slice(1)}` as "partFoundations");

  return generateOgImage({
    title,
    description,
    kicker: `${t("part")} ${part.number} · ${name}`,
    accent: PART_INK[part.color],
  });
}
