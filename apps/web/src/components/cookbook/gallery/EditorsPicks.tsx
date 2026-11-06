import { getTranslations } from "next-intl/server";
import type { CatalogRecipe, Locale } from "@/lib/cookbook/types";
import type { GalleryChapter, GalleryData } from "./data";
import { collectionHref } from "./links";
import { PlateGrid } from "./PlateGrid";
import { PLATE_HREF_BASE, plateFacets, toPlate } from "./plates";

function chapterOf(chapters: GalleryChapter[], recipe: CatalogRecipe) {
  const c = chapters.find((ch) => ch.id === recipe.chapter);
  return { title: c?.title ?? recipe.chapter, color: c?.color ?? "blue" };
}

/** The editor's picks (featured[1..3], large plates) and the row of
 *  collections with their counts. Either part hides when empty. The picks
 *  load lazily: they sit below the frontispiece, and eager images are
 *  preloaded in the head (React), where three plates took bandwidth from
 *  the frontispiece's plate, the page's LCP (#1432). */
export async function EditorsPicks({
  data,
  locale,
}: {
  data: GalleryData;
  locale: Locale;
}) {
  const t = await getTranslations("Cookbook");
  const { picks, collections, chapters } = data;
  if (picks.length === 0 && collections.length === 0) return null;
  const plates = picks.map(toPlate);

  return (
    <div className="mx-auto max-w-6xl px-4 pt-7 sm:px-6 sm:pt-10 2xl:max-w-7xl 2xl:px-8">
      {picks.length > 0 && (
        <section aria-labelledby="cb-picks">
          <h2 id="cb-picks" className="kicker text-brand">
            {t("picks")}
          </h2>
          <PlateGrid
            plates={plates}
            hrefBase={PLATE_HREF_BASE}
            chapter={picks.map((recipe) => chapterOf(chapters, recipe))}
            facets={plateFacets(data.catalog.facets, plates)}
            className="cb-shelf-row mt-6 grid gap-x-8 gap-y-10 sm:grid-cols-2 lg:grid-cols-3"
            size="lg"
          />
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
