import { getTranslations } from "next-intl/server";
import { RecipeCard } from "@/components/cookbook/RecipeCard";
import { plateLabels } from "@/components/cookbook/gallery/labels";
import { buildCatalog } from "@/lib/cookbook/catalog";
import { relatedRecipes } from "@/lib/cookbook/related";
import type { RecipeT, RecipeView } from "./model";

/** "More from the Cookbook": three related recipes as the gallery's plates
 *  (hand-picked first, then by shared features; the previous and next
 *  recipes are left out, the page links them already). Server component. */
export async function RelatedRecipes({ view, t }: { view: RecipeView; t: RecipeT }) {
  const related = relatedRecipes(view.recipe.slug, 3);
  if (related.length === 0) return null;
  const catalog = buildCatalog(view.locale);
  const labels = plateLabels(await getTranslations({ locale: view.locale, namespace: "Cookbook" }), catalog.facets);
  const plates = related
    .map((r) => catalog.recipes.find((c) => c.slug === r.slug))
    .filter((c): c is NonNullable<typeof c> => Boolean(c));
  if (plates.length === 0) return null;
  return (
    <section aria-labelledby="cb-related" className="cb-related">
      <h2 id="cb-related" className="kicker cb-after-title">
        {t("moreFromCookbook")}
      </h2>
      <div className="cb-related-grid">
        {plates.map((recipe) => {
          const chapter = catalog.facets.chapters.find((c) => c.id === recipe.chapter);
          return (
            <RecipeCard
              key={recipe.slug}
              recipe={recipe}
              chapter={{ title: chapter?.title ?? "", color: chapter?.color ?? "blue" }}
              labels={labels}
              headingLevel={3}
            />
          );
        })}
      </div>
    </section>
  );
}
