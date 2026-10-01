import { getTranslations } from "next-intl/server";
import { RecipeCard, type PlateLabels } from "@/components/cookbook/RecipeCard";
import { PART_CLASSES } from "@/components/brand/partColors";
import type { CatalogRecipe } from "@/lib/cookbook/types";
import { cn } from "@/lib/utils";
import type { GalleryChapter, GalleryData } from "./data";

/** One chapter of the book view: its band in the part colour (kicker,
 *  title, intro, the chapter number huge at the outer edge, an ink foot)
 *  and every plate of the chapter. */
function ChapterShelf({
  chapter,
  intro,
  recipes,
  labels,
  eager,
  partHeading,
}: {
  chapter: GalleryChapter;
  intro?: string;
  recipes: CatalogRecipe[];
  labels: PlateLabels;
  eager: boolean;
  partHeading: string;
}) {
  const c = PART_CLASSES[chapter.color];
  const headingId = `cb-ch-${chapter.id}-title`;
  return (
    <section id={`cb-ch-${chapter.id}`} aria-labelledby={headingId} className={`cb-shelf part-${chapter.color} mt-14`}>
      <header className={cn("relative isolate overflow-hidden rounded-sm", c.band, c.onBand)}>
        <div className="relative px-5 pt-6 pb-5 sm:px-7 sm:pt-7 sm:pb-6">
          <span
            aria-hidden="true"
            className="display pointer-events-none absolute -top-1 right-4 text-[5.5rem] leading-[0.85] select-none sm:right-7 sm:text-[7rem]"
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

      <ul className="cb-shelf-row mt-7 grid gap-x-7 gap-y-10 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {recipes.map((recipe) => (
          <li key={recipe.slug} className="cb-reveal">
            <RecipeCard
              recipe={recipe}
              chapter={{ title: chapter.title, color: chapter.color }}
              labels={labels}
              headingLevel={4}
              eager={eager}
            />
          </li>
        ))}
      </ul>

    </section>
  );
}

/** The book view's shelves, part by part (an h2 per part for the outline;
 *  the bands show it visually). Chapters with no recipe never appear. */
export async function ChapterShelves({
  data,
  labels,
}: {
  data: GalleryData;
  labels: PlateLabels;
}) {
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
                <ChapterShelf
                  key={chapter.id}
                  chapter={chapter}
                  intro={intros[chapter.id]}
                  recipes={recipes}
                  labels={labels}
                  eager={firstEager && pi === 0 && ci === 0}
                  partHeading={partHeading}
                />
              );
            })}
          </section>
        );
      })}
    </div>
  );
}
