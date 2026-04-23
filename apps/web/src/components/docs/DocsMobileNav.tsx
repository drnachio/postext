"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import type { DocEntry } from "@/lib/docs";
import type { TocItem } from "@/lib/docs";
import { DocsSearchTrigger } from "./DocsSearchPalette";

interface DocsMobileNavProps {
  docs: DocEntry[];
  toc: TocItem[];
}

export function DocsMobileNav({ docs, toc }: DocsMobileNavProps) {
  const [open, setOpen] = useState(false);
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Docs");

  const availableDocs = docs.filter((d) => d.locales[locale]);

  return (
    <div className="flex items-center gap-2 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? t("closeMenu") : t("openMenu")}
        className="flex items-center gap-2 rounded-md border border-rule px-3 py-1.5 font-body text-sm text-slate transition-colors hover:text-foreground"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
        {t("menu")}
      </button>
      <div className="flex-1">
        <DocsSearchTrigger />
      </div>

      {open && (
        <div className="fixed inset-x-0 top-auto z-40 max-h-[70vh] overflow-y-auto border-b border-rule bg-background p-4 shadow-lg">
          <div className="mb-4">
            <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-widest text-slate">
              {t("sidebarTitle")}
            </h3>
            <ul className="space-y-1">
              {availableDocs.map((doc) => {
                const meta = doc.locales[locale];
                const href = `/${locale}/docs/${doc.slug}`;
                const isActive = pathname === href;
                return (
                  <li key={doc.slug}>
                    <Link
                      href={href}
                      onClick={() => setOpen(false)}
                      className={`block rounded-md px-3 py-1.5 font-body text-sm ${
                        isActive
                          ? "bg-surface text-foreground font-medium"
                          : "text-slate hover:text-foreground"
                      }`}
                    >
                      {meta.sidebarTitle}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>

          {toc.length > 0 && (
            <div>
              <h3 className="mb-2 font-display text-xs font-semibold uppercase tracking-widest text-slate">
                {t("onThisPage")}
              </h3>
              <ul className="space-y-1">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={() => setOpen(false)}
                      className={`block rounded-md py-1 text-sm text-slate hover:text-foreground ${
                        item.level === 3 ? "pl-6" : "pl-3"
                      }`}
                    >
                      {item.text}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
