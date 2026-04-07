import type { MetadataRoute } from "next";
import { routing } from "@/i18n/routing";

const BASE_URL = "https://postext.dev";

const pages = [
  { path: "", changeFrequency: "weekly" as const, priority: 1 },
  { path: "/privacy-policy", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/cookie-policy", changeFrequency: "yearly" as const, priority: 0.3 },
  { path: "/license", changeFrequency: "yearly" as const, priority: 0.3 },
];

export default function sitemap(): MetadataRoute.Sitemap {
  return routing.locales.flatMap((locale) =>
    pages.map(({ path, changeFrequency, priority }) => ({
      url: `${BASE_URL}/${locale}${path}`,
      lastModified: new Date(),
      changeFrequency,
      priority,
    }))
  );
}
