"use client";

import Link from "next/link";
import { PostextSandbox, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES } from "postext-sandbox";
import { useTranslations, useLocale } from "next-intl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompactLanguageSwitcher } from "@/components/sandbox/CompactLanguageSwitcher";
import { LogoMark } from "@/components/brand/Logo";
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

/** Cookbook recipes open in the sandbox by link: `#recipe=<slug>&lang=es`
 *  names the recipe's `.postext` bundle, which the capture writes next to
 *  its pages (`public/cookbook/<slug>/<variant>/<slug>.postext`). A recipe
 *  captured in one language only still opens from the other language's
 *  link: the sandbox tries the variants in order. */
const HASH_BUNDLES = {
  recipe: (slug: string, lang: string | null) => {
    if (!RECIPE_SLUG.test(slug)) return null;
    const first = lang === "es" ? "es" : "en";
    const second = first === "es" ? "en" : "es";
    return [first, second].map((variant) => `/cookbook/${slug}/${variant}/${slug}.postext`);
  },
};

export function SandboxPage() {
  const t = useTranslations("Sandbox");
  const locale = useLocale();
  const initialMarkdown = locale === "es" ? DEFAULT_MARKDOWN_ES : DEFAULT_MARKDOWN_EN;
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
