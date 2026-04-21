"use client";

import Link from "next/link";
import { PostextSandbox, DEFAULT_MARKDOWN_EN, DEFAULT_MARKDOWN_ES } from "postext-sandbox";
import { useTranslations, useLocale } from "next-intl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompactLanguageSwitcher } from "@/components/sandbox/CompactLanguageSwitcher";
import { buildSandboxLabels } from "./labels";

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
      themeToggle={<ThemeToggle />}
      languageSwitcher={<CompactLanguageSwitcher />}
      homeLink={
        <Link
          href="/"
          className="flex h-10 w-10 items-center justify-center rounded-md transition-colors focus-visible:outline-none focus-visible:ring-2"
          style={{ color: "var(--gilt)", outlineColor: "var(--accent-blue)" }}
          onMouseEnter={(e) => {
            e.currentTarget.style.backgroundColor = "var(--surface)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.backgroundColor = "transparent";
          }}
        >
          <span
            className="text-2xl font-black leading-none"
            style={{
              fontFamily:
                'var(--font-logo, var(--font-cormorant, "Cormorant Garamond", Georgia, serif))',
            }}
          >
            P
          </span>
        </Link>
      }
    />
  );
}
