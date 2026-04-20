import { routing } from "@/i18n/routing";
import {
  generateOgImage,
  ogSize,
  ogContentType,
} from "@/lib/og-image";
import { getDocSource, getDocSlugsForLocale } from "@/lib/docs";

export const alt = "Postext — Documentation";
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

  return generateOgImage({ title, description });
}
