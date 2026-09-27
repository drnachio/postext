/** The recipe-request issue form (only the title is prefilled). */
export const ASK_RECIPE_URL = "https://github.com/drnachio/postext/issues/new?template=recipe-request.yml";
/** How to write a recipe: the Cookbook's README. */
export const WRITE_RECIPE_URL = "https://github.com/drnachio/postext/blob/main/cookbook/README.md";

/** The request form with "[Recipe]: <query>" as the new issue's title. */
export function askRecipeUrl(query?: string) {
  const q = query?.trim();
  return q ? `${ASK_RECIPE_URL}&title=${encodeURIComponent(`[Recipe]: ${q}`)}` : ASK_RECIPE_URL;
}

/** Chapter and collection links carry `data-cb-cat` / `data-cb-col`: the
 *  filters island applies them in place; without JavaScript they are plain
 *  links to the filtered URL, and a chapter's lands on its shelf (the page
 *  cannot filter without JavaScript). */
export function chapterHref(locale: string, id: string) {
  return `/${locale}/cookbook?cat=${encodeURIComponent(id)}#cb-ch-${id}`;
}

export function collectionHref(locale: string, id: string) {
  return `/${locale}/cookbook?col=${encodeURIComponent(id)}`;
}
