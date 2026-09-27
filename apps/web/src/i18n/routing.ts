import { defineRouting } from "next-intl/routing";

export const routing = defineRouting({
  locales: ["en", "es"],
  defaultLocale: "en",
  localeDetection: true,
  // Every page's <head> declares its hreflang alternates (lib/seo.ts
  // buildMetadata, x-default = the /en URL); the middleware's Link header
  // would contradict it (x-default = the unprefixed, redirecting URL).
  alternateLinks: false,
});
