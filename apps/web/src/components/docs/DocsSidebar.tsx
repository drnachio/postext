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
  const locale = useLocale();

  return (
    <aside className="sticky top-[var(--docs-nav-h)] hidden h-[calc(100vh-var(--docs-nav-h))] w-56 shrink-0 overflow-y-auto border-r border-rule py-6 pr-4 pl-1 lg:block 2xl:w-64">
      <div className="mb-5">
        <DocsSearchTrigger />
      </div>
      <Link
        href={`/${locale}/docs`}
        className="kicker mb-5 block px-3 text-slate transition-colors hover:text-foreground"
      >
        {t("contentsTitle")}
      </Link>
      <nav aria-label={t("sidebarTitle")}>
        <DocsPartsNav docs={docs} />
      </nav>
    </aside>
  );
}
