import { Activity } from "react";
import { getTranslations } from "next-intl/server";
import { PART_CLASSES } from "@/components/brand/partColors";
import type { Catalog, CatalogRecipe } from "@/lib/cookbook/types";
import { cn } from "@/lib/utils";
import type { GalleryChapter, GalleryData } from "./data";
import { PlateGrid } from "./PlateGrid";
import { PLATE_HREF_BASE, plateFacets, toPlate } from "./plates";

/** One chapter of the book view: its band in the part colour (kicker,
 *  title, intro, the chapter number huge at the outer edge, an ink foot)
 *  and every plate of the chapter. */
function ChapterShelf({
  chapter,
  intro,
  recipes,
  facets,
  eager,
  partHeading,
}: {
  chapter: GalleryChapter;
  intro?: string;
  recipes: CatalogRecipe[];
  facets: Catalog["facets"];
  eager: boolean;
  partHeading: string;
}) {
  const c = PART_CLASSES[chapter.color];
  const headingId = `cb-ch-${chapter.id}-title`;
  const plates = recipes.map(toPlate);
  return (
    <section id={`cb-ch-${chapter.id}`} aria-labelledby={headingId} className={`cb-shelf part-${chapter.color} mt-14`}>
      <header className={cn("relative isolate overflow-hidden rounded-sm", c.band, c.onBand)}>
        <div className="relative px-5 pt-6 pb-5 sm:px-7 sm:pt-7 sm:pb-6">
          <span
            aria-hidden="true"
            className="display pointer-events-none absolute -top-1 end-4 text-[5.5rem] leading-[0.85] select-none sm:end-7 sm:text-[7rem]"
          >
            {chapter.number}
          </span>
          <p aria-hidden="true" className="kicker relative max-w-[70%] text-[0.6rem]">
            {partHeading}
          </p>
          <h3
            id={headingId}
            className="display relative mt-2.5 max-w-[78%] text-[1.6rem] sm:text-[2rem]"
            style={{ textWrap: "balance" }}
          >
            {chapter.title}
          </h3>
          {intro && (
            <p className="relative mt-2 max-w-2xl font-body text-[0.9rem] leading-normal italic max-sm:line-clamp-3">
              {intro}
            </p>
          )}
        </div>
        <div aria-hidden="true" className="h-1.5 bg-night" />
      </header>

      <PlateGrid
        plates={plates}
        hrefBase={PLATE_HREF_BASE}
        chapter={{ title: chapter.title, color: chapter.color }}
        facets={plateFacets(facets, plates)}
        className="cb-shelf-row mt-7 grid gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
        itemClassName="cb-reveal"
        headingLevel={4}
        eager={eager}
      />

    </section>
  );
}

/** The book view's shelves, part by part (an h2 per part for the outline;
 *  the bands show it visually). Chapters with no recipe never appear. Each
 *  shelf is an Activity boundary: React hydrates it after the rest of the
 *  page, at offscreen priority in short slices (a click on a shelf not yet
 *  hydrated hydrates that shelf first), instead of one long task over every
 *  plate of the book. Not a Suspense boundary: that would stream the shelf
 *  out of order, hidden until a script reveals it. */
export async function ChapterShelves({ data }: { data: GalleryData }) {
  const t = await getTranslations("Cookbook");
  const { parts, catalog, intros } = data;
  // The first shelf's plates load eagerly when there are no editor's picks
  // above them.
  const firstEager = data.picks.length === 0;

  return (
    <div className="mx-auto max-w-6xl px-4 pt-0 sm:px-6 2xl:max-w-7xl 2xl:px-8">
      {parts.map((part, pi) => {
        const partHeading = t("partHeading", { number: part.number, title: part.title });
        return (
          <section key={part.id} aria-labelledby={`cb-part-${part.id}`}>
            <h2 id={`cb-part-${part.id}`} className="sr-only">
              {partHeading}
            </h2>
            {part.chapters.map((chapter, ci) => {
              const recipes = catalog.recipes.filter((r) => r.chapter === chapter.id);
              return (
                <Activity key={chapter.id}>
                  <ChapterShelf
                    chapter={chapter}
                    intro={intros[chapter.id]}
                    recipes={recipes}
                    facets={catalog.facets}
                    eager={firstEager && pi === 0 && ci === 0}
                    partHeading={partHeading}
                  />
                </Activity>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
