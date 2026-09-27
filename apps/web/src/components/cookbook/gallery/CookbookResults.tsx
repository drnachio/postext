"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { XIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { CropMarks } from "@/components/brand/CropMarks";
import type { PartColor } from "@/components/brand/partColors";
import { RecipeCard, type PlateLabels } from "@/components/cookbook/RecipeCard";
import type { Catalog, CatalogRecipe, Locale } from "@/lib/cookbook/types";
import { ContentsRow, type ContentsItem } from "./ContentsList";
import { DocsSearchButton } from "./DocsSearchButton";
import { activeChips, selectionLabel } from "./facets";
import { countLine, plateLabels, reasonText, type Translate } from "./labels";
import { askRecipeUrl } from "./links";
import {
  selectionCount,
  serializeState,
  type GalleryModel,
  type GapEntry,
  type ResultItem,
  type ViewId,
} from "./model";
import { FILTERED_ATTR } from "./prepaint";
import { clearFilters, removeSelection, resetGallery, useGallery } from "./useGallery";

/** Plates per page of results ("Show more" adds as many again). */
const PAGE = 48;

export interface ResultsPart {
  id: string;
  number: string;
  color: PartColor;
  title: string;
}

type Facets = Catalog["facets"];

/** At least a screen tall, so the colophon never jumps into view when the
 *  results replace the placeholder. */
const RESULTS_CLASS = "cb-results mx-auto min-h-[100svh] max-w-6xl px-4 pt-7 pb-4 sm:px-6 2xl:max-w-7xl 2xl:px-8";

const BUTTON =
  "inline-flex min-h-11 items-center gap-2 rounded-md px-4 font-sans text-[0.82rem] font-semibold transition-colors sm:min-h-10";

/** Where focus goes once a removal has re-rendered the results: the chip
 *  now at that index (else "Clear all"), the results heading, or the search
 *  field in the sticky bar (always mounted, and the only target left when
 *  the book view comes back). */
type FocusTarget = { chip: number } | "title" | "search";

/** The results view (any URL key): a flat grid of plates paged by 48, or
 *  the contents view, with the count, the active filters, gap callouts and
 *  the empty states. Hidden by CSS while the book view shows. */
export function CookbookResults({ locale, parts }: { locale: Locale; parts: ResultsPart[] }) {
  const t = useTranslations("Cookbook");
  const { catalog, model, state: urlState } = useGallery(locale);
  const loaded = catalog.status === "ready" ? catalog.data : null;
  const labels = useMemo(() => (loaded ? plateLabels(t, loaded.catalog.facets) : null), [t, loaded]);

  const key = model ? serializeState(model.state) : "";
  const [page, setPage] = useState({ key, size: PAGE });
  if (page.key !== key) setPage({ key, size: PAGE });

  // A removed chip (or button) takes focus with it: move it on once the
  // new selection has rendered.
  const chipsRef = useRef<HTMLDivElement>(null);
  const pendingFocus = useRef<FocusTarget | null>(null);
  useEffect(() => {
    const target = pendingFocus.current;
    if (target === null) return;
    pendingFocus.current = null;
    const buttons = [...(chipsRef.current?.querySelectorAll<HTMLElement>("button") ?? [])];
    if (target === "search" || !document.documentElement.hasAttribute(FILTERED_ATTR)) {
      document.getElementById("cb-search")?.focus();
    } else if (typeof target === "object" && buttons.length > 0) {
      buttons[Math.min(target.chip, buttons.length - 1)].focus();
    } else {
      document.getElementById("cb-results-title")?.focus();
    }
  }, [key]);
  const thenFocus = (target: FocusTarget, action: () => void) => {
    pendingFocus.current = target;
    action();
  };

  if (!model || !loaded || !labels) return <ResultsSkeleton view={urlState.view} chips={selectionCount(urlState)} />;

  const { facets } = loaded.catalog;
  const { state, results } = model;
  const q = state.q.trim();
  const shown = results.slice(0, page.size);
  const remaining = results.length - shown.length;
  const chips = activeChips(model, facets, t);
  const chapterOf = (r: CatalogRecipe) => {
    const c = facets.chapters.find((ch) => ch.id === r.chapter);
    return { title: c?.title ?? r.chapter, color: (c?.color ?? "blue") as PartColor };
  };

  return (
    <section aria-labelledby="cb-results-title" className={RESULTS_CLASS}>
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <h2
          id="cb-results-title"
          tabIndex={-1}
          className="font-display text-[1.3rem] font-semibold tracking-[-0.01em] outline-none sm:text-[1.45rem]"
        >
          {countLine(t, results.length, q)}
        </h2>
        {model.partial && <p className="kicker text-vermilion">{t("partialMatches")}</p>}
      </div>

      {chips.length > 0 && (
        <div ref={chipsRef} role="group" aria-label={t("activeFilters")} className="mt-3 flex flex-wrap items-center gap-1.5">
          {chips.map((chip, i) => (
            <button
              key={`${chip.key}:${chip.id}`}
              type="button"
              onClick={() => thenFocus({ chip: i }, () => removeSelection(locale, chip.key, chip.id))}
              aria-label={t("removeFilter", { label: chip.text })}
              className="inline-flex h-11 items-center gap-1.5 rounded-full bg-surface pr-2.5 pl-3 font-sans text-[0.78rem] font-medium transition-colors hover:bg-surface-2 sm:h-8 sm:pr-2"
            >
              {chip.text}
              <XIcon aria-hidden="true" className="size-3.5 text-slate" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => thenFocus("search", () => clearFilters(locale))}
            className="ml-1 min-h-11 rounded-md px-2 font-sans text-[0.78rem] font-semibold text-(--brand) hover:underline sm:min-h-8"
          >
            {t("clearAll")}
          </button>
        </div>
      )}

      {model.gaps.map((gap) => (
        <GapCallout key={gap.id} gap={gap} t={t} bySlug={loaded.bySlug} />
      ))}

      {results.length === 0 ? (
        <EmptyState
          t={t}
          locale={locale}
          model={model}
          facets={facets}
          labels={labels}
          chapterOf={chapterOf}
          thenFocus={thenFocus}
        />
      ) : state.view === "contents" ? (
        <ContentsView
          t={t}
          items={shown}
          parts={parts}
          facets={facets}
          labels={labels}
          grouped={model.sort === "contents"}
          chapterOf={chapterOf}
        />
      ) : (
        <ul className="mt-7 grid grid-cols-1 gap-x-7 gap-y-10 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((item, i) => (
            <li key={item.recipe.slug}>
              <RecipeCard
                // Under a gap note only its pinned workarounds carry the
                // badge: another gap's workaround would read as this one's.
                recipe={model.gaps.length > 0 && !item.pinned ? { ...item.recipe, gap: false } : item.recipe}
                chapter={chapterOf(item.recipe)}
                labels={labels}
                eager={i < 4}
                reason={reasonText(t, item.reason)}
                pinned={item.pinned}
              />
            </li>
          ))}
        </ul>
      )}

      {remaining > 0 && (
        <div className="mt-12 text-center">
          <button
            type="button"
            onClick={() => setPage({ key, size: page.size + PAGE })}
            className={`${BUTTON} bg-surface hover:bg-surface-2`}
          >
            {t("showMore", { count: remaining })}
          </button>
        </div>
      )}
    </section>
  );
}

/** The contents view: rows grouped by part and chapter in contents order,
 *  a flat list under any other sort. */
function ContentsView({
  t,
  items,
  parts,
  facets,
  labels,
  grouped,
  chapterOf,
}: {
  t: Translate;
  items: ResultItem[];
  parts: ResultsPart[];
  facets: Facets;
  labels: PlateLabels;
  grouped: boolean;
  chapterOf: (r: CatalogRecipe) => { title: string; color: PartColor };
}) {
  const row = (item: ResultItem): ContentsItem => ({
    recipe: item.recipe,
    color: chapterOf(item.recipe).color,
    reason: reasonText(t, item.reason),
  });
  if (!grouped) {
    return (
      <ol className="mt-6 max-w-4xl">
        {items.map((item) => (
          <ContentsRow key={item.recipe.slug} item={row(item)} labels={labels} />
        ))}
      </ol>
    );
  }
  return (
    <div className="mt-7 max-w-4xl space-y-10">
      {parts.map((part) => {
        const chapters = facets.chapters.filter((c) => c.part === part.id);
        const inPart = items.filter((item) => chapters.some((c) => c.id === item.recipe.chapter));
        if (inPart.length === 0) return null;
        return (
          <section key={part.id} aria-labelledby={`cb-cv-${part.id}`} className={`part-${part.color}`}>
            <h3 id={`cb-cv-${part.id}`} className="kicker flex items-center gap-2.5 text-(--part-ink)">
              <span aria-hidden="true" className="size-3 shrink-0 bg-(--part)" />
              {t("partHeading", { number: part.number, title: part.title })}
            </h3>
            {chapters.map((chapter) => {
              const rows = inPart.filter((item) => item.recipe.chapter === chapter.id);
              if (rows.length === 0) return null;
              return (
                <div key={chapter.id} className="mt-5">
                  <h4 className="flex items-baseline gap-2.5 font-head text-[1.02rem] font-bold tracking-[-0.01em]">
                    <span className="text-(--part-ink) tabular-nums">{chapter.number}</span>
                    {chapter.title}
                  </h4>
                  <ol className="mt-1">
                    {rows.map((item) => (
                      <ContentsRow key={item.recipe.slug} item={row(item)} labels={labels} />
                    ))}
                  </ol>
                </div>
              );
            })}
          </section>
        );
      })}
    </div>
  );
}

/** A query that names something Postext does not do: the honest answer and
 *  the recipes that work around it. */
function GapCallout({ gap, t, bySlug }: { gap: GapEntry; t: Translate; bySlug: Map<string, CatalogRecipe> }) {
  const recipes = gap.recipes.map((slug) => bySlug.get(slug)).filter((r): r is CatalogRecipe => Boolean(r));
  return (
    <aside
      aria-label={`${t("gapKicker")}: ${gap.label}`}
      className="part-vermilion mt-6 max-w-4xl rounded-r-md border-l-4 border-(--part) bg-(--callout-bg) px-5 py-4"
    >
      <p className="kicker text-(--part-ink)">
        {t("gapKicker")} · {gap.label}
      </p>
      <p className="mt-2 font-body text-[0.95rem] leading-relaxed">{gap.explanation}</p>
      <p className="mt-2.5 font-sans text-[0.85rem]">
        {recipes.length > 0 ? (
          <>
            <span className="text-slate">{t("gapWorkarounds", { count: recipes.length })}</span>{" "}
            {recipes.map((r, i) => (
              <span key={r.slug}>
                {i > 0 && ", "}
                <Link href={r.href} prefetch={false} className="font-semibold text-(--part-ink) underline underline-offset-4">
                  {r.title}
                </Link>
              </span>
            ))}
          </>
        ) : (
          <>
            <span className="text-slate">{t("gapNoRecipe")}</span>{" "}
            <a
              href={askRecipeUrl(gap.label)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-semibold text-(--part-ink) underline underline-offset-4"
            >
              {t("askRecipe")} ↗
            </a>
          </>
        )}
      </p>
    </aside>
  );
}

/** Nothing matches: a blank page with crop marks and a gilt folio, what to
 *  remove, the nearest recipes, and the ways out (the docs, a request). */
function EmptyState({
  t,
  locale,
  model,
  facets,
  labels,
  chapterOf,
  thenFocus,
}: {
  t: Translate;
  locale: Locale;
  model: GalleryModel;
  facets: Facets;
  labels: PlateLabels;
  chapterOf: (r: CatalogRecipe) => { title: string; color: PartColor };
  thenFocus: (target: FocusTarget, action: () => void) => void;
}) {
  const q = model.state.q.trim();
  const queryMiss = q !== "" && model.removals.length === 0;
  return (
    <div className="mt-8">
      <div className="flex flex-col items-center gap-8 sm:flex-row sm:items-start">
        <div aria-hidden="true" className="cb-blank shrink-0">
          <CropMarks offset={6} length={14} />
          <span className="cb-blank-folio">—</span>
        </div>
        <div className="min-w-0 flex-1 text-center sm:pt-2 sm:text-left">
          <p className="font-display text-[1.7rem] leading-tight font-semibold">{t("emptyTitle")}</p>
          <p className="mt-1.5 font-body text-[1.05rem] text-slate italic">
            {queryMiss ? t("emptyQuery", { q }) : t("emptyFilters")}
          </p>

          {model.removals.length > 0 && (
            <div className="mt-5">
              <p className="font-sans text-[0.82rem] text-slate">{t("emptyTry")}</p>
              <div className="mt-2 flex flex-wrap justify-center gap-1.5 sm:justify-start">
                {model.removals.map((r) => (
                  <button
                    key={`${r.key}:${r.id}`}
                    type="button"
                    onClick={() => thenFocus("title", () => removeSelection(locale, r.key, r.id))}
                    className="inline-flex h-11 items-center gap-1.5 rounded-full bg-surface px-3 font-sans text-[0.78rem] font-medium transition-colors hover:bg-surface-2"
                  >
                    {t("removeFilter", { label: selectionLabel(r.key, r.id, facets) })}
                    <span aria-hidden="true">→</span>
                    <span className="text-slate">{t("chapterCount", { count: r.count })}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          <div className="mt-6 flex flex-wrap justify-center gap-2 sm:justify-start">
            <DocsSearchButton
              label={q ? t("searchDocsFor", { q }) : t("searchDocs")}
              query={q || undefined}
              className={`${BUTTON} bg-brand text-brand-contrast hover:bg-brand-hover`}
            />
            <a
              href={askRecipeUrl(q)}
              target="_blank"
              rel="noopener noreferrer"
              className={`${BUTTON} bg-surface hover:bg-surface-2`}
            >
              {t("askRecipe")} <span aria-hidden="true">↗</span>
            </a>
            <button
              type="button"
              onClick={() => thenFocus("search", () => resetGallery(locale))}
              className={`${BUTTON} text-slate hover:text-foreground`}
            >
              {t("clearAll")}
            </button>
          </div>
        </div>
      </div>

      {model.nearest.length > 0 && (
        <div className="mt-14">
          <h3 className="kicker text-slate">{t("emptyNearest")}</h3>
          <ul className="mt-6 grid grid-cols-1 gap-x-7 gap-y-10 min-[480px]:grid-cols-2 lg:grid-cols-3">
            {model.nearest.map((recipe) => (
              <li key={recipe.slug}>
                <RecipeCard recipe={recipe} chapter={chapterOf(recipe)} labels={labels} headingLevel={4} />
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

/** The results' placeholder while the catalogue loads (and the Suspense
 *  fallback): the header, a row of chips when the URL has selections, and
 *  empty stages or rows sized like the real ones, so little shifts. */
export function ResultsSkeleton({ view = "plates", chips = 0 }: { view?: ViewId; chips?: number }) {
  return (
    <section aria-hidden="true" className={RESULTS_CLASS}>
      <p className="font-display text-[1.3rem] font-semibold sm:text-[1.45rem]">
        <span className="inline-block w-56 max-w-full animate-pulse rounded bg-surface">&nbsp;</span>
      </p>
      {chips > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {Array.from({ length: chips }, (_, i) => (
            <span key={i} className="h-9 w-36 rounded-full bg-surface sm:h-8" />
          ))}
        </div>
      )}
      {view === "contents" ? (
        <div className="mt-7 max-w-4xl space-y-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="grid grid-cols-[3.4rem_minmax(0,1fr)] gap-x-3 py-2.5 sm:grid-cols-[4rem_minmax(0,1fr)]">
              <span className="mt-1.5 h-3 rounded bg-surface" />
              <span>
                <span className="block h-6 w-3/5 animate-pulse rounded bg-surface" />
                <span className="mt-1.5 block h-4 w-4/5 rounded bg-surface/70" />
              </span>
            </div>
          ))}
        </div>
      ) : (
        <ul className="mt-7 grid grid-cols-1 gap-x-7 gap-y-10 min-[480px]:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }, (_, i) => (
            <li key={i}>
              <div className="h-5" />
              <div className="mt-3.5 aspect-[4/3] animate-pulse rounded-[3px] bg-(--desk)" />
              <div className="mt-3.5 h-3 w-28 rounded bg-surface" />
              <div className="mt-2.5 h-6 w-4/5 rounded bg-surface" />
              <div className="mt-2 h-4 w-full rounded bg-surface/70" />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
