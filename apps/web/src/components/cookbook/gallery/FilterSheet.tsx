"use client";

import { ChevronDownIcon, SlidersHorizontalIcon } from "lucide-react";
import { Dialog, DialogClose, DialogContent, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import type { Locale } from "@/lib/cookbook/types";
import { cn } from "@/lib/utils";
import type { GalleryChapter } from "./data";
import { ChapterChips, FacetOptionList, FeatureFinder, PickCount } from "./FacetControls";
import { facetOptions } from "./facets";
import { sortItems, type Translate } from "./labels";
import type { ListKey } from "./model";
import {
  clearFilters,
  defaultSort,
  loadCatalog,
  setChapter,
  setSort,
  toggleValue,
  updateGallery,
  type Gallery,
} from "./useGallery";

/** A collapsible group of the sheet. */
function Section({
  t,
  title,
  count,
  open = false,
  children,
}: {
  t: Translate;
  title: string;
  count?: number;
  open?: boolean;
  children: React.ReactNode;
}) {
  return (
    <details open={open} className="group/sec py-1">
      <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-md px-1 font-sans text-[0.9rem] font-semibold [&::-webkit-details-marker]:hidden">
        <ChevronDownIcon aria-hidden="true" className="size-4 -rotate-90 text-slate transition-transform group-open/sec:rotate-0" />
        {title}
        {count ? <PickCount t={t} count={count} /> : null}
      </summary>
      <div className="pt-1 pb-2">{children}</div>
    </details>
  );
}

/** Below 1024 px the facets live in a bottom sheet (a Base UI dialog):
 *  chapter, genre, level, output, features, warnings, collections and the
 *  sort. Selections apply at once; "Show N recipes" closes it. */
export function FilterSheet({
  locale,
  t,
  gallery,
  chapters,
  picked,
}: {
  locale: Locale;
  t: Translate;
  gallery: Gallery;
  chapters: GalleryChapter[];
  picked: number;
}) {
  const { state, model, catalog } = gallery;
  const vocab = catalog.status === "ready" ? catalog.data.catalog.facets : null;
  const count = model?.results.length ?? 0;
  const sort = model?.sort ?? state.sort ?? defaultSort(state.q);

  const list = (key: ListKey, title: string, extra?: { levels?: boolean; open?: boolean }) =>
    vocab && model && (key !== "warn" || vocab.warnings.length > 0) ? (
      <Section t={t} title={title} count={state[key].length} open={extra?.open}>
        <FacetOptionList
          label={title}
          options={facetOptions(key, vocab, model)}
          onToggle={(id) => toggleValue(locale, key, id)}
          levels={extra?.levels}
        />
      </Section>
    ) : null;

  return (
    <Dialog onOpenChange={(open) => open && loadCatalog(locale)}>
      <DialogTrigger
        render={
          <button
            type="button"
            className="inline-flex h-11 shrink-0 items-center gap-2 rounded-md bg-surface px-3 font-sans text-[0.8rem] font-medium text-foreground/90 transition-colors hover:bg-surface-2 sm:h-10 lg:hidden"
          />
        }
      >
        <SlidersHorizontalIcon aria-hidden="true" className="size-4" />
        {/* Hidden on narrow phones, but still the button's name. */}
        <span className="sr-only min-[400px]:not-sr-only">{t("filters")}</span>
        {picked > 0 && <PickCount t={t} count={picked} />}
      </DialogTrigger>
      <DialogContent
        closeLabel={t("close")}
        className="top-auto bottom-0 left-0 flex max-h-[88dvh] w-full max-w-none translate-x-0 translate-y-0 flex-col gap-0 rounded-none rounded-t-xl p-0 sm:max-w-none data-open:slide-in-from-bottom-10"
      >
        <div className="flex items-center gap-3 px-4 pt-4 pr-12 pb-2">
          <DialogTitle className="font-display text-xl font-semibold">{t("filters")}</DialogTitle>
          {picked > 0 && (
            <button
              type="button"
              onClick={() => clearFilters(locale)}
              className="ml-auto min-h-10 rounded-md px-2 font-sans text-[0.8rem] font-semibold text-(--brand)"
            >
              {t("clearAll")}
            </button>
          )}
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-3 pb-3">
          {!vocab || !model ? (
            <p className="px-1 py-6 font-sans text-sm text-slate">
              {catalog.status === "error" ? t("unavailable") : t("loading")}
            </p>
          ) : (
            <>
              <Section t={t} title={t("facetChapter")} count={state.cat ? 1 : 0} open>
                <div role="group" aria-label={t("facetChapter")} className="flex flex-wrap gap-1.5 px-1">
                  <ChapterChips
                    t={t}
                    chapters={chapters}
                    selected={state.cat}
                    counts={model.counts.cat}
                    onSelect={(id) => setChapter(locale, id)}
                  />
                </div>
              </Section>
              {list("genre", t("facetGenre"))}
              {list("level", t("facetLevel"), { levels: true })}
              {list("out", t("facetOutput"))}
              <Section t={t} title={t("facetFeatures")} count={state.feat.length}>
                <FeatureFinder
                  t={t}
                  options={facetOptions("feat", vocab, model)}
                  onToggle={(id) => toggleValue(locale, "feat", id)}
                  listClassName="max-h-72"
                />
              </Section>
              {list("warn", t("facetWarnings"))}
              {list("col", t("facetCollections"))}
              <Section t={t} title={t("view")} open>
                <div role="group" aria-label={t("view")} className="flex flex-wrap gap-1.5 px-1">
                  {(
                    [
                      ["plates", t("viewPlates")],
                      ["contents", t("viewContents")],
                    ] as const
                  ).map(([view, label]) => (
                    <button
                      key={view}
                      type="button"
                      aria-pressed={state.view === view}
                      onClick={() => updateGallery(locale, { view })}
                      className={cn(
                        "inline-flex h-10 items-center rounded-full px-3.5 font-sans text-[0.8rem] font-medium",
                        state.view === view ? "bg-foreground text-background" : "bg-surface hover:bg-surface-2",
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </Section>
              <Section t={t} title={t("sort")}>
                <div role="group" aria-label={t("sort")} className="flex flex-wrap gap-1.5 px-1">
                  {sortItems(t, state.q).map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      aria-pressed={sort === item.value}
                      onClick={() => setSort(locale, item.value)}
                      className={cn(
                        "inline-flex h-10 items-center rounded-full px-3.5 font-sans text-[0.8rem] font-medium",
                        sort === item.value ? "bg-foreground text-background" : "bg-surface hover:bg-surface-2",
                      )}
                    >
                      {item.label}
                    </button>
                  ))}
                </div>
              </Section>
            </>
          )}
        </div>

        <div className="px-4 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))]">
          <DialogClose
            disabled={!model || count === 0}
            render={
              <button
                type="button"
                className="h-12 w-full rounded-md bg-brand font-sans text-[0.9rem] font-semibold text-brand-contrast transition-colors hover:bg-brand-hover disabled:opacity-50"
              />
            }
          >
            {t("showResults", { count })}
          </DialogClose>
        </div>
      </DialogContent>
    </Dialog>
  );
}
