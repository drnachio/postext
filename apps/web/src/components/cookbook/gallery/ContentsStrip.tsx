import { getTranslations } from "next-intl/server";
import type { Locale } from "@/lib/cookbook/types";
import type { GalleryPart } from "./data";
import { chapterHref } from "./links";

/** The book's contents under the frontispiece: the three parts side by
 *  side, each chapter with its number, a dotted leader and its count, a
 *  link to the chapter's recipes. On phones, a row of chapter chips. */
export async function ContentsStrip({ parts, locale }: { parts: GalleryPart[]; locale: Locale }) {
  const t = await getTranslations("Cookbook");
  const chapters = parts.flatMap((part) => part.chapters.map((c) => ({ ...c, color: part.color })));

  return (
    <nav
      aria-labelledby="cb-contents"
      className="cb-book mx-auto max-w-6xl px-4 pt-9 pb-7 sm:px-6 lg:pt-11 2xl:max-w-7xl 2xl:px-8"
    >
      <h2 id="cb-contents" className="kicker text-slate">
        {t("contents")}
      </h2>

      <div className="mt-5 hidden gap-x-10 gap-y-8 sm:grid sm:grid-cols-2 lg:grid-cols-3">
        {parts.map((part) => (
          <div key={part.id} className={`part-${part.color}`}>
            <h3 className="kicker flex items-center gap-2.5 text-(--part-ink)">
              <span aria-hidden="true" className="size-3 shrink-0 bg-(--part)" />
              {part.number} · {part.title}
            </h3>
            <ol className="mt-3 space-y-0.5">
              {part.chapters.map((c) => (
                <li key={c.id}>
                  <a
                    href={chapterHref(locale, c.id)}
                    data-cb-cat={c.id}
                    className="group flex min-h-10 items-baseline gap-3 rounded-sm py-2"
                  >
                    <span className="w-5 shrink-0 text-end font-sans text-sm font-bold text-(--part-ink) tabular-nums">
                      {c.number}
                    </span>
                    <span className="font-display text-[1.05rem] font-semibold tracking-[-0.01em] transition-colors group-hover:text-(--part-ink)">
                      {c.title}
                    </span>
                    <span aria-hidden="true" className="cb-leader" />
                    <span className="shrink-0 font-sans text-xs font-semibold text-slate tabular-nums">
                      <span aria-hidden="true">{c.count}</span>
                      <span className="sr-only">{t("chapterCount", { count: c.count })}</span>
                    </span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        ))}
      </div>

      <ul className="cb-scroll-row -mx-4 mt-4 flex gap-2 px-4 sm:hidden">
        {chapters.map((c) => (
          <li key={c.id} className={`part-${c.color} shrink-0`}>
            <a
              href={chapterHref(locale, c.id)}
              data-cb-cat={c.id}
              className="inline-flex h-11 items-center gap-2 rounded-full bg-surface px-4 font-sans text-[0.8rem] font-medium whitespace-nowrap"
            >
              <span aria-hidden="true" className="size-2 bg-(--part)" />
              <span className="font-bold text-(--part-ink) tabular-nums">{c.number}</span>
              {c.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  );
}
