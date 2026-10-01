"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { LayoutGridIcon, ListIcon, SearchIcon, XIcon } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Locale } from "@/lib/cookbook/types";
import type { GalleryChapter } from "./data";
import { ChapterChips, FacetOptionList, FacetPopover, FeatureFinder } from "./FacetControls";
import { facetOptions } from "./facets";
import { FilterSheet } from "./FilterSheet";
import { HAND_OFF_EVENT } from "./FrontispieceSearch";
import { countLine, sortItems } from "./labels";
import { EMPTY_STATE, selectionCount, serializeState, type SortId } from "./model";
import { FILTERED_ATTR } from "./prepaint";
import {
  defaultSort,
  loadCatalog,
  setChapter,
  setSort,
  toggleValue,
  updateGallery,
  useCatalogPrefetch,
  useGallery,
  type Gallery,
} from "./useGallery";

export interface FiltersProps {
  locale: Locale;
  /** Chapters with recipes (server counts), for the chips before the
   *  catalogue has loaded. */
  chapters: GalleryChapter[];
}

/** The sticky filter bar: search, facets (popovers from 1024 px, a bottom
 *  sheet below), view and sort, and the chapter chips. It owns the URL
 *  side effects: the `data-cb-filtered` flag, the `/` shortcut, the hand-off
 *  from the frontispiece field and in-place chapter/collection links. */
export function CookbookFilters(props: FiltersProps) {
  const gallery = useGallery(props.locale);
  return <FilterBar {...props} gallery={gallery} live />;
}

const STATIC_GALLERY: Gallery = { state: EMPTY_STATE, filtered: false, catalog: { status: "idle" }, model: null };

/** The prerendered bar (the Suspense fallback): the same box, unfiltered. */
export function CookbookFiltersFallback(props: FiltersProps) {
  return <FilterBar {...props} gallery={STATIC_GALLERY} live={false} />;
}

function FilterBar({ locale, chapters, gallery, live }: FiltersProps & { gallery: Gallery; live: boolean }) {
  const t = useTranslations("Cookbook");
  const { state, filtered, catalog, model } = gallery;
  const inputRef = useRef<HTMLInputElement>(null);
  const anchorRef = useRef<HTMLDivElement>(null);
  const timer = useRef<number | null>(null);
  const failed = catalog.status === "error";

  // The field's text: what was typed now, written to the URL 250 ms later.
  // A change of `q` from elsewhere (a chip, Clear all) replaces it.
  const [draft, setDraft] = useState(state.q);
  const [written, setWritten] = useState(state.q);
  const [seen, setSeen] = useState(state.q);
  if (state.q !== seen) {
    setSeen(state.q);
    if (state.q !== written) {
      setDraft(state.q);
      setWritten(state.q);
    }
  }

  const writeQuery = useCallback(
    (value: string) => {
      if (timer.current !== null) window.clearTimeout(timer.current);
      timer.current = null;
      setWritten(value);
      updateGallery(locale, { q: value });
    },
    [locale],
  );

  const onType = (value: string) => {
    setDraft(value);
    loadCatalog(locale);
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => writeQuery(value), 250);
  };

  useCatalogPrefetch(locale, filtered, live);

  // `<html>` survives client navigation: flag it while filtered, and clear
  // the flag when leaving. When the catalogue failed, the book view stays.
  const showResults = filtered && !failed;
  useLayoutEffect(() => {
    if (!live) return;
    const root = document.documentElement;
    if (showResults) root.setAttribute(FILTERED_ATTR, "");
    else root.removeAttribute(FILTERED_ATTR);
  }, [live, showResults]);
  useLayoutEffect(() => () => document.documentElement.removeAttribute(FILTERED_ATTR), []);

  // A new selection while scrolled past the bar brings the bar (and the
  // top of the results under it) back under the navbar.
  const stateKey = serializeState(state);
  const lastKey = useRef(stateKey);
  useLayoutEffect(() => {
    if (!live || lastKey.current === stateKey) return;
    lastKey.current = stateKey;
    const anchor = anchorRef.current;
    if (!anchor) return;
    const navH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--cb-nav-h")) || 0;
    const top = Math.max(0, anchor.getBoundingClientRect().top + window.scrollY - navH);
    if (window.scrollY > top + 1) window.scrollTo({ top });
  }, [live, stateKey]);

  // The bar sticks under the navbar, whatever its height.
  useEffect(() => {
    if (!live) return;
    const nav = document.querySelector("nav[data-site-nav]");
    if (!nav) return;
    const root = document.documentElement;
    const update = () => root.style.setProperty("--cb-nav-h", `${nav.getBoundingClientRect().height}px`);
    update();
    const observer = new ResizeObserver(update);
    observer.observe(nav);
    return () => {
      observer.disconnect();
      root.style.removeProperty("--cb-nav-h");
    };
  }, [live]);

  // `/` focuses the search (the frontispiece's while it is on screen), the
  // frontispiece hands its first keystroke over, and chapter/collection
  // links elsewhere on the page apply in place.
  useEffect(() => {
    if (!live) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return;
      e.preventDefault();
      const hero = document.getElementById("cb-hero-search");
      const box = hero?.getBoundingClientRect();
      if (hero && box && box.height > 0 && box.bottom > 0 && box.top < window.innerHeight) hero.focus();
      else inputRef.current?.focus();
    };
    const onHandOff = (e: Event) => {
      const value = (e as CustomEvent<{ value?: string }>).detail?.value ?? "";
      setDraft(value);
      writeQuery(value);
      // Focus moves within the keystroke's handler (iOS keeps the keyboard
      // up); the caret goes to the end once the field shows the value.
      const input = inputRef.current;
      if (!input) return;
      input.focus();
      requestAnimationFrame(() => input.setSelectionRange(value.length, value.length));
    };
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const link = (e.target as Element | null)?.closest?.("a[data-cb-cat], a[data-cb-col]");
      if (!link) return;
      e.preventDefault();
      const cat = link.getAttribute("data-cb-cat");
      const col = link.getAttribute("data-cb-col");
      if (failed) {
        // No catalogue: go to the chapter's shelf instead.
        if (cat) document.getElementById(`cb-ch-${cat}`)?.scrollIntoView();
        return;
      }
      loadCatalog(locale);
      if (cat) updateGallery(locale, { ...EMPTY_STATE, cat });
      else if (col) updateGallery(locale, { ...EMPTY_STATE, col: [col] });
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(HAND_OFF_EVENT, onHandOff);
    document.addEventListener("click", onClick);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(HAND_OFF_EVENT, onHandOff);
      document.removeEventListener("click", onClick);
    };
  }, [live, locale, writeQuery, failed]);

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") {
      if (draft) {
        e.preventDefault();
        setDraft("");
        writeQuery("");
      } else {
        e.currentTarget.blur();
      }
    } else if (e.key === "Enter") {
      e.preventDefault();
      writeQuery(draft);
    } else if (e.key === "ArrowDown" && filtered) {
      const first = document.querySelector<HTMLElement>(".cb-results .cb-plate-link, .cb-results .cb-row-link");
      if (first) {
        e.preventDefault();
        writeQuery(draft);
        first.focus();
      }
    }
  };

  const vocab = catalog.status === "ready" ? catalog.data.catalog.facets : null;
  const loadingText = failed ? t("unavailable") : t("loading");
  const sort = model?.sort ?? state.sort ?? defaultSort(state.q);
  const picked = selectionCount(state);
  // Without the catalogue a filtered URL shows the whole book: say so.
  const unavailableNote = failed && filtered ? t("unavailableBook") : "";
  const announce = unavailableNote || (filtered && model ? countLine(t, model.results.length, state.q) : "");

  const popoverBody = (render: () => React.ReactNode) =>
    model && vocab ? render() : <p className="px-2 py-3 font-sans text-[0.8rem] text-slate">{loadingText}</p>;

  return (
    <>
      <div ref={anchorRef} aria-hidden="true" />
      <div className="cb-bar cb-bar-shadow sticky z-40 bg-background/96 backdrop-blur-md backdrop-saturate-150">
        <div className="mx-auto max-w-6xl px-4 sm:px-6 2xl:max-w-7xl 2xl:px-8">
          {/* Wraps instead of overflowing when text is enlarged (WCAG 1.4.4). */}
          <div className="flex min-h-16 flex-wrap items-center gap-2 sm:min-h-14 lg:gap-3">
            <div role="search" aria-label={t("searchBarRegion")} className="relative min-w-40 flex-1">
              <label htmlFor="cb-search" className="sr-only">
                {t("searchLabel")}
              </label>
              <SearchIcon
                aria-hidden="true"
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-slate"
              />
              <input
                ref={inputRef}
                id="cb-search"
                type="search"
                value={failed ? "" : draft}
                onChange={(e) => onType(e.target.value)}
                onKeyDown={onKeyDown}
                onFocus={() => loadCatalog(locale)}
                disabled={failed}
                placeholder={failed ? t("unavailable") : t("searchPlaceholderShort")}
                autoComplete="off"
                spellCheck={false}
                enterKeyHint="search"
                className="cb-search-input h-11 w-full rounded-md bg-surface pr-11 pl-9 font-sans text-[0.9rem] text-foreground placeholder:text-slate disabled:opacity-70 sm:h-10 sm:text-[0.85rem]"
              />
              {draft && !failed ? (
                <button
                  type="button"
                  aria-label={t("searchClear")}
                  onClick={() => {
                    setDraft("");
                    writeQuery("");
                    inputRef.current?.focus();
                  }}
                  className="absolute top-1/2 right-0 grid size-11 -translate-y-1/2 place-items-center rounded-md text-slate hover:bg-surface-2 hover:text-foreground sm:right-0 sm:size-10"
                >
                  <XIcon aria-hidden="true" className="size-4" />
                </button>
              ) : (
                <kbd aria-hidden="true" className="cb-kbd pointer-events-none absolute top-1/2 right-3 hidden -translate-y-1/2 sm:block">
                  /
                </kbd>
              )}
            </div>

            <div className="hidden items-center gap-0.5 lg:flex">
              <FacetPopover t={t} label={t("facetGenre")} selected={state.genre.length} onOpen={() => loadCatalog(locale)}>
                {popoverBody(() => (
                  <FacetOptionList
                    label={t("facetGenre")}
                    options={facetOptions("genre", vocab!, model!)}
                    onToggle={(id) => toggleValue(locale, "genre", id)}
                  />
                ))}
              </FacetPopover>
              <FacetPopover t={t} label={t("facetLevel")} selected={state.level.length} onOpen={() => loadCatalog(locale)}>
                {popoverBody(() => (
                  <FacetOptionList
                    label={t("facetLevel")}
                    options={facetOptions("level", vocab!, model!)}
                    onToggle={(id) => toggleValue(locale, "level", id)}
                    levels
                  />
                ))}
              </FacetPopover>
              <FacetPopover t={t} label={t("facetOutput")} selected={state.out.length} onOpen={() => loadCatalog(locale)}>
                {popoverBody(() => (
                  <FacetOptionList
                    label={t("facetOutput")}
                    options={facetOptions("out", vocab!, model!)}
                    onToggle={(id) => toggleValue(locale, "out", id)}
                  />
                ))}
              </FacetPopover>
              <FacetPopover
                t={t}
                label={t("facetFeatures")}
                selected={state.feat.length}
                onOpen={() => loadCatalog(locale)}
                wide
              >
                {popoverBody(() => (
                  <FeatureFinder
                    t={t}
                    options={facetOptions("feat", vocab!, model!)}
                    onToggle={(id) => toggleValue(locale, "feat", id)}
                    listClassName="max-h-72"
                  />
                ))}
              </FacetPopover>
              <FacetPopover
                t={t}
                label={t("facetMore")}
                selected={state.warn.length + state.col.length}
                onOpen={() => loadCatalog(locale)}
                wide
              >
                {popoverBody(() => (
                  <div className="flex max-h-96 flex-col gap-3 overflow-y-auto overscroll-contain">
                    {vocab!.warnings.length > 0 && (
                      <div>
                        <p className="kicker px-2 pt-1 pb-1.5 text-slate">{t("facetWarnings")}</p>
                        <FacetOptionList
                          label={t("facetWarnings")}
                          options={facetOptions("warn", vocab!, model!)}
                          onToggle={(id) => toggleValue(locale, "warn", id)}
                        />
                      </div>
                    )}
                    <div>
                      <p className="kicker px-2 pt-1 pb-1.5 text-slate">{t("facetCollections")}</p>
                      <FacetOptionList
                        label={t("facetCollections")}
                        options={facetOptions("col", vocab!, model!)}
                        onToggle={(id) => toggleValue(locale, "col", id)}
                      />
                    </div>
                  </div>
                ))}
              </FacetPopover>
            </div>

            <FilterSheet locale={locale} t={t} gallery={gallery} chapters={chapters} picked={picked} />

            <div role="group" aria-label={t("view")} className="hidden shrink-0 items-center rounded-md bg-surface p-0.5 sm:flex">
              {(
                [
                  ["plates", t("viewPlates"), LayoutGridIcon],
                  ["contents", t("viewContents"), ListIcon],
                ] as const
              ).map(([view, label, Icon]) => (
                <button
                  key={view}
                  type="button"
                  aria-pressed={state.view === view}
                  aria-label={label}
                  title={label}
                  onClick={() => {
                    loadCatalog(locale);
                    updateGallery(locale, { view });
                  }}
                  className="grid size-10 place-items-center rounded-[5px] text-slate transition-colors hover:text-foreground aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-sm"
                >
                  <Icon aria-hidden="true" className="size-4" />
                </button>
              ))}
            </div>

            <div className="hidden shrink-0 lg:block">
              <Select
                value={sort}
                items={sortItems(t, state.q)}
                onValueChange={(value) => value && setSort(locale, value as SortId)}
              >
                <SelectTrigger
                  aria-label={t("sort")}
                  className="h-10 min-h-10 gap-1 border-0 bg-surface font-sans text-[0.8rem] dark:bg-surface dark:hover:bg-surface-2"
                >
                  <span className="text-slate">{t("sort")}:</span>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent align="end" alignItemWithTrigger={false}>
                  {sortItems(t, state.q).map((item) => (
                    <SelectItem key={item.value} value={item.value}>
                      {item.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div role="group" aria-label={t("facetChapter")} className="cb-scroll-row -mx-4 hidden h-12 items-center gap-1.5 px-4 sm:flex">
            <ChapterChips
              t={t}
              chapters={chapters}
              selected={state.cat}
              counts={model?.counts.cat ?? null}
              onSelect={(id) => setChapter(locale, id)}
              anchors={failed}
            />
          </div>
          {unavailableNote && (
            <p aria-hidden="true" className="pb-2.5 font-sans text-[0.8rem] text-slate">
              {unavailableNote}
            </p>
          )}
        </div>
        <p role="status" aria-live="polite" className="sr-only">
          {announce}
        </p>
      </div>
    </>
  );
}
