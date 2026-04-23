"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { Dialog } from "@base-ui/react/dialog";
import MiniSearch from "minisearch";
import type { SearchSection } from "@/lib/docs";

interface IndexPayload {
  locale: string;
  sections: SearchSection[];
}

interface Hit {
  section: SearchSection;
  score: number;
  terms: string[];
}

const MAX_RESULTS = 12;
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
  const pattern = new RegExp(
    "(" + terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|") + ")",
    "gi",
  );
  const parts = text.split(pattern);
  return parts.map((part, i) =>
    pattern.test(part) ? (
      <mark key={i} className="bg-gilt/30 text-foreground rounded px-0.5">
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

export function DocsSearchPalette() {
  const locale = useLocale();
  const t = useTranslations("DocsSearch");

  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [selected, setSelected] = useState(0);
  const [index, setIndex] = useState<MiniSearch<SearchSection> | null>(null);
  const [sectionsById, setSectionsById] = useState<Map<string, SearchSection>>(new Map());
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);

  const loadIndex = useCallback(async () => {
    if (index || loading) return;
    setLoading(true);
    try {
      const res = await fetch(`/${locale}/docs/search-index`);
      const data: IndexPayload = await res.json();
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
      ms.addAll(data.sections);
      const map = new Map<string, SearchSection>();
      for (const s of data.sections) map.set(s.id, s);
      setIndex(ms);
      setSectionsById(map);
    } finally {
      setLoading(false);
    }
  }, [index, loading, locale]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen(true);
      }
    };
    const onCustom = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener(OPEN_EVENT, onCustom);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener(OPEN_EVENT, onCustom);
    };
  }, []);

  useEffect(() => {
    if (open) {
      loadIndex();
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setQuery("");
      setHits([]);
      setSelected(0);
    }
  }, [open, loadIndex]);

  useEffect(() => {
    if (!index || !query.trim()) {
      setHits([]);
      setSelected(0);
      return;
    }
    const results = index.search(query).slice(0, MAX_RESULTS);
    const mapped: Hit[] = [];
    for (const r of results) {
      const section = sectionsById.get(String(r.id));
      if (!section) continue;
      mapped.push({ section, score: r.score, terms: r.terms });
    }
    setHits(mapped);
    setSelected(0);
  }, [query, index, sectionsById]);

  const hrefFor = useCallback(
    (section: SearchSection) =>
      section.anchor
        ? `/${locale}/docs/${section.slug}#${section.anchor}`
        : `/${locale}/docs/${section.slug}`,
    [locale],
  );

  const navigateTo = useCallback((href: string) => {
    setOpen(false);
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
  }, []);

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
    const li = listRef.current?.children[selected] as HTMLElement | undefined;
    li?.scrollIntoView({ block: "nearest" });
  }, [selected]);

  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
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
              onChange={(e) => setQuery(e.target.value)}
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
            {loading && !index ? (
              <div className="px-4 py-8 text-center font-body text-sm text-slate">{t("loading")}</div>
            ) : !query.trim() ? (
              <div className="px-4 py-8 text-center font-body text-sm text-slate">{t("emptyState")}</div>
            ) : hits.length === 0 ? (
              <div className="px-4 py-8 text-center font-body text-sm text-slate">
                {t("noResults", { query })}
              </div>
            ) : (
              <ul ref={listRef} role="listbox" className="py-2">
                {hits.map((hit, i) => {
                  const { section } = hit;
                  const snippet = buildSnippet(section.body, hit.terms);
                  const isSel = i === selected;
                  const href = hrefFor(section);
                  return (
                    <li key={section.id} role="option" aria-selected={isSel}>
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
                        <div className="flex items-center gap-2 font-body text-xs text-slate">
                          <span className="font-medium text-foreground/70">{section.docTitle}</span>
                          {section.breadcrumb && (
                            <>
                              <span aria-hidden>›</span>
                              <span className="truncate">{section.breadcrumb}</span>
                            </>
                          )}
                        </div>
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

function openPalette() {
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
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
