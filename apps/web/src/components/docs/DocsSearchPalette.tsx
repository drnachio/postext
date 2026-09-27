"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "@base-ui/react/dialog";
import MiniSearch from "minisearch";
import type { SearchSection } from "@/lib/docs";
import { usePathname } from "@/i18n/navigation";
import { cookbookPaletteEntries, makeProcessTerm, tokenize } from "@/lib/cookbook/search";
import type { Catalog, PartColor } from "@/lib/cookbook/types";
import { unpackCatalog, type PackedCatalog } from "@/lib/cookbook/wire";

interface IndexPayload {
  locale: string;
  sections: SearchSection[];
}

interface Hit {
  section: SearchSection;
  score: number;
  terms: string[];
}

/** Both indexes, built on the first open. */
interface Indexes {
  docs: MiniSearch<SearchSection> | null;
  /** Recipes and explained warnings, from the Cookbook's catalogue. */
  cookbook: MiniSearch<SearchSection> | null;
  byId: Map<string, SearchSection>;
  /** Part colour of each Cookbook entry (its recipe's chapter). */
  colors: Map<string, PartColor>;
  /** Sources whose fetch failed: the next open fetches them again. */
  docsFailed: boolean;
  cookbookFailed: boolean;
}

const MAX_DOCS = 8;
const MAX_RECIPES = 4;
const SNIPPET_LEN = 160;
const OPEN_EVENT = "docs-search:open";

function buildSnippet(body: string, terms: string[]): string {
  if (!body) return "";
  const lower = body.toLowerCase();
  let bestIdx = -1;
  for (const term of terms) {
    const idx = lower.indexOf(term.toLowerCase());
    if (idx !== -1 && (bestIdx === -1 || idx < bestIdx)) bestIdx = idx;
  }
  if (bestIdx === -1) return body.slice(0, SNIPPET_LEN) + (body.length > SNIPPET_LEN ? "…" : "");
  const start = Math.max(0, bestIdx - 40);
  const end = Math.min(body.length, start + SNIPPET_LEN);
  return (start > 0 ? "…" : "") + body.slice(start, end) + (end < body.length ? "…" : "");
}

function highlight(text: string, terms: string[]) {
  if (!terms.length) return text;
  // Marks whole words: the Cookbook index matches folded stems ("head" for
  // "heads"), so a match runs on to the end of its word.
  const source = "(?:" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")[\\p{L}\\p{N}]*";
  const pattern = new RegExp(`(${source})`, "giu");
  const whole = new RegExp(`^${source}$`, "iu");
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    whole.test(part) ? (
      <mark key={i} className="bg-brand/20 text-foreground rounded px-0.5">
        {part}
      </mark>
    ) : (
      <span key={i}>{part}</span>
    ),
  );
}

function useShortcutLabel() {
  return useMemo(() => {
    if (typeof navigator === "undefined") return "⌘K";
    return navigator.platform.toLowerCase().includes("mac") ? "⌘K" : "Ctrl K";
  }, []);
}

async function fetchJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  return res.ok ? ((await res.json()) as T) : null;
}

function docsIndex(sections: SearchSection[]): MiniSearch<SearchSection> {
  const ms = new MiniSearch<SearchSection>({
    fields: ["sectionTitle", "docTitle", "breadcrumb", "body"],
    storeFields: ["id"],
    idField: "id",
    searchOptions: {
      boost: { sectionTitle: 3, docTitle: 2, breadcrumb: 1.5 },
      prefix: true,
      fuzzy: 0.2,
    },
  });
  ms.addAll(sections);
  return ms;
}

/** The Cookbook's entries, indexed with the gallery's tokenizer (camelCase
 *  and dotted config paths split, accents and plurals folded). */
function cookbookIndex(entries: SearchSection[], locale: string): MiniSearch<SearchSection> {
  const ms = new MiniSearch<SearchSection>({
    fields: ["sectionTitle", "breadcrumb", "body"],
    storeFields: ["id"],
    idField: "id",
    tokenize,
    processTerm: makeProcessTerm(locale === "es" ? "es" : "en"),
    searchOptions: {
      boost: { sectionTitle: 3, breadcrumb: 1.5 },
      prefix: true,
      fuzzy: (term) => (term.length >= 5 ? 0.2 : false),
    },
  });
  ms.addAll(entries);
  return ms;
}

export function DocsSearchPalette() {
  const locale = useLocale();
  const pathname = usePathname();
  const t = useTranslations("DocsSearch");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const [indexes, setIndexes] = useState<Indexes | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  // The docs index and the Cookbook's catalogue are separate files (the docs
  // one stays cached as it was), fetched in parallel; either may fail alone.
  // Only what loaded is kept: a failed source is fetched again on the next
  // open, and nothing is cached when both fail.
  const loadIndex = useCallback(async () => {
    const needDocs = !indexes || indexes.docsFailed;
    const needCookbook = !indexes || indexes.cookbookFailed;
    if (loading || (!needDocs && !needCookbook)) return;
    setLoading(true);
    try {
      const [docs, packed] = await Promise.all([
        needDocs ? fetchJson<IndexPayload>(`/${locale}/docs/search-index`).catch(() => null) : null,
        needCookbook ? fetchJson<Catalog | PackedCatalog>(`/${locale}/cookbook/catalog.json`).catch(() => null) : null,
      ]);
      const catalog = packed ? unpackCatalog(packed) : null;
      if (!docs && !catalog) return;
      const next: Indexes = indexes
        ? { ...indexes, byId: new Map(indexes.byId), colors: new Map(indexes.colors) }
        : { docs: null, cookbook: null, byId: new Map(), colors: new Map(), docsFailed: true, cookbookFailed: true };
      if (docs) {
        const docSections = docs.sections ?? [];
        for (const s of docSections) next.byId.set(s.id, s);
        next.docs = docSections.length ? docsIndex(docSections) : null;
        next.docsFailed = false;
      }
      if (catalog) {
        const recipeSections = cookbookPaletteEntries(catalog, { cookbook: t("groupCookbook") });
        const chapterColor = new Map(catalog.facets.chapters.map((c) => [c.id, c.color]));
        const recipeColor = new Map(catalog.recipes.map((r) => [r.slug, chapterColor.get(r.chapter)]));
        for (const entry of recipeSections) {
          next.byId.set(entry.id, entry);
          const color = recipeColor.get(entry.slug);
          if (color) next.colors.set(entry.id, color);
        }
        next.cookbook = recipeSections.length ? cookbookIndex(recipeSections, locale) : null;
        next.cookbookFailed = false;
      }
      setIndexes(next);
    } finally {
      setLoading(false);
    }
  }, [indexes, loading, locale, t]);

  // Open/close work lives in the event handler (not an effect): kick off the
  // index fetch, focus the input once the portal has mounted, and reset the
  // query on close. The Dialog, the global shortcuts and the open event
  // (whose `detail.query` prefills the field) share this path.
  const handleOpenChange = useCallback(
    (next: boolean, prefill?: string) => {
      setOpen(next);
      if (next) {
        if (prefill !== undefined) {
          setQuery(prefill);
          setSelected(0);
        }
        void loadIndex();
        setTimeout(() => inputRef.current?.focus(), 50);
      } else {
        setQuery("");
        setSelected(0);
      }
    },
    [loadIndex],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handleOpenChange(true);
      }
    };
    const onCustom = (e: Event) => {
      const prefill = (e as CustomEvent<{ query?: unknown } | null>).detail?.query;
      handleOpenChange(true, typeof prefill === "string" ? prefill : undefined);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onCustom);
    };
  }, [handleOpenChange]);

  // Two groups, Docs and Cookbook; on the Cookbook's own pages recipes come
  // first. Results derive from the query and the loaded indexes — no state.
  const cookbookFirst = pathname === "/cookbook" || pathname.startsWith("/cookbook/");
  const groups = useMemo(() => {
    if (!indexes || !query.trim()) return [];
    const run = (ms: MiniSearch<SearchSection> | null, max: number): Hit[] => {
      if (!ms) return [];
      const hits: Hit[] = [];
      for (const r of ms.search(query).slice(0, max)) {
        const section = indexes.byId.get(String(r.id));
        if (section) hits.push({ section, score: r.score, terms: r.terms });
      }
      return hits;
    };
    const docs = { id: "docs", label: t("groupDocs"), hits: run(indexes.docs, MAX_DOCS) };
    const cookbook = { id: "cookbook", label: t("groupCookbook"), hits: run(indexes.cookbook, MAX_RECIPES) };
    return (cookbookFirst ? [cookbook, docs] : [docs, cookbook]).filter((g) => g.hits.length > 0);
  }, [query, indexes, cookbookFirst, t]);
  const hits = useMemo(() => groups.flatMap((g) => g.hits), [groups]);

  const hrefFor = useCallback(
    (section: SearchSection) => {
      // Entries from an index built before `href` existed still open their doc.
      const path = section.href || (section.anchor ? `/docs/${section.slug}#${section.anchor}` : `/docs/${section.slug}`);
      return `/${locale}${path}`;
    },
    [locale],
  );

  const navigateTo = useCallback((href: string) => {
    handleOpenChange(false);
    const [pathname, hash] = href.split("#");
    const samePath = window.location.pathname === pathname;
    if (samePath) {
      if (hash) {
        const el = document.getElementById(hash);
        if (el) {
          el.scrollIntoView({ behavior: "smooth", block: "start" });
          history.replaceState(null, "", `#${hash}`);
          return;
        }
      }
      window.scrollTo({ top: 0, behavior: "smooth" });
      history.replaceState(null, "", pathname);
      return;
    }
    window.location.assign(href);
  }, [handleOpenChange]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected((s) => Math.min(hits.length - 1, s + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected((s) => Math.max(0, s - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = hits[selected];
      if (hit) navigateTo(hrefFor(hit.section));
    }
  };

  useEffect(() => {
    const row = listRef.current?.querySelector<HTMLElement>(`[data-index="${selected}"]`);
    row?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => handleOpenChange(next)}>
      <Dialog.Portal>
        <Dialog.Backdrop className="fixed inset-0 z-[100] bg-black/50 backdrop-blur-sm data-[starting-style]:opacity-0 data-[ending-style]:opacity-0 transition-opacity duration-150" />
        <Dialog.Popup
          className="fixed left-1/2 top-[15vh] z-[101] w-[92vw] max-w-xl -translate-x-1/2 overflow-hidden rounded-lg border border-rule bg-background shadow-2xl data-[starting-style]:opacity-0 data-[starting-style]:scale-95 data-[ending-style]:opacity-0 data-[ending-style]:scale-95 transition-[opacity,transform] duration-150"
          onKeyDown={onKeyDown}
        >
          <Dialog.Title className="sr-only">{t("title")}</Dialog.Title>
          <Dialog.Description className="sr-only">{t("description")}</Dialog.Description>

          <div className="flex items-center gap-3 border-b border-rule px-4 py-3">
            <svg
              xmlns="http://www.w3.org/2000/svg"
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-slate"
              aria-hidden
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m21 21-4.3-4.3" />
            </svg>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(0);
              }}
              placeholder={t("inputPlaceholder")}
              className="flex-1 border-0 bg-transparent font-body text-sm text-foreground placeholder:text-slate focus:outline-none focus:ring-0 focus-visible:outline-none"
              style={{ outline: "none" }}
              aria-label={t("inputAriaLabel")}
            />
            <Dialog.Close className="rounded border border-rule px-1.5 py-0.5 font-mono text-[10px] text-slate hover:text-foreground">
              Esc
            </Dialog.Close>
          </div>

          <div className="max-h-[60vh] overflow-y-auto">
            {loading && !indexes ? (
              <div className="px-4 py-8 text-center font-body text-sm text-slate">{t("loading")}</div>
            ) : !query.trim() ? (
              <div className="px-4 py-8 text-center font-body text-sm text-slate">{t("emptyState")}</div>
            ) : hits.length === 0 ? (
              <div className="px-4 py-8 text-center font-body text-sm text-slate">
                {t("noResults", { query })}
              </div>
            ) : (
              <div ref={listRef} role="listbox" aria-label={t("title")} className="pb-2">
                {groups.map((group) => {
                  const offset = hits.indexOf(group.hits[0]!);
                  return (
                    <ul key={group.id} role="group" aria-label={group.label}>
                      <li role="presentation" className="kicker px-4 pt-3 pb-1 text-slate">
                        {group.label}
                      </li>
                      {group.hits.map((hit, j) => {
                        const i = offset + j;
                        const { section } = hit;
                        const snippet = buildSnippet(section.body, hit.terms);
                        const isSel = i === selected;
                        const href = hrefFor(section);
                        const color = indexes?.colors.get(section.id);
                        return (
                          <li key={section.id} role="option" aria-selected={isSel} data-index={i}>
                            <a
                              href={href}
                              onClick={(e) => {
                                e.preventDefault();
                                navigateTo(href);
                              }}
                              onMouseEnter={() => setSelected(i)}
                              className={`flex w-full flex-col gap-1 px-4 py-2.5 text-left transition-colors ${
                                isSel ? "bg-surface" : "hover:bg-surface/50"
                              }`}
                            >
                              {section.kind === "doc" ? (
                                <div className="flex items-center gap-2 font-body text-xs text-slate">
                                  <span className="font-medium text-foreground/70">{section.docTitle}</span>
                                  {section.breadcrumb && (
                                    <>
                                      <span aria-hidden>›</span>
                                      <span className="truncate">{section.breadcrumb}</span>
                                    </>
                                  )}
                                </div>
                              ) : (
                                <div
                                  className={`flex min-w-0 items-center gap-2 font-body text-xs text-slate ${
                                    color ? `part-${color}` : ""
                                  }`}
                                >
                                  <span aria-hidden className="size-2 shrink-0 bg-[var(--part,var(--brand))]" />
                                  <span className="kicker shrink-0 text-[0.62rem] text-[var(--part-ink,var(--brand))]">
                                    {section.kind === "recipe" ? t("recipeKicker") : t("warningKicker")}
                                  </span>
                                  <span className="truncate">{section.breadcrumb}</span>
                                </div>
                              )}
                              <div className="font-display text-sm font-medium text-foreground">
                                {highlight(section.sectionTitle, hit.terms)}
                              </div>
                              {snippet && (
                                <div className="font-body text-xs text-slate line-clamp-2">
                                  {highlight(snippet, hit.terms)}
                                </div>
                              )}
                            </a>
                          </li>
                        );
                      })}
                    </ul>
                  );
                })}
              </div>
            )}
          </div>

          {hits.length > 0 && (
            <div className="flex items-center justify-end gap-3 border-t border-rule px-4 py-2 font-body text-[11px] text-slate">
              <span>
                <kbd className="rounded border border-rule px-1">↑</kbd>{" "}
                <kbd className="rounded border border-rule px-1">↓</kbd> {t("hintNavigate")}
              </span>
              <span>
                <kbd className="rounded border border-rule px-1">↵</kbd> {t("hintOpen")}
              </span>
            </div>
          )}
        </Dialog.Popup>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

/** Opens the ⌘K palette from anywhere, optionally with a query already
 *  typed (the Cookbook's empty state searches the docs this way). */
export function openSearchPalette(query?: string) {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail: query === undefined ? null : { query } }));
}

function openPalette() {
  openSearchPalette();
}

interface TriggerProps {
  variant?: "full" | "compact" | "icon";
  className?: string;
}

export function DocsSearchTrigger({ variant = "full", className = "" }: TriggerProps) {
  const t = useTranslations("DocsSearch");
  const shortcut = useShortcutLabel();

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={openPalette}
        aria-label={t("triggerAriaLabel")}
        className={`flex items-center justify-center rounded-md border border-rule bg-background/50 p-1.5 text-slate transition-colors hover:border-foreground/30 hover:text-foreground ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="16"
          height="16"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
      </button>
    );
  }

  if (variant === "compact") {
    return (
      <button
        type="button"
        onClick={openPalette}
        aria-label={t("triggerAriaLabel")}
        className={`group flex items-center gap-2 rounded-md border border-rule bg-background/50 px-2.5 py-1.5 text-slate transition-colors hover:border-foreground/30 hover:text-foreground ${className}`}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="11" cy="11" r="7" />
          <path d="m21 21-4.3-4.3" />
        </svg>
        <kbd className="rounded border border-rule bg-surface px-1.5 py-0.5 font-mono text-[10px] text-slate group-hover:text-foreground">
          {shortcut}
        </kbd>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={openPalette}
      className={`group flex w-full items-center gap-2 rounded-md border border-rule bg-background/50 px-3 py-1.5 text-left font-body text-sm text-slate transition-colors hover:border-foreground/30 hover:text-foreground ${className}`}
      aria-label={t("triggerAriaLabel")}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="14"
        height="14"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m21 21-4.3-4.3" />
      </svg>
      <span className="flex-1 truncate">{t("triggerPlaceholder")}</span>
      <kbd className="hidden rounded border border-rule bg-surface px-1.5 py-0.5 font-mono text-[10px] text-slate group-hover:text-foreground sm:inline-block">
        {shortcut}
      </kbd>
    </button>
  );
}
