/**
 * "More from the Cookbook" (spec §4.5): the hand-picked `related[]` first,
 * then the recipes that share the most features (weighted Jaccard, primary
 * features count double), with small bonuses for a shared genre and the
 * same chapter. The previous and next recipes are left out: the page links
 * them already. Ties go to the lower level.
 */
import { getVisibleRecipes, neighboursIn } from "./recipes.ts";
import type { Recipe, RecipeMeta } from "./types.ts";

export interface RelatedCandidate {
  slug: string;
  meta: Pick<RecipeMeta, "chapter" | "level" | "genres" | "features" | "related">;
}

const PRIMARY_WEIGHT = 2;
const GENRE_BONUS = 0.5;
const CHAPTER_BONUS = 0.25;

function featureWeights(meta: RelatedCandidate["meta"]): Map<string, number> {
  const weights = new Map<string, number>();
  for (const id of meta.features.also) weights.set(id, 1);
  for (const id of meta.features.primary) weights.set(id, PRIMARY_WEIGHT);
  return weights;
}

/** Weighted Jaccard over features plus the genre and chapter bonuses. */
export function relatedScore(a: RelatedCandidate, b: RelatedCandidate): number {
  const wa = featureWeights(a.meta);
  const wb = featureWeights(b.meta);
  let shared = 0;
  let union = 0;
  for (const id of new Set([...wa.keys(), ...wb.keys()])) {
    shared += Math.min(wa.get(id) ?? 0, wb.get(id) ?? 0);
    union += Math.max(wa.get(id) ?? 0, wb.get(id) ?? 0);
  }
  let score = union > 0 ? shared / union : 0;
  if (a.meta.genres.some((genre) => genre !== "any" && b.meta.genres.includes(genre))) score += GENRE_BONUS;
  if (a.meta.chapter === b.meta.chapter) score += CHAPTER_BONUS;
  return score;
}

/** Slugs of up to `n` related recipes from `pool` (in contents order),
 *  hand-picked first. Recipes in `exclude`, and computed ones with a zero
 *  score, are left out. */
export function rankRelated(
  target: RelatedCandidate,
  pool: readonly RelatedCandidate[],
  { exclude = [], n = 3 }: { exclude?: Iterable<string>; n?: number } = {},
): string[] {
  const skip = new Set([target.slug, ...exclude]);
  const available = new Map(pool.filter((r) => !skip.has(r.slug)).map((r) => [r.slug, r]));
  const picked = (target.meta.related ?? []).filter((slug) => available.has(slug)).slice(0, n);
  const order = new Map(pool.map((r, i) => [r.slug, i]));
  const computed = [...available.values()]
    .filter((r) => !picked.includes(r.slug))
    .map((r) => ({ r, score: relatedScore(target, r) }))
    .filter(({ score }) => score > 0)
    .sort(
      (a, b) =>
        b.score - a.score ||
        a.r.meta.level - b.r.meta.level ||
        (order.get(a.r.slug) ?? 0) - (order.get(b.r.slug) ?? 0),
    )
    .map(({ r }) => r.slug);
  return [...picked, ...computed].slice(0, n);
}

/** Related recipes for a detail page. */
export function relatedRecipes(slug: string, n = 3): Recipe[] {
  const visible = getVisibleRecipes();
  const target = visible.find((r) => r.slug === slug);
  if (!target) return [];
  const { prev, next } = neighboursIn(visible, slug);
  const exclude = [prev?.slug, next?.slug].filter((s): s is string => Boolean(s));
  const bySlug = new Map(visible.map((r) => [r.slug, r]));
  return rankRelated(target, visible, { exclude, n }).map((s) => bySlug.get(s)).filter((r): r is Recipe => Boolean(r));
}
