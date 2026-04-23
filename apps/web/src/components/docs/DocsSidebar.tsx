"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { DocEntry } from "@/lib/docs";
import { DocsSearchTrigger } from "./DocsSearchPalette";

interface DocsSidebarProps {
  docs: DocEntry[];
}

export function DocsSidebar({ docs }: DocsSidebarProps) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Docs");

  const availableDocs = docs.filter((d) => d.locales[locale]);

  return (
    <aside className="sticky top-[var(--docs-nav-h)] hidden h-[calc(100vh-var(--docs-nav-h))] w-56 shrink-0 overflow-y-auto border-r border-rule py-6 pl-1 pr-4 lg:block 2xl:w-64">
      <div className="mb-4">
        <DocsSearchTrigger />
      </div>
      <h2 className="mb-4 font-display text-xs font-semibold uppercase tracking-widest text-slate 2xl:text-sm">
        {t("sidebarTitle")}
      </h2>
      <nav aria-label={t("sidebarTitle")}>
        <ul className="space-y-1">
          {availableDocs.map((doc) => {
            const meta = doc.locales[locale];
            const href = `/${locale}/docs/${doc.slug}`;
            const isActive = pathname === href;

            return (
              <li key={doc.slug}>
                <Link
                  href={href}
                  className={`block rounded-md px-3 py-1.5 font-body text-sm transition-colors 2xl:text-base ${
                    isActive
                      ? "bg-surface text-foreground font-medium"
                      : "text-slate hover:bg-surface/50 hover:text-foreground"
                  }`}
                >
                  {meta.sidebarTitle}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
