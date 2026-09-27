"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import type { DocEntry } from "@/lib/docs";
import type { TocItem } from "@/lib/docs";
import { DocsSearchTrigger } from "./DocsSearchPalette";
import { DocsPartsNav } from "./DocsParts";

interface DocsMobileNavProps {
  docs: DocEntry[];
  toc: TocItem[];
}

export function DocsMobileNav({ docs, toc }: DocsMobileNavProps) {
  const [open, setOpen] = useState(false);
  const t = useTranslations("Docs");

  return (
    <div className="flex items-center gap-2 lg:hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        aria-label={open ? t("closeMenu") : t("openMenu")}
        className="flex min-h-10 items-center gap-2 rounded-md border border-rule px-3 py-1.5 font-sans text-sm font-medium text-slate transition-colors hover:text-foreground"
      >
        {open ? <X className="size-4" /> : <Menu className="size-4" />}
        {t("menu")}
      </button>
      <div className="min-w-0 flex-1">
        <DocsSearchTrigger className="min-h-10" />
      </div>

      {open && (
        <div className="absolute inset-x-0 top-full z-40 mt-2 max-h-[70vh] overflow-y-auto overscroll-contain rounded-md border border-rule bg-background p-4 shadow-lg">
          <div className="mb-5">
            <DocsPartsNav docs={docs} onNavigate={() => setOpen(false)} />
          </div>

          {toc.length > 0 && (
            <div>
              <h3 className="kicker mb-2 text-slate">
                {t("onThisPage")}
              </h3>
              <ul className="space-y-1">
                {toc.map((item) => (
                  <li key={item.id}>
                    <a
                      href={`#${item.id}`}
                      onClick={() => setOpen(false)}
                      className={`block rounded-md py-2 font-sans text-sm text-slate hover:text-foreground ${
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
