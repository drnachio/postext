"use client";

import Link from "next/link";
import { PostextSandbox } from "postext-sandbox";
import { useTranslations } from "next-intl";
import { ThemeToggle } from "@/components/ThemeToggle";
import { CompactLanguageSwitcher } from "@/components/sandbox/CompactLanguageSwitcher";
import type { SandboxLabels } from "postext-sandbox";

export function SandboxPage() {
  const t = useTranslations("Sandbox");

  const labels: SandboxLabels = {
    configuration: t("configuration"),
    resources: t("resources"),
    markdownEditor: t("markdownEditor"),
    canvas: t("canvas"),
    html: t("html"),
    pdf: t("pdf"),
    comingSoon: t("comingSoon"),
    resourcesComingSoonDescription: t("resourcesComingSoonDescription"),
    pdfComingSoonDescription: t("pdfComingSoonDescription"),
    columns: t("columns"),
    gutter: t("gutter"),
    columnBalancing: t("columnBalancing"),
    typography: t("typography"),
    orphans: t("orphans"),
    widows: t("widows"),
    hyphenation: t("hyphenation"),
    ragOptimization: t("ragOptimization"),
    references: t("references"),
    footnotes: t("footnotes"),
    footnotePlacement: t("footnotePlacement"),
    footnoteMarker: t("footnoteMarker"),
    figureNumbering: t("figureNumbering"),
    tableNumbering: t("tableNumbering"),
    marginNotes: t("marginNotes"),
    resourcePlacement: t("resourcePlacement"),
    defaultStrategy: t("defaultStrategy"),
    deferPlacement: t("deferPlacement"),
    preserveAspectRatio: t("preserveAspectRatio"),
    renderer: t("renderer"),
    bold: t("bold"),
    italic: t("italic"),
    heading: t("heading"),
    link: t("link"),
    code: t("code"),
    blockquote: t("blockquote"),
    orderedList: t("orderedList"),
    unorderedList: t("unorderedList"),
    save: t("save"),
    load: t("load"),
    exportFile: t("exportFile"),
    importFile: t("importFile"),
    reset: t("reset"),
  };

  return (
    <PostextSandbox
      labels={labels}
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
