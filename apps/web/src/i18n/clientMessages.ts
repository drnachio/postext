/** The message namespaces client components read with `useTranslations`.
 *  The root layout hands only these to `NextIntlClientProvider`: every
 *  namespace travels in each page's inline RSC data, and the rest (legal
 *  pages, landing sections, transcripts…) are read on the server only.
 *  The Sandbox's namespace comes from the sandbox layout's own provider.
 *  `clientMessages.test.ts` fails when a `useTranslations` call names a
 *  namespace missing here. */
export const CLIENT_NAMESPACES = [
  "Accessibility",
  "CodeBlock",
  "CodePen",
  "Cookbook",
  "CookbookRecipe",
  "CookieBanner",
  "Docs",
  "DocsSearch",
  "Language",
  "Navbar",
  "ReadingPrefs",
  "Theme",
] as const;

/** The client namespaces of a locale's messages. */
export function clientMessages<T extends Record<string, unknown>>(messages: T): Partial<T> {
  const keep = new Set<string>(CLIENT_NAMESPACES);
  return Object.fromEntries(Object.entries(messages).filter(([ns]) => keep.has(ns))) as Partial<T>;
}
