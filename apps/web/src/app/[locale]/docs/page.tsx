import { getTranslations, setRequestLocale } from "next-intl/server";
import type { Metadata } from "next";
import { Link } from "@/i18n/navigation";
import { getAllDocs } from "@/lib/docs";
import { buildMetadata } from "@/lib/seo";
import { docPart, partClass, type DocPart } from "@/lib/docParts";
import { Kicker } from "@/components/brand/Kicker";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations({ locale, namespace: "DocsIndex" });
  return buildMetadata({
    locale,
    path: "/docs",
    title: t("metaTitle"),
    description: t("metaDescription"),
    ogTitle: t("ogTitle"),
    ogDescription: t("ogDescription"),
  });
}

const PART_LABEL_KEY = {
  foundations: "partFoundations",
  craft: "partCraft",
  practice: "partPractice",
} as const;

/** The docs index is the book's contents page: parts headed by their
 *  colour, chapters numbered in it, a dotted leader to the reading time,
 *  and each chapter's description as the subtitle line. */
export default async function DocsIndexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale);
  const t = await getTranslations("Docs");

  const docs = getAllDocs().filter((d) => d.locales[locale]);
  const groups: { part: DocPart; items: { slug: string; n: number; title: string; description: string; readingTime: string }[] }[] = [];
  docs.forEach((doc, i) => {
    const meta = doc.locales[locale]!;
    const part = docPart(meta.order);
    const item = { slug: doc.slug, n: i + 1, title: meta.sidebarTitle, description: meta.description, readingTime: meta.readingTime };
    const last = groups[groups.length - 1];
    if (last && last.part.key === part.key) last.items.push(item);
    else groups.push({ part, items: [item] });
  });

  return (
    <main id="main-content" className="min-w-0 flex-1 px-4 py-8 lg:px-10 lg:py-12 2xl:px-14">
      <div aria-hidden="true" className="tri-stripe h-1.5 w-full" />
      <Kicker className="mt-8 text-slate">{t("contentsKicker")}</Kicker>
      <h1 className="display mt-3 text-[2.6rem] md:text-[3.4rem]">{t("contentsTitle")}</h1>
      <span aria-hidden="true" className="mt-4 block h-[3px] w-12 bg-brand" />
      <p className="mt-5 max-w-2xl font-body text-lg leading-relaxed text-foreground/80 italic">{t("contentsLead")}</p>

      <div className="mt-12 max-w-3xl space-y-12">
        {groups.map(({ part, items }) => (
          <section key={part.key} className={partClass(part.color)} aria-labelledby={`part-${part.key}`}>
            <h2 id={`part-${part.key}`} className="kicker flex items-center gap-3 text-(--part-ink)">
              <span aria-hidden="true" className="size-3.5 bg-(--part)" />
              {t("part")} {part.number} · {t(PART_LABEL_KEY[part.key])}
            </h2>
            <ol className="mt-4 divide-y divide-rule border-y border-rule">
              {items.map((it) => (
                <li key={it.slug}>
                  <Link href={`/docs/${it.slug}`} className="group flex gap-4 py-4 md:gap-5">
                    <span className="w-7 shrink-0 pt-1 text-right font-sans text-sm font-bold text-(--part-ink) tabular-nums">
                      {it.n}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-baseline gap-3">
                        <span className="font-display text-xl font-semibold tracking-[-0.01em] transition-colors group-hover:text-(--part-ink) md:text-2xl">
                          {it.title}
                        </span>
                        <span aria-hidden="true" className="mb-1.5 min-w-8 flex-1 border-b-2 border-dotted border-rule-strong" />
                        {it.readingTime && (
                          <span className="shrink-0 font-sans text-xs font-bold text-foreground/80">
                            <span className="sr-only">{t("readingTime")}: </span>
                            {it.readingTime}
                          </span>
                        )}
                      </span>
                      {it.description && (
                        <span className="mt-1 block font-body text-[0.92rem] leading-snug text-slate italic">{it.description}</span>
                      )}
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </section>
        ))}
      </div>
    </main>
  );
}
