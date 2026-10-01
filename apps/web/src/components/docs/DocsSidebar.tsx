"use client";

import { useLocale, useTranslations } from "next-intl";
import Link from "next/link";
import type { DocEntry } from "@/lib/docs";
import { DocsSearchTrigger } from "./DocsSearchPalette";
import { DocsPartsNav } from "./DocsParts";

interface DocsSidebarProps {
  docs: DocEntry[];
}

export function DocsSidebar({ docs }: DocsSidebarProps) {
  const t = useTranslations("Docs");
  const a11y = useTranslations("Accessibility");
  const locale = useLocale();

  return (
    <aside aria-label={a11y("docsContents")} className="sticky top-[var(--docs-nav-h)] hidden h-[calc(100vh-var(--docs-nav-h))] w-56 shrink-0 overflow-y-auto border-r border-rule py-6 pr-4 pl-1 lg:block 2xl:w-64">
      <div className="mb-5">
        <DocsSearchTrigger />
      </div>
      <Link
        href={`/${locale}/docs`}
        className="kicker mb-3 flex min-h-10 items-center px-3 text-slate transition-colors hover:text-foreground"
      >
        {t("contentsTitle")}
      </Link>
      <nav aria-label={t("sidebarTitle")}>
        <DocsPartsNav docs={docs} />
      </nav>
      <Link
        href={`/${locale}/glossary`}
        className="mt-6 flex min-h-11 items-center border-t border-rule px-3 pt-1 font-sans text-[0.8rem] text-slate transition-colors hover:text-foreground 2xl:text-sm"
      >
        {t("glossary")}
      </Link>
    </aside>
  );
}
