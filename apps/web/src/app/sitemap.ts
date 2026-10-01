import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";
import { getAllDocs } from "@/lib/docs";
import { getAllRecipes, recipeHref } from "@/lib/cookbook/recipes";
import { SITE_URL, localizedUrl } from "@/lib/seo";
import { htmlLang } from "@/i18n/locales";

interface PageDef {
  path: string;
  changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
  priority: number;
  locales?: readonly string[];
  lastModified?: string;
}

function buildEntry(
  locale: string,
  page: PageDef
): MetadataRoute.Sitemap[number] {
  const locales = page.locales ?? routing.locales;
  const languages: Record<string, string> = {};
  for (const l of locales) languages[htmlLang(l)] = localizedUrl(l, page.path);
  if (locales.includes(routing.defaultLocale)) {
    languages["x-default"] = localizedUrl(routing.defaultLocale, page.path);
  }

  return {
    url: localizedUrl(locale, page.path),
    lastModified: page.lastModified ? new Date(page.lastModified) : new Date(),
    changeFrequency: page.changeFrequency,
    priority: page.priority,
    alternates: { languages },
  };
}

export default function sitemap(): MetadataRoute.Sitemap {
  const staticPages: PageDef[] = [
    { path: "", changeFrequency: "weekly", priority: 1 },
    { path: "/docs", changeFrequency: "weekly", priority: 0.9 },
    { path: "/cookbook", changeFrequency: "weekly", priority: 0.8 },
    { path: "/glossary", changeFrequency: "monthly", priority: 0.5 },
    { path: "/privacy-policy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/cookie-policy", changeFrequency: "yearly", priority: 0.3 },
    { path: "/license", changeFrequency: "yearly", priority: 0.3 },
    { path: "/accessibility", changeFrequency: "yearly", priority: 0.3 },
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
          lastModified: doc.locales[locale]?.lastUpdated || undefined,
        })
      );
    }
  }

  // Every recipe page exists in both locales (a missing write-up falls back
  // to the other language's). Published recipes only: drafts, even when
  // COOKBOOK_DRAFTS=1 shows them, are noindex.
  const recipeEntries = getAllRecipes().flatMap((recipe) =>
    routing.locales.map((locale) =>
      buildEntry(locale, {
        path: recipeHref(recipe.slug),
        changeFrequency: "monthly",
        priority: 0.7,
        lastModified: recipe.meta.updated,
      })
    )
  );

  // Ensure URLs all sit under SITE_URL
  void SITE_URL;

  return [...staticEntries, ...docEntries, ...recipeEntries];
}
