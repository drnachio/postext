import Link from "next/link";
import { getVisibleRecipes, neighbours, recipeHref, writeupFor } from "@/lib/cookbook/recipes";
import type { Recipe } from "@/lib/cookbook/types";
import { formatNumber, galleryHref, type RecipeT, type RecipeView } from "./model";

const titleOf = (recipe: Recipe, view: RecipeView) => writeupFor(recipe, view.locale)?.frontmatter.title ?? recipe.slug;

/** "Collection · Start here · 1 of 3", with the previous and next recipes
 *  of the collection: one strip per reading path the recipe is on (at
 *  most two; "featured" is not a path). Server component. */
export function CollectionStrips({ view, t }: { view: RecipeView; t: RecipeT }) {
  const { registry, recipe, locale } = view;
  const visible = new Map(getVisibleRecipes().map((r) => [r.slug, r]));
  const strips = Object.entries(registry.collections)
    .filter(([id, c]) => id !== "featured" && c.recipes.includes(recipe.slug))
    .slice(0, 2)
    .map(([id, c]) => {
      const list = c.recipes.map((slug) => visible.get(slug)).filter((r): r is Recipe => Boolean(r));
      const i = list.findIndex((r) => r.slug === recipe.slug);
      return { id, title: c.title[locale], list, i };
    })
    .filter((s) => s.i >= 0);
  if (strips.length === 0) return null;
  return (
    <div className="cb-collections">
      {strips.map(({ id, title, list, i }) => {
        const prev = list[i - 1];
        const next = list[i + 1];
        return (
          <nav key={id} aria-label={`${t("collection")}: ${title}`} className="cb-collection">
            <p className="cb-collection-head">
              <span className="kicker">{t("collection")}</span>
              <Link href={galleryHref(locale, "col", id)} className="cb-collection-title">
                {title}
              </Link>
              <span className="kicker cb-collection-pos">{t("collectionPosition", { index: i + 1, count: list.length })}</span>
            </p>
            <p className="cb-collection-links">
              {/* No-break spaces keep each arrow on its title's line. */}
              {prev ? <Link href={recipeHref(prev.slug, locale)} prefetch={false}>←{"\u00a0"}{titleOf(prev, view)}</Link> : <span />}
              {next ? <Link href={recipeHref(next.slug, locale)} prefetch={false}>{titleOf(next, view)}{"\u00a0"}→</Link> : <span />}
            </p>
          </nav>
        );
      })}
    </div>
  );
}

/** Previous and next recipes in contents order; at a chapter boundary the
 *  label names the chapter ("Next · Chapter 4 · Running heads & folios"). */
export function PrevNext({ view, t }: { view: RecipeView; t: RecipeT }) {
  const { registry, recipe, locale } = view;
  const { prev, next } = neighbours(recipe.slug);
  if (!prev && !next) return null;
  const label = (other: Recipe, direction: string) => {
    if (other.meta.chapter === recipe.meta.chapter) return direction;
    const chapter = registry.taxonomy.chapters.find((c) => c.id === other.meta.chapter);
    return chapter ? t("chapterBoundary", { direction, number: chapter.number, chapter: chapter.title[locale] }) : direction;
  };
  const cell = (other: Recipe | null, side: "prev" | "next") =>
    other ? (
      // Not prefetched: a recipe route is 55–75 KB, and every page's foot
      // would fetch two of them (the section's other links do the same).
      <Link href={recipeHref(other.slug, locale)} prefetch={false} className={`cb-prevnext-link is-${side}`} rel={side}>
        <span className="kicker">{label(other, side === "prev" ? t("previous") : t("next"))}</span>
        <span className="cb-prevnext-title">
          <span className="cb-prevnext-no">{t("recipeNumber", { number: formatNumber(other.meta.number) })}</span> {titleOf(other, view)}
        </span>
      </Link>
    ) : (
      <span />
    );
  return (
    <nav aria-label={t("neighbours")} className="cb-prevnext">
      {cell(prev, "prev")}
      {cell(next, "next")}
    </nav>
  );
}
