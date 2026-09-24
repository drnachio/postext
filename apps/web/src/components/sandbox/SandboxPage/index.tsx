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
      themeToggle={<ThemeToggle />}
      languageSwitcher={<CompactLanguageSwitcher />}
      homeLink={
        <Link
          href="/"
          aria-label="Postext"
          className="flex h-10 w-10 items-center justify-center rounded-md transition-colors hover:bg-surface"
        >
          <LogoMark className="size-7 text-[1.75rem]" />
        </Link>
      }
    />
  );
}
