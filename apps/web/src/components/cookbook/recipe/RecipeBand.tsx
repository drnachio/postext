import Link from "next/link";
import { Kicker } from "@/components/brand/Kicker";
import { PART_CLASSES } from "@/components/brand/partColors";
import { cn } from "@/lib/utils";
import { LevelSquares } from "@/components/cookbook/RecipeCard";
import { galleryHref, type RecipeT, type RecipeView } from "./model";

/** "Cookbook › Output & integration" over the band. */
export function RecipeBreadcrumb({ view, t }: { view: RecipeView; t: RecipeT }) {
  const { locale, chapter } = view;
  return (
    <nav aria-label={t("breadcrumbLabel")} className="cb-container pt-4 pb-3">
      <ol className="kicker flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.62rem] text-slate">
        <li>
          <Link href={galleryHref(locale)} className="transition-colors hover:text-foreground">
            {t("cookbook")}
          </Link>
        </li>
        <li aria-hidden="true">›</li>
        <li>
          <Link href={galleryHref(locale, "cat", chapter.id)} className="transition-colors hover:text-foreground">
            {chapter.title[locale]}
          </Link>
        </li>
      </ol>
    </nav>
  );
}

/** The chapter band (the docs' opener pattern, full bleed): kicker, the
 *  title, the summary as the lead, the question it answers, the actions,
 *  and the recipe's Nº set huge at the outer edge. */
export function RecipeBand({ view, t, actions }: { view: RecipeView; t: RecipeT; actions: React.ReactNode }) {
  const { locale, chapter, color, recipe, registry } = view;
  const c = PART_CLASSES[color];
  const level = registry.taxonomy.levels.find((l) => l.id === recipe.meta.level);
  return (
    <header className={cn("cb-band relative isolate overflow-hidden", c.band, c.onBand)}>
      <div className="cb-container relative pt-8 pb-7 md:pt-10 md:pb-9">
        {recipe.meta.status === "draft" && <span className="cb-draft-tab">{t("draft")}</span>}
        <span className="cb-band-number display">
          <span aria-hidden="true" className="cb-band-no">
            {t("numberSign")}
          </span>
          <span aria-hidden="true">{view.numberLabel}</span>
          <span className="sr-only">{t("numberAria", { number: recipe.meta.number })}</span>
        </span>
        <Kicker className="relative max-w-[70%] text-[0.62rem] opacity-95">
          {t("kicker", { number: chapter.number, chapter: chapter.title[locale] })}
        </Kicker>
        <span aria-hidden="true" className="relative mt-3 block h-[3px] w-10 bg-current" />
        <h1 className="display relative mt-4 max-w-[22ch] text-[2rem] md:text-[2.6rem]" style={{ textWrap: "balance" }}>
          {view.title}
        </h1>
        <p className="relative mt-3 max-w-2xl font-body text-base leading-relaxed opacity-95 md:text-lg">{view.summary}</p>
        {view.question && (
          <p className="cb-band-question relative mt-3 hidden max-w-2xl sm:block">
            <span className="kicker mr-2 text-[0.6rem]">{t("answers")}</span>
            <span className="font-body italic">{view.question}</span>
          </p>
        )}
        <p className="relative mt-4 sm:hidden">
          <LevelSquares level={recipe.meta.level} label={t("levelAria", { level: recipe.meta.level, title: level?.title[locale] ?? "" })} />
        </p>
        <div className="relative mt-5 hidden sm:block">{actions}</div>
      </div>
      <div aria-hidden="true" className="h-1.5 bg-night" />
    </header>
  );
}
