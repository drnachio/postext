import type { PlateLabels } from "@/components/cookbook/RecipeCard";
import type { MatchReason, SearchField } from "@/lib/cookbook/search";
import type { Catalog } from "@/lib/cookbook/types";
import type { SortId } from "./model";

/** The call signature shared by next-intl's `useTranslations` and
 *  `getTranslations` (Cookbook namespace). */
export type Translate = (key: string, values?: Record<string, string | number>) => string;

/** Plate strings from the Cookbook messages and the catalogue's facets. */
export function plateLabels(t: Translate, facets: Pick<Catalog["facets"], "levels" | "genres">): PlateLabels {
  return {
    number: t("number"),
    levels: Object.fromEntries(facets.levels.map((l) => [l.id, l.title])),
    genres: Object.fromEntries(facets.genres.map((g) => [g.id, g.title])),
    levelOf: (level) => t("levelOf", { level }),
    pages: (count) => t("pages", { count }),
    badges: { pdf: t("badgePdf"), html: t("badgeHtml"), epub: t("badgeEpub"), bundle: t("badgeBundle"), live: t("badgeLive") },
    draft: t("draft"),
    workaround: t("workaround"),
  };
}

const MATCH_KEY: Record<SearchField, string> = {
  title: "matchOtherTitle",
  questions: "matchQuestions",
  aliases: "matchAliases",
  featureLabels: "matchFeatureLabels",
  configKeys: "matchConfigKeys",
  apis: "matchApis",
  directives: "matchDirectives",
  warnings: "matchWarnings",
  summary: "matchSummary",
  chapter: "matchChapter",
  genres: "matchGenres",
  headings: "matchHeadings",
  gotchas: "matchGotchas",
  otherTitle: "matchOtherTitle",
  fonts: "matchFonts",
};

/** "config · layout.sideColumnRole": the field and the value that matched. */
export function reasonText(t: Translate, reason: MatchReason | null): string | null {
  if (!reason) return null;
  // The summary sits on the plate already; naming it adds nothing.
  if (reason.field === "summary" || reason.field === "chapter" || reason.field === "genres") return null;
  const value = reason.text ?? reason.terms.join(", ");
  return value ? `${t(MATCH_KEY[reason.field])} · ${value}` : null;
}

/** "5 recipes match “side column”" / "12 recipes". */
export function countLine(t: Translate, count: number, q: string): string {
  const query = q.trim();
  return query ? t("resultCountQuery", { count, q: query }) : t("resultCount", { count });
}

/** The sorts on offer (Relevance only with a query). */
export function sortItems(t: Translate, q: string): { value: SortId; label: string }[] {
  return [
    { value: "contents", label: t("sortContents") },
    ...(q.trim() ? [{ value: "relevance" as const, label: t("sortRelevance") }] : []),
    { value: "new", label: t("sortNew") },
    { value: "level", label: t("sortLevel") },
    { value: "az", label: t("sortAz") },
  ];
}
