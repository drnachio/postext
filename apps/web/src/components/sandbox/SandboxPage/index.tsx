"use client";

import Link from "next/link";
import { PostextSandbox, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_CA, DEFAULT_MARKDOWN_ZH_HANS, DEFAULT_MARKDOWN_AR, DEFAULT_MARKDOWN_JA, DEFAULT_MARKDOWN_PT_BR, DEFAULT_MARKDOWN_FR, DEFAULT_MARKDOWN_DE, DEFAULT_MARKDOWN_IT } from "postext-sandbox";
import { useTranslations, useLocale } from "next-intl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompactLanguageSwitcher } from "@/components/sandbox/CompactLanguageSwitcher";
import { LogoMark } from "@/components/brand/Logo";
import { htmlLang, siteLocale, type SiteLocale } from "@/i18n/locales";
import { recipeBundleCandidates, recipeBundleEditions } from "@/lib/cookbook/sandboxBundles";
import { buildSandboxLabels } from "./labels";

// Private preset bundles are served by /api/private-presets only in local dev
// (POSTEXT_PRIVATE_PRESETS_DIR); production never advertises the source.
// The public showcase bundles ship with the app under `public/presets/`;
// private bundles are only served by the dev-only API route.
const PRESET_SOURCES: { url: string; private?: boolean }[] = [
  { url: "/presets" },
  ...(process.env.NODE_ENV === "production" ? [] : [{ url: "/api/private-presets", private: true }]),
];

/** The designs the Designs gallery ships with (#1523), written by
 *  `pnpm --filter web designs` (scripts/designs/build.ts). */
const SHIPPED_DESIGNS = [
  "novel", "manual", "magazine", "two-colour",
  // A language's composition rules alone (#1540).
  "composition-es", "composition-en-us", "composition-en-gb", "composition-fr", "composition-de",
].map((id) => `/designs/${id}.postext`);

/** The guide's text for each interface language: the Chinese interface
 *  opens its Simplified Chinese edition, the Japanese one its Japanese
 *  edition (set vertically), the Portuguese one its Brazilian edition, the
 *  French one its French edition, the German one its German edition, the Italian one its Italian edition. */
const GUIDE_MARKDOWN: Record<SiteLocale, string> = {
  en: DEFAULT_MARKDOWN_EN,
  es: DEFAULT_MARKDOWN_ES,
  ca: DEFAULT_MARKDOWN_CA,
  zh: DEFAULT_MARKDOWN_ZH_HANS,
  ja: DEFAULT_MARKDOWN_JA,
  ar: DEFAULT_MARKDOWN_AR,
  pt: DEFAULT_MARKDOWN_PT_BR,
  fr: DEFAULT_MARKDOWN_FR,
  de: DEFAULT_MARKDOWN_DE,
  it: DEFAULT_MARKDOWN_IT,
};

/** `#recipe=<slug>&lang=<tag>` opens a Cookbook recipe's bundle: the edition
 *  the link names, then the ones most recipes have (lib/cookbook/sandboxBundles). */
const HASH_BUNDLES = { recipe: recipeBundleCandidates };
/** The languages a recipe was captured in, for the Canvas's language
 *  switcher and the side-by-side view (#1011). */
const HASH_BUNDLE_EDITIONS = { recipe: recipeBundleEditions };

export function SandboxPage() {
  const t = useTranslations("Sandbox");
  // The package takes the page's BCP 47 tag ("zh-Hans" for the "zh"
  // route, "ja" for "ja"): its guide editions, document languages and number formats
  // all read it.
  const site = siteLocale(useLocale());
  const locale = htmlLang(site);
  const initialMarkdown = GUIDE_MARKDOWN[site];
  const labels = buildSandboxLabels(t);

  return (
    <PostextSandbox
      initialMarkdown={initialMarkdown}
      labels={labels}
      locale={locale}
      presetSources={PRESET_SOURCES}
      outputProfileBaseUrl="/icc/"
      designUrls={SHIPPED_DESIGNS}
      hashBundles={HASH_BUNDLES}
      hashBundleEditions={HASH_BUNDLE_EDITIONS}
      themeToggle={<ThemeToggle compact />}
      languageSwitcher={<CompactLanguageSwitcher />}
      homeLink={
        <Link
          href="/"
          aria-label="Postext"
          className="flex h-full w-full items-center justify-center transition-colors hover:bg-surface focus-visible:-outline-offset-2"
        >
          <LogoMark className="size-6 text-[1.5rem]" />
        </Link>
      }
    />
  );
}
