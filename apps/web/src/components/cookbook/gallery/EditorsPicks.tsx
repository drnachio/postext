import { getTranslations } from "next-intl/server";
import { RecipeCard, type PlateLabels } from "@/components/cookbook/RecipeCard";
import type { CatalogRecipe, Locale } from "@/lib/cookbook/types";
import type { GalleryChapter, GalleryData } from "./data";
import { collectionHref } from "./links";

function chapterOf(chapters: GalleryChapter[], recipe: CatalogRecipe) {
  const c = chapters.find((ch) => ch.id === recipe.chapter);
  return { title: c?.title ?? recipe.chapter, color: c?.color ?? "blue" };
}

/** The editor's picks (featured[1..3], large plates) and the row of
 *  collections with their counts. Either part hides when empty. */
export async function EditorsPicks({
  data,
  labels,
  locale,
}: {
  data: GalleryData;
  labels: PlateLabels;
  locale: Locale;
}) {
  const t = await getTranslations("Cookbook");
  const { picks, collections, chapters } = data;
  if (picks.length === 0 && collections.length === 0) return null;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-7 sm:px-6 sm:pt-10 2xl:max-w-7xl 2xl:px-8">
      {picks.length > 0 && (
        <section aria-labelledby="cb-picks">
          <h2 id="cb-picks" className="kicker text-brand">
            {t("picks")}
          </h2>
          <ul className="cb-shelf-row mt-6 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
            {picks.map((recipe) => (
              <li key={recipe.slug}>
                <RecipeCard recipe={recipe} chapter={chapterOf(chapters, recipe)} labels={labels} size="lg" eager />
              </li>
            ))}
          </ul>
        </section>
      )}

      {collections.length > 0 && (
        <section aria-labelledby="cb-collections" className="flex flex-col gap-3 not-first:mt-10 sm:flex-row sm:items-center sm:gap-5">
          <h2 id="cb-collections" className="kicker shrink-0 text-slate">
            {t("collections")}
          </h2>
          <ul className="cb-scroll-row -mx-4 flex gap-2 px-4 sm:mx-0 sm:flex-wrap sm:px-0">
            {collections.map((c) => (
              <li key={c.id} className="shrink-0">
                <a
                  href={collectionHref(locale, c.id)}
                  data-cb-col={c.id}
                  title={c.summary}
                  className="inline-flex h-10 items-center gap-2 rounded-full bg-surface px-4 font-sans text-[0.8rem] font-medium whitespace-nowrap transition-colors hover:bg-surface-2"
                >
                  {c.title}
                  <span className="text-slate tabular-nums">· {c.count}</span>
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
