import { GotchaCard } from "../recipe/Pitfalls";
import type { RecipeT, RecipeView } from "../recipe/model";

/** `<Gotcha id="headings-drop-h1-break"/>`: a shared, localised pitfall from
 *  gotchas.json, as in the Pitfalls section. */
export function Gotcha({ view, t, id }: { view: RecipeView; t: RecipeT; id: string }) {
  return <GotchaCard view={view} t={t} id={id} />;
}
