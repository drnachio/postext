import type { Metadata } from "next";
import { routing } from "@/i18n/routing";

export const SITE_URL = "https://postext.dev";
export const SITE_NAME = "Postext";
export const TWITTER_HANDLE = "@postextdev";

const OG_LOCALE: Record<string, string> = {
  en: "en_US",
  es: "es_ES",
};

export function ogLocale(locale: string): string {
  return OG_LOCALE[locale] ?? "en_US";
}

export function alternateOgLocales(locale: string): string[] {
  return routing.locales
    .filter((l) => l !== locale)
    .map((l) => ogLocale(l));
}

function joinPath(path: string): string {
  if (!path || path === "/") return "";
  return path.startsWith("/") ? path : `/${path}`;
}

export function localizedUrl(locale: string, path: string = ""): string {
  return `${SITE_URL}/${locale}${joinPath(path)}`;
}

export interface SeoInput {
  locale: string;
  path?: string;
  title: string;
  description: string;
  ogTitle?: string;
  ogDescription?: string;
  ogImagePath?: string;
  ogImageAlt?: string;
  availableLocales?: readonly string[];
  type?: "website" | "article";
  noindex?: boolean;
  keywords?: string[];
}

export function buildMetadata(input: SeoInput): Metadata {
  const {
    locale,
    path = "",
    title,
    description,
    ogTitle,
    ogDescription,
    ogImagePath,
    ogImageAlt,
    availableLocales,
    type = "website",
    noindex = false,
    keywords,
  } = input;

  const locales = availableLocales ?? routing.locales;
  const url = localizedUrl(locale, path);

  const languages: Record<string, string> = {};
  for (const l of locales) {
    languages[l] = localizedUrl(l, path);
  }
  // x-default points at the default locale
  if (locales.includes(routing.defaultLocale)) {
    languages["x-default"] = localizedUrl(routing.defaultLocale, path);
  }

  const images = ogImagePath
    ? [
        {
          url: ogImagePath,
          width: 1200,
          height: 630,
          alt: ogImageAlt ?? ogTitle ?? title,
        },
      ]
    : undefined;

  return {
    title,
    description,
    keywords,
    alternates: {
      canonical: url,
      languages,
    },
    openGraph: {
      type,
      url,
      siteName: SITE_NAME,
      title: ogTitle ?? title,
      description: ogDescription ?? description,
      locale: ogLocale(locale),
      alternateLocale: alternateOgLocales(locale),
      images,
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle ?? title,
      description: ogDescription ?? description,
      site: TWITTER_HANDLE,
      creator: TWITTER_HANDLE,
      images: ogImagePath ? [ogImagePath] : undefined,
    },
    robots: noindex
      ? {
          index: false,
          follow: false,
          googleBot: { index: false, follow: false },
        }
      : {
          index: true,
          follow: true,
          googleBot: {
            index: true,
            follow: true,
            "max-image-preview": "large",
            "max-snippet": -1,
            "max-video-preview": -1,
          },
        },
  };
}
