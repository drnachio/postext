"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, X } from "lucide-react";
import type { PageImage } from "@/lib/cookbook/images";
import { cn } from "@/lib/utils";
import { folio, pageImgProps } from "./pages";

export type Spread = [number | null, number | null];

/** The pages of a spread that exist, as indexes into `pages`. */
export function spreadPages(spread: Spread | undefined): number[] {
  const slots: (number | null)[] = spread ?? [];
  return slots.filter((i): i is number => i !== null);
}

/** "pp. 2–3 of 6" or "p. 1 of 6"; when the pages print other numbers (a
 *  chapter continued at folio 41), the folios lead: "pp. 42–43 · 2–3 of 4". */
export function rangeLabel(
  t: ReturnType<typeof useTranslations<"CookbookRecipe">>,
  pages: PageImage[],
  indexes: number[],
  total: number,
): string {
  const shown = indexes.map((i) => pages[i]).filter((p): p is PageImage => p !== undefined);
  if (shown.length === 0) return "";
  const first = shown[0];
  const last = shown[shown.length - 1];
  if (shown.every((p) => folio(p) === String(p.n))) {
    return shown.length === 1 ? t("pageOf", { page: first.n, total }) : t("pagesOf", { from: first.n, to: last.n, total });
  }
  return shown.length === 1
    ? t("folioOf", { folio: folio(first), page: first.n, total })
    : t("foliosOf", { from: folio(first), to: folio(last), first: first.n, last: last.n, total });
}

/** The light table's enlarged view: a native modal `<dialog>` showing a
 *  spread or a single page as large as the screen allows. ←/→ turn,
 *  Home/End jump, Esc closes (natively) and focus goes back to the control
 *  that opened it. */
export function Lightbox({
  pages,
  spreads,
  total,
  title,
  start,
  single = false,
  onClose,
}: {
  pages: PageImage[];
  spreads: Spread[];
  total: number;
  title: string;
  /** Index into `pages` to open at. The lightbox is mounted to open it. */
  start: number;
  /** A link to one page opens on that page alone. */
  single?: boolean;
  /** Called with the page index the reader closed on. */
  onClose: (index: number) => void;
}) {
  const t = useTranslations("CookbookRecipe");
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const [index, setIndex] = useState(start);
  // Narrow screens read one page at a time.
  const [mode, setMode] = useState<"spread" | "single">(() =>
    !single && window.matchMedia("(min-width: 900px)").matches ? "spread" : "single",
  );
  const indexRef = useRef(index);

  useEffect(() => {
    indexRef.current = index;
  }, [index]);

  useEffect(() => {
    const dialog = ref.current;
    // Focus goes back to the control that opened the lightbox.
    const returnFocus = document.activeElement as HTMLElement | null;
    // The modal does not stop the page behind it from scrolling (a wheel or
    // a pan over the stage would): lock it while open, without the layout
    // shifting as the scrollbar goes.
    const root = document.documentElement;
    const locked = { overflow: root.style.overflow, gutter: root.style.scrollbarGutter };
    root.style.scrollbarGutter = "stable";
    root.style.overflow = "hidden";
    if (dialog && !dialog.open) dialog.showModal();
    // React does not render `autofocus`, so the dialog would focus its
    // first control (a view-mode radio) instead of Close.
    closeRef.current?.focus();
    return () => {
      root.style.overflow = locked.overflow;
      root.style.scrollbarGutter = locked.gutter;
      if (returnFocus && document.contains(returnFocus)) returnFocus.focus({ preventScroll: true });
    };
  }, []);

  const spreadOf = useCallback((i: number) => Math.max(0, spreads.findIndex((s) => s.includes(i))), [spreads]);

  const step = useCallback(
    (delta: number) => {
      if (mode === "single") {
        setIndex((i) => Math.min(pages.length - 1, Math.max(0, i + delta)));
        return;
      }
      setIndex((i) => {
        const next = spreadPages(spreads[spreadOf(i) + delta]);
        return next.length ? next[0] : i;
      });
    },
    [mode, pages.length, spreads, spreadOf],
  );

  const shown = mode === "single" ? [index] : spreadPages(spreads[spreadOf(index)]);
  const slots: (number | null)[] = mode === "single" ? [index] : (spreads[spreadOf(index)] ?? [index]);
  const atStart = mode === "single" ? index <= 0 : spreadOf(index) <= 0;
  const atEnd = mode === "single" ? index >= pages.length - 1 : spreadOf(index) >= spreads.length - 1;
  const first = pages[shown[0] ?? 0];
  const ar = first ? ((mode === "single" ? 1 : 2) * first.w) / first.h : 1;

  const close = () => ref.current?.close();

  return (
    <dialog
      ref={ref}
      className="cb-lb on-night"
      aria-label={t("lightboxLabel", { title })}
      onClose={() => onClose(indexRef.current)}
      onClick={(event) => {
        // A click on the backdrop (the dialog box itself) closes.
        if (event.target === event.currentTarget) close();
      }}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft") step(-1);
        else if (event.key === "ArrowRight") step(1);
        else if (event.key === "Home") setIndex(0);
        else if (event.key === "End") setIndex(mode === "single" ? pages.length - 1 : spreadPages(spreads[spreads.length - 1])[0] ?? 0);
        else return;
        event.preventDefault();
      }}
    >
      <div className="cb-lb-bar">
        <p className="cb-lb-count" aria-live="polite">
          {rangeLabel(t, pages, shown, total)}
        </p>
        <div className="cb-lb-tools">
          <div role="radiogroup" aria-label={t("viewMode")} className="cb-lb-modes">
            {(["spread", "single"] as const).map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={mode === m}
                className="cb-lb-mode"
                onClick={() => setMode(m)}
              >
                {m === "spread" ? t("modeSpread") : t("modeSingle")}
              </button>
            ))}
          </div>
          <button ref={closeRef} type="button" className="cb-lb-close" onClick={close} aria-label={t("close")}>
            <X aria-hidden="true" className="size-5" />
          </button>
        </div>
      </div>

      <div
        className="cb-lb-stage"
        onClick={(event) => event.target === event.currentTarget && close()}
        onPointerDown={(event) => {
          if (event.pointerType !== "mouse") swipe.current = { x: event.clientX, y: event.clientY };
        }}
        onPointerUp={(event) => {
          const from = swipe.current;
          swipe.current = null;
          if (!from) return;
          const dx = event.clientX - from.x;
          if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(event.clientY - from.y)) step(dx < 0 ? 1 : -1);
        }}
      >
        <button type="button" className="cb-lt-nav" onClick={() => step(-1)} disabled={atStart} aria-label={t("prevSpread")}>
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <div className={cn("cb-lb-pages", mode === "single" && "is-single")} style={{ "--ar": ar } as React.CSSProperties}>
          {slots.map((i, slot) => {
            const page = i === null ? null : pages[i];
            const side = mode === "single" ? "" : slot === 0 ? "is-verso" : "is-recto";
            return page ? (
              <figure key={`${page.n}-${slot}`} className={cn("cb-lt-page", side)}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img {...pageImgProps(page)} alt={page.alt} decoding="async" />
              </figure>
            ) : (
              <div key={`empty-${slot}`} aria-hidden="true" className="cb-lt-page is-empty" />
            );
          })}
        </div>
        <button type="button" className="cb-lt-nav" onClick={() => step(1)} disabled={atEnd} aria-label={t("nextSpread")}>
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>
      <p className="cb-lb-hint" aria-hidden="true">
        {t("lightboxHint")}
      </p>
    </dialog>
  );
}
