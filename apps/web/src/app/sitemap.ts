import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getAllDocs } from "@/lib/docs";
import { SITE_URL, localizedUrl } from "@/lib/seo";

interface PageDef {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  locales?: readonly string[];
}

function buildEntry(
  locale: string,
  page: PageDef
): MetadataRoute.Sitemap[number] {
  const locales = page.locales ?? routing.locales;
  const languages: Record<string, string> = {};
  for (const l of locales) languages[l] = localizedUrl(l, page.path);
  if (locales.includes(routing.defaultLocale)) {
    languages["x-default"] = localizedUrl(routing.defaultLocale, page.path);
  }

  return {
    url: localizedUrl(locale, page.path),
    lastModified: new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    alternates: { languages },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: PageDef[] = [
    { path: "", changeFrequency: "weekly", priority: 1 },
    { path: "/docs", changeFrequency: "weekly", priority: 0.9 },
    { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/cookie-policy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/license", changeFrequency: "yearly", priority: 0.3 },
  ];

  const staticEntries = routing.locales.flatMap((locale) =>
    staticPages.map((page) => buildEntry(locale, page))
  );

  const docs = getAllDocs();
  const docEntries: MetadataRoute.Sitemap = [];
  for (const doc of docs) {
    const localesWithDoc = Object.keys(doc.locales) as string[];
    const availableLocales = routing.locales.filter((l) =>
      localesWithDoc.includes(l)
    );
    for (const locale of availableLocales) {
      docEntries.push(
        buildEntry(locale, {
          path: `/docs/${doc.slug}`,
          changeFrequency: "monthly",
          priority: 0.8,
          locales: availableLocales,
        })
      );
    }
  }

  // Ensure URLs all sit under SITE_URL
  void SITE_URL;

  return [...staticEntries, ...docEntries];
}
