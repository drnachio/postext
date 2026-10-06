import { LevelSquares } from "@/components/cookbook/RecipeCard";
import type { RecipeT, RecipeView } from "./model";

/** The museum label under the light table: the specimen of the captured
 *  document (trim, grid, type, pages) and the facts of the recipe (level,
 *  engine, build time, lines of code), led by a note when the sample exists
 *  only in another language. Server component. */
export function Tombstone({ view, t }: { view: RecipeView; t: RecipeT }) {
  const { capture, engine, pen, recipe, registry, locale } = view;
  const s = capture?.specimen;
  const level = registry.taxonomy.levels.find((l) => l.id === recipe.meta.level);
  // Sizes in the page's notation: "9,3/13,2" in Spanish.
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 1 });
  const round = (n: number) => number.format(n);
  const facts: React.ReactNode[] = [];
  if (pen.variant !== locale) facts.push(t("sampleLanguage", { lang: pen.variant }));
  if (s) {
    facts.push(t("trim", { w: round(s.trimMm[0]), h: round(s.trimMm[1]) }));
    const grid =
      s.layoutType === "oneAndHalf"
        ? t("columnAndHalf")
        : t("columns", { count: specimenColumns(s) });
    facts.push(s.gutterMm && s.layoutType !== "single" ? `${grid}, ${t("gutter", { mm: round(s.gutterMm) })}` : grid);
    facts.push(`${s.body.family} ${round(s.body.sizePt)}/${round(s.body.leadingPt)}`);
    for (const family of s.families) if (family !== s.body.family) facts.push(family);
    facts.push(t("pages", { count: s.pages }));
  }
  facts.push(
    <span key="level" className="inline-flex items-center gap-1.5">
      {t("levelLabel")} <LevelSquares level={recipe.meta.level} label={t("levelAria", { level: recipe.meta.level, title: level?.title[locale] ?? "" })} />
    </span>,
  );
  if (engine) facts.push(t("engine", { version: engine.postext }));
  if (capture) facts.push(t("buildMs", { ms: Math.round(capture.timings.buildMs) }));
  facts.push(t("ownLines", { count: s?.ownLines ?? pen.ownLines }));

  return (
    <div className="cb-tombstone">
      <ul className="kicker" aria-label={t("tombstoneLabel")}>
        {facts.map((fact, i) => (
          <li key={i}>{fact}</li>
        ))}
      </ul>
    </div>
  );
}

/** The body columns of the captured page: a `multiple` layout's own count
 *  (3 when the capture predates it), two for `double`, one otherwise. */
function specimenColumns(s: { layoutType: string; columnCount?: number }): number {
  if (s.layoutType === "multiple") return s.columnCount ?? 3;
  return s.layoutType === "double" ? 2 : 1;
}
