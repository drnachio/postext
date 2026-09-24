"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import type { DocEntry } from "@/lib/docs";
import { docPart, partClass, type DocPart } from "@/lib/docParts";
import { cn } from "@/lib/utils";

const PART_LABEL_KEY = {
  foundations: "partFoundations",
  craft: "partCraft",
  practice: "partPractice",
} as const;

/** The docs as the guide's contents: grouped in parts, each part headed
 *  by a colour square and its tracked label, each chapter numbered in the
 *  part colour. Shared by the sidebar and the mobile menu. */
export function DocsPartsNav({ docs, onNavigate }: { docs: DocEntry[]; onNavigate?: () => void }) {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("Docs");

  const available = docs.filter((d) => d.locales[locale]);
  const groups: { part: DocPart; docs: DocEntry[] }[] = [];
  for (const doc of available) {
    const part = docPart(doc.locales[locale]!.order);
    const last = groups[groups.length - 1];
    if (last && last.part.key === part.key) last.docs.push(doc);
    else groups.push({ part, docs: [doc] });
  }

  let n = 0;
  return (
    <div className="space-y-6">
      {groups.map(({ part, docs: partDocs }) => (
        <div key={part.key} className={partClass(part.color)}>
          <p className="kicker flex items-center gap-2 px-3 text-[0.6rem] tracking-[0.12em] whitespace-nowrap text-(--part-ink)">
            <span aria-hidden="true" className="size-2.5 shrink-0 bg-(--part)" />
            {t("part")} {part.number} · {t(PART_LABEL_KEY[part.key])}
          </p>
          <ul className="mt-2 space-y-0.5">
            {partDocs.map((doc) => {
              n += 1;
              const meta = doc.locales[locale]!;
              const href = `/${locale}/docs/${doc.slug}`;
              const isActive = pathname === href;
              return (
                <li key={doc.slug}>
                  <Link
                    href={href}
                    onClick={onNavigate}
                    aria-current={isActive ? "page" : undefined}
                    className={cn(
                      "group flex items-baseline gap-2.5 rounded-r-md border-l-[3px] py-1.5 pr-2 pl-3 font-sans text-[0.8rem] transition-colors 2xl:text-sm",
                      isActive
                        ? "border-(--part) bg-surface font-semibold text-foreground"
                        : "border-transparent text-slate hover:border-rule-strong hover:text-foreground",
                    )}
                  >
                    <span className="w-3 shrink-0 text-right font-bold text-(--part-ink) tabular-nums">{n}</span>
                    <span>{meta.sidebarTitle}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
