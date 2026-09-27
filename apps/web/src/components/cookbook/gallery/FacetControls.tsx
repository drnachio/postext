"use client";

import { useState } from "react";
import { CheckIcon, ChevronDownIcon } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { foldText } from "@/lib/cookbook/search";
import { cn } from "@/lib/utils";
import { LevelSquares } from "@/components/cookbook/RecipeCard";
import type { GalleryChapter } from "./data";
import type { Translate } from "./labels";

export interface FacetOption {
  id: string;
  label: string;
  count: number;
  active: boolean;
  /** Secondary text (a warning's kind). */
  hint?: string;
}

/** A facet's values as toggle buttons (`aria-pressed`) in a labelled group,
 *  each with its disjunctive count. A value with no result is disabled
 *  unless it is active. */
export function FacetOptionList({
  label,
  options,
  onToggle,
  levels = false,
  className,
}: {
  label: string;
  options: FacetOption[];
  onToggle: (id: string) => void;
  /** Draw the level squares before each label. */
  levels?: boolean;
  className?: string;
}) {
  return (
    <div role="group" aria-label={label} className={cn("flex flex-col gap-0.5", className)}>
      {options.map((o) => (
        <button
          key={o.id}
          type="button"
          aria-pressed={o.active}
          disabled={!o.active && o.count === 0}
          onClick={() => onToggle(o.id)}
          className="group/opt flex min-h-10 w-full items-center gap-2.5 rounded-md px-2 text-left font-sans text-[0.82rem] transition-colors hover:bg-surface-2 disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent sm:min-h-9"
        >
          <span
            aria-hidden="true"
            className={cn(
              "grid size-4 shrink-0 place-items-center rounded-[4px] shadow-[inset_0_0_0_1.5px_var(--rule-strong)]",
              o.active && "bg-brand text-brand-contrast shadow-none",
            )}
          >
            {o.active && <CheckIcon className="size-3" strokeWidth={3} />}
          </span>
          {levels && <LevelSquares level={Number(o.id)} className="part-blue" />}
          <span className="min-w-0 flex-1">
            <span className="block truncate">{o.label}</span>
            {o.hint && <span className="block truncate font-mono text-[0.68rem] text-slate">{o.hint}</span>}
          </span>
          <span className="shrink-0 text-xs text-slate tabular-nums">{o.count}</span>
        </button>
      ))}
    </div>
  );
}

/** The features facet: a type-ahead filter over a long list (AND). */
export function FeatureFinder({
  t,
  options,
  onToggle,
  listClassName,
}: {
  t: Translate;
  options: FacetOption[];
  onToggle: (id: string) => void;
  listClassName?: string;
}) {
  const [find, setFind] = useState("");
  const needle = foldText(find.trim());
  const shown = needle
    ? options.filter((o) => foldText(o.label).includes(needle) || o.id.includes(needle))
    : options;
  return (
    <div className="flex flex-col gap-2">
      <p className="px-1 font-body text-[0.8rem] leading-snug text-slate italic">{t("facetFeaturesHint")}</p>
      <input
        type="search"
        value={find}
        onChange={(e) => setFind(e.target.value)}
        placeholder={t("featuresFind")}
        aria-label={t("featuresFind")}
        autoComplete="off"
        spellCheck={false}
        className="cb-search-input h-10 w-full rounded-md bg-surface px-3 font-sans text-[0.85rem] placeholder:text-slate sm:h-9"
      />
      <div className={cn("overflow-y-auto overscroll-contain", listClassName)}>
        {shown.length > 0 ? (
          <FacetOptionList label={t("facetFeatures")} options={shown} onToggle={onToggle} />
        ) : (
          <p className="px-2 py-3 font-sans text-[0.8rem] text-slate">{t("featuresNone", { q: find.trim() })}</p>
        )}
      </div>
    </div>
  );
}

/** The number of picks on a trigger; screen readers hear "2 selected". */
export function PickCount({ t, count }: { t: Translate; count: number }) {
  return (
    <span className="grid h-4.5 min-w-4.5 place-items-center rounded-full bg-brand px-1 text-[0.62rem] font-bold text-brand-contrast tabular-nums">
      <span aria-hidden="true">{count}</span>
      <span className="sr-only">, {t("pickedCount", { count })}</span>
    </span>
  );
}

/** A facet in the bar: a trigger with the number of picks, and a popover. */
export function FacetPopover({
  t,
  label,
  selected,
  onOpen,
  children,
  wide = false,
}: {
  t: Translate;
  label: string;
  selected: number;
  onOpen: () => void;
  children: React.ReactNode;
  wide?: boolean;
}) {
  return (
    <Popover onOpenChange={(open) => open && onOpen()}>
      <PopoverTrigger
        render={
          <button
            type="button"
            className={cn(
              "inline-flex h-9 items-center gap-1.5 rounded-md px-2.5 font-sans text-[0.8rem] font-medium whitespace-nowrap text-foreground/85 transition-colors hover:bg-surface-2 hover:text-foreground aria-expanded:bg-surface-2",
              selected > 0 && "text-foreground",
            )}
          />
        }
      >
        {label}
        {selected > 0 && <PickCount t={t} count={selected} />}
        <ChevronDownIcon aria-hidden="true" className="size-3.5 text-slate" />
      </PopoverTrigger>
      <PopoverContent align="start" className={cn("gap-2 p-2", wide ? "w-80" : "w-64")}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** "All" and one chip per chapter (its part colour, number and title).
 *  With no catalogue they are plain anchors down to the shelves. */
export function ChapterChips({
  t,
  chapters,
  selected,
  counts,
  onSelect,
  anchors = false,
}: {
  t: Translate;
  chapters: GalleryChapter[];
  selected: string | null;
  counts: Record<string, number> | null;
  onSelect: (id: string | null) => void;
  anchors?: boolean;
}) {
  const chip =
    "inline-flex h-11 shrink-0 items-center gap-2 rounded-full px-3.5 font-sans text-[0.78rem] font-medium whitespace-nowrap transition-colors sm:h-8 sm:px-3";
  if (anchors) {
    return chapters.map((c) => (
      <a key={c.id} href={`#cb-ch-${c.id}`} className={cn(chip, `part-${c.color}`, "bg-surface hover:bg-surface-2")}>
        <span aria-hidden="true" className="size-2 bg-(--part)" />
        <span className="font-bold text-(--part-ink) tabular-nums">{c.number}</span>
        {c.title}
      </a>
    ));
  }
  return (
    <>
      <button
        type="button"
        aria-pressed={selected === null}
        onClick={() => onSelect(null)}
        className={cn(
          chip,
          selected === null ? "bg-foreground text-background" : "bg-surface text-foreground/85 hover:bg-surface-2",
        )}
      >
        <span aria-hidden="true" className="size-2 rounded-full bg-current" />
        {t("chapterAll")}
      </button>
      {chapters.map((c) => {
        const active = selected === c.id;
        const count = counts ? (counts[c.id] ?? 0) : c.count;
        return (
          <button
            key={c.id}
            type="button"
            aria-pressed={active}
            disabled={!active && count === 0}
            onClick={() => onSelect(active ? null : c.id)}
            className={cn(
              chip,
              `part-${c.color}`,
              active
                ? "bg-(--part) text-(--part-on)"
                : "bg-surface text-foreground/85 hover:bg-surface-2 disabled:opacity-40 disabled:hover:bg-surface",
            )}
          >
            <span aria-hidden="true" className={cn("size-2", active ? "bg-(--part-on)" : "bg-(--part)")} />
            <span className={cn("font-bold tabular-nums", !active && "text-(--part-ink)")}>{c.number}</span>
            {c.title}
          </button>
        );
      })}
    </>
  );
}
