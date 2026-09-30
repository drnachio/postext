"use client";

import Link from "next/link";
import { PostextSandbox, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES, DEFAULT_MARKDOWN_ZH_HANS } from "postext-sandbox";
import { useTranslations, useLocale } from "next-intl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompactLanguageSwitcher } from "@/components/sandbox/CompactLanguageSwitcher";
import { LogoMark } from "@/components/brand/Logo";
import { htmlLang, siteLocale, type SiteLocale } from "@/i18n/locales";
import { buildSandboxLabels } from "./labels";

// Private preset bundles are served by /api/private-presets only in local dev
// (POSTEXT_PRIVATE_PRESETS_DIR); production never advertises the source.
// The public showcase bundles ship with the app under `public/presets/`;
// private bundles are only served by the dev-only API route.
const PRESET_SOURCES: { url: string; private?: boolean }[] = [
  { url: "/presets" },
  ...(process.env.NODE_ENV === "production" ? [] : [{ url: "/api/private-presets", private: true }]),
];

const RECIPE_SLUG = /^[a-z0-9-]+$/;

/** The guide's text for each interface language: the Chinese interface
 *  opens its Simplified Chinese edition. */
const GUIDE_MARKDOWN: Record<SiteLocale, string> = {
  en: DEFAULT_MARKDOWN_EN,
  es: DEFAULT_MARKDOWN_ES,
  zh: DEFAULT_MARKDOWN_ZH_HANS,
};

/** Cookbook recipes open in the sandbox by link: `#recipe=<slug>&lang=es`
 *  names the recipe's `.postext` bundle, which the capture writes next to
 *  its pages (`public/cookbook/<slug>/<variant>/<slug>.postext`). A recipe
 *  captured in one language only still opens from the other language's
 *  link: the sandbox tries the variants in order. Recipes are captured in
 *  English and Spanish only: a link in any other language (`lang=zh-Hans`)
 *  tries English first. */
const HASH_BUNDLES = {
  recipe: (slug: string, lang: string | null) => {
    if (!RECIPE_SLUG.test(slug)) return null;
    const first = lang !== null && /^es(-|$)/i.test(lang) ? "es" : "en";
    const second = first === "es" ? "en" : "es";
    return [first, second].map((variant) => `/cookbook/${slug}/${variant}/${slug}.postext`);
  },
};

export function SandboxPage() {
  const t = useTranslations("Sandbox");
  // The package takes the page's BCP 47 tag ("zh-Hans" for the "zh"
  // route): its guide editions, document languages and number formats
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
      hashBundles={HASH_BUNDLES}
      themeToggle={<ThemeToggle compact />}
      languageSwitcher={<CompactLanguageSwitcher />}
      homeLink={
        <Link
          href="/"
          aria-label="Postext"
          className="flex h-8 w-8 items-center justify-center rounded-md transition-colors hover:bg-surface"
        >
          <LogoMark className="size-6 text-[1.5rem]" />
        </Link>
      }
    />
  );
}
