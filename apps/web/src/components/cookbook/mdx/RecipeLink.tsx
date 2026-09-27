import Link from "next/link";
import { getRecipe, recipeHref, writeupFor } from "@/lib/cookbook/recipes";
import type { RecipeView } from "../recipe/model";

/** `<RecipeLink slug="…">…</RecipeLink>`: an inline link to another recipe
 *  (its title when the tag is empty); plain text when that recipe is not
 *  listed here (a draft in production). Server component. */
export function RecipeLink({ view, slug, children }: { view: RecipeView; slug: string; children?: React.ReactNode }) {
  const target = getRecipe(slug);
  const text = children ?? (target ? writeupFor(target, view.locale)?.frontmatter.title : null) ?? slug;
  if (!target) return <>{text}</>;
  return (
    <Link href={recipeHref(slug, view.locale)} prefetch={false}>
      {text}
    </Link>
  );
}
