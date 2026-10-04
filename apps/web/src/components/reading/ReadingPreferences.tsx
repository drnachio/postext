"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { BookOpenText, ChevronDown } from "lucide-react";
import { useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { useTheme } from "@/components/ThemeProvider";
import {
  DEFAULT_READING,
  READING_EVENT,
  READING_KEY,
  READING_KEYS,
  READING_OPTIONS,
  parseReading,
  saveReading,
  type ReadingKey,
  type ReadingPrefs,
} from "./readingPrefs";

function subscribe(callback: () => void) {
  window.addEventListener("storage", callback);
  window.addEventListener(READING_EVENT, callback);
  return () => {
    window.removeEventListener("storage", callback);
    window.removeEventListener(READING_EVENT, callback);
  };
}

function readRaw(): string | null {
  try {
    return localStorage.getItem(READING_KEY);
  } catch {
    return null;
  }
}

/** The stored preferences; the designed defaults during server render. */
export function useReadingPrefs(): [ReadingPrefs, (next: ReadingPrefs) => void] {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  const prefs = useMemo(() => parseReading(raw), [raw]);
  return [prefs, saveReading];
}

const OPTION_LABEL: Record<ReadingKey, Record<string, string>> = {
  align: { designed: "alignJustified", left: "alignLeft" },
  spacing: { designed: "spacingDesigned", wide: "spacingWide" },
  width: { designed: "widthDesigned", narrow: "widthNarrow" },
  colors: { theme: "colorsTheme", contrast: "colorsContrast", sepia: "colorsSepia" },
};

const OPTION_ROW =
  "flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 font-sans text-[0.8rem] text-foreground hover:bg-surface has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-[-2px] has-[:focus-visible]:outline-brand";
const RADIO = "size-4 shrink-0 cursor-pointer accent-[var(--brand)] focus-visible:outline-none";

/** Theme (light / dark, the same setting as the menu-bar switch), the four
 *  reading choices and the "Default settings" button. */
function ReadingForm({ idBase, showPageLink }: { idBase: string; showPageLink: boolean }) {
  const t = useTranslations("ReadingPrefs");
  const [prefs, save] = useReadingPrefs();
  const { theme, chosen, setTheme, resetTheme } = useTheme();
  const isDefault = !chosen && READING_KEYS.every((k) => prefs[k] === DEFAULT_READING[k]);

  return (
    <div className="flex flex-col gap-4">
      <fieldset className="min-w-0">
        <legend className="mb-1 font-sans text-[0.8rem] font-semibold text-foreground">{t("themeLegend")}</legend>
        <div className="flex flex-col">
          {(["light", "dark"] as const).map((value) => {
            const id = `${idBase}-theme-${value}`;
            return (
              <label key={value} htmlFor={id} className={OPTION_ROW}>
                <input
                  id={id}
                  type="radio"
                  name={`${idBase}-theme`}
                  value={value}
                  checked={theme === value}
                  onChange={() => setTheme(value)}
                  className={RADIO}
                />
                <span>{t(value === "light" ? "themeLight" : "themeDark")}</span>
              </label>
            );
          })}
        </div>
      </fieldset>
      {READING_KEYS.map((key) => (
        <fieldset key={key} className="min-w-0">
          <legend className="mb-1 font-sans text-[0.8rem] font-semibold text-foreground">{t(`${key}Legend`)}</legend>
          <div className="flex flex-col">
            {READING_OPTIONS[key].map((value) => {
              const id = `${idBase}-${key}-${value}`;
              return (
                <label key={value} htmlFor={id} className={OPTION_ROW}>
                  <input
                    id={id}
                    type="radio"
                    name={`${idBase}-${key}`}
                    value={value}
                    checked={prefs[key] === value}
                    onChange={() => save({ ...prefs, [key]: value })}
                    className={RADIO}
                  />
                  <span>{t(OPTION_LABEL[key][value]!)}</span>
                </label>
              );
            })}
          </div>
        </fieldset>
      ))}
      <p className="font-sans text-[0.75rem] leading-normal text-slate">{t("themeNote")}</p>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-rule pt-3">
        <button
          type="button"
          onClick={() => {
            save({ ...DEFAULT_READING });
            resetTheme();
          }}
          disabled={isDefault}
          className="min-h-11 rounded-md border border-rule-strong px-3 font-sans text-[0.8rem] font-semibold text-foreground transition-colors hover:bg-surface disabled:cursor-not-allowed disabled:opacity-100 disabled:text-slate"
        >
          {t("reset")}
        </button>
        {showPageLink && (
          <Link
            href="/accessibility"
            className="inline-flex min-h-11 items-center rounded-md px-2 font-sans text-[0.8rem] font-medium text-brand underline underline-offset-4"
          >
            {t("statementLink")}
          </Link>
        )}
      </div>
      <p role="status" className="sr-only">
        {isDefault ? t("statusDefault") : t("statusCustom")}
      </p>
    </div>
  );
}

/**
 * `popover`: a nav button opening a non-modal dialog under it.
 * `disclosure`: a full-width button expanding the panel in place (mobile menu).
 * `panel`: the form alone, always shown (the accessibility page).
 */
export function ReadingPreferences({ variant = "popover" }: { variant?: "popover" | "disclosure" | "panel" }) {
  const t = useTranslations("ReadingPrefs");
  const idBase = useId().replace(/:/g, "");
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const panelId = `${idBase}-panel`;
  const titleId = `${idBase}-title`;

  const close = useCallback((refocus: boolean) => {
    setOpen(false);
    if (refocus) triggerRef.current?.focus();
  }, []);

  // Focus the first choice on open; close on a click or focus outside.
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLElement>("input:checked, input, button")?.focus();
    function onPointer(e: PointerEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) close(false);
    }
    document.addEventListener("pointerdown", onPointer);
    return () => document.removeEventListener("pointerdown", onPointer);
  }, [open, close]);

  if (variant === "panel") {
    return (
      <div role="group" aria-labelledby={titleId} className="rounded-lg border border-rule bg-surface p-4 md:p-6">
        <h2 id={titleId} className="mb-4 font-head text-lg font-bold text-foreground">
          {t("title")}
        </h2>
        <ReadingForm idBase={idBase} showPageLink={false} />
      </div>
    );
  }

  const isPopover = variant === "popover";

  return (
    <div
      ref={rootRef}
      className={isPopover ? "relative" : "w-full"}
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          // Handled here so an enclosing menu stays open: React listens on
          // the document, before the menu's own document listener.
          e.preventDefault();
          e.stopPropagation();
          e.nativeEvent.stopImmediatePropagation();
          close(true);
        }
      }}
      onBlur={(e) => {
        if (open && e.relatedTarget && !e.currentTarget.contains(e.relatedTarget as Node)) close(false);
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={isPopover ? t("open") : undefined}
        title={isPopover ? t("open") : undefined}
        className={
          isPopover
            ? "flex size-11 items-center justify-center rounded-md text-slate transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand"
            : "flex min-h-11 w-full items-center justify-between gap-2 rounded-md font-sans text-lg font-medium text-foreground transition-colors hover:text-brand"
        }
        style={{ touchAction: "manipulation" }}
      >
        {isPopover ? (
          <BookOpenText aria-hidden="true" className="size-5 2xl:size-6 4xl:size-7" />
        ) : (
          <>
            <span className="flex items-center gap-2">
              <BookOpenText aria-hidden="true" className="size-5" />
              {t("title")}
            </span>
            <ChevronDown aria-hidden="true" className={`size-5 transition-transform ${open ? "rotate-180" : ""}`} />
          </>
        )}
      </button>
      <div
        ref={panelRef}
        id={panelId}
        role={isPopover ? "dialog" : "region"}
        aria-labelledby={titleId}
        hidden={!open}
        className={
          isPopover
            ? "absolute end-0 top-full z-50 mt-2 max-h-[calc(100dvh-6rem)] w-[min(20rem,calc(100vw-2rem))] overflow-y-auto rounded-lg border border-rule bg-popover p-4 text-popover-foreground shadow-lg"
            : "mt-2"
        }
      >
        <h2 id={titleId} className={isPopover ? "mb-3 font-head text-base font-bold text-foreground" : "sr-only"}>
          {t("title")}
        </h2>
        {open && <ReadingForm idBase={idBase} showPageLink />}
      </div>
    </div>
  );
}
