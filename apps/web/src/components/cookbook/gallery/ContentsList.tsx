import { Link } from "@/i18n/navigation";
import { LevelSquares, plateNumber, type PlateLabels, type PlateRecipe } from "@/components/cookbook/RecipeCard";
import type { PartColor } from "@/components/brand/partColors";

export interface ContentsItem {
  recipe: PlateRecipe;
  color: PartColor;
  reason?: string | null;
}

/** One line of the contents view, the docs' contents-page pattern: Nº in
 *  part ink, the title in Fraunces, a dotted leader, the level squares and
 *  the page count, and the summary underneath in italic. */
export function ContentsRow({ item, labels }: { item: ContentsItem; labels: PlateLabels }) {
  const { recipe, color, reason } = item;
  return (
    <li className={`part-${color}`}>
      <Link
        href={recipe.href}
        prefetch={false}
        className="cb-row-link group grid grid-cols-[3.4rem_minmax(0,1fr)] gap-x-3 rounded-sm py-2.5 sm:grid-cols-[4rem_minmax(0,1fr)]"
      >
        <span className="pt-1.5 font-sans text-[0.66rem] font-bold tracking-[0.1em] text-(--part-ink) tabular-nums">
          {plateNumber(labels.number, recipe.number)}
        </span>
        <span className="min-w-0">
          <span className="flex items-baseline gap-3">
            <span className="font-display text-[1.08rem] leading-snug font-semibold tracking-[-0.01em] transition-colors group-hover:text-(--part-ink) sm:text-[1.15rem]">
              {recipe.title}
              {recipe.draft && (
                <span className="ml-2 inline-block rounded-[3px] bg-red px-1.5 py-0.5 align-middle font-sans text-[0.52rem] font-bold tracking-[0.14em] text-white uppercase">
                  {labels.draft}
                </span>
              )}
            </span>
            <span aria-hidden="true" className="cb-leader max-sm:hidden" />
            <span className="flex shrink-0 items-center gap-2 font-sans text-[0.6rem] font-semibold tracking-[0.12em] text-foreground/70 uppercase max-sm:hidden">
              <LevelSquares level={recipe.level} />
              <span className="sr-only">
                {labels.levelOf(recipe.level)}: {labels.levels[recipe.level]}
              </span>
              {recipe.pages > 0 && <span>{labels.pages(recipe.pages)}</span>}
            </span>
          </span>
          {recipe.summary && (
            <span className="mt-0.5 block max-w-[80ch] font-body text-[0.86rem] leading-snug text-slate italic">{recipe.summary}</span>
          )}
          {reason && (
            <span className="mt-1 block truncate font-mono text-[0.68rem] text-slate">
              <span aria-hidden="true">↳ </span>
              {reason}
            </span>
          )}
        </span>
      </Link>
    </li>
  );
}
