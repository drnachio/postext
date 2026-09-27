"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import type { PageImage } from "@/lib/cookbook/images";
import { cn } from "@/lib/utils";
import { Lightbox, rangeLabel, spreadPages, type Spread } from "./Lightbox";
import { folio, noteId, pageImgProps } from "./pages";

const PAGE_HASH = /^#page-(\d+)$/;

/** The captured pages on a night desk, as the book shows them: spreads by
 *  the recto rule (page 1 alone on the right), turned with ‹ ›, ←/→ or a
 *  swipe, a filmstrip of every spread, and a lightbox that `#page-N` links
 *  (and `<PageRef>`) open. Below `sm` the spreads give way to a
 *  scroll-snap strip of single pages. */
export function LightTable({
  pages,
  spreads,
  initial,
  total,
  title,
  textHref,
  children,
}: {
  pages: PageImage[];
  spreads: Spread[];
  /** The spread shown first (the hero's). */
  initial: number;
  /** The document's page count (the published pages may be fewer). */
  total: number;
  title: string;
  /** The recipe's Markdown rendition. */
  textHref?: string;
  /** The tombstone. */
  children?: React.ReactNode;
}) {
  const t = useTranslations("CookbookRecipe");
  const [current, setCurrent] = useState(initial);
  const [open, setOpen] = useState<{ index: number; fromHash: boolean; single?: boolean } | null>(null);
  // The reader has turned a page or reached for the stage.
  const [engaged, setEngaged] = useState(false);
  const [visible, setVisible] = useState(0);
  const swipe = useRef<{ x: number; y: number } | null>(null);
  const strip = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);

  const go = useCallback((delta: number) => setCurrent((c) => Math.min(spreads.length - 1, Math.max(0, c + delta))), [spreads.length]);
  const spreadOf = useCallback((i: number) => Math.max(0, spreads.findIndex((s) => s.includes(i))), [spreads]);

  // `#page-N` deep links and links to them (`<PageRef>`, `<PageShot>`)
  // open the lightbox at that page.
  useEffect(() => {
    const indexOf = (hash: string) => {
      const m = PAGE_HASH.exec(hash);
      if (!m) return -1;
      return pages.findIndex((p) => p.n === Number(m[1]));
    };
    // A link to one page opens on that page alone.
    const fromLocation = () => {
      const i = indexOf(window.location.hash);
      if (i >= 0) setOpen({ index: i, fromHash: true, single: true });
    };
    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey) return;
      const link = (event.target as Element | null)?.closest?.("a[href^='#page-']");
      if (!link) return;
      const i = indexOf(link.getAttribute("href") ?? "");
      if (i < 0) return;
      event.preventDefault();
      setOpen({ index: i, fromHash: false, single: true });
    };
    // The URL is an external store: read it after hydration.
    const raf = requestAnimationFrame(fromLocation);
    window.addEventListener("hashchange", fromLocation);
    document.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("hashchange", fromLocation);
      document.removeEventListener("click", onClick);
    };
  }, [pages]);

  // The mobile strip starts at the hero page and tracks the page in view.
  useEffect(() => {
    const el = strip.current;
    if (!el) return;
    const items = [...el.querySelectorAll<HTMLElement>("[data-index]")];
    // A single page: the hero spread's first page that is not blank.
    const heroPages = spreadPages(spreads[initial]);
    const hero = items[heroPages.find((i) => pages[i]?.role !== "blank") ?? heroPages[0] ?? 0];
    if (hero && el.offsetParent) el.scrollLeft = hero.offsetLeft - (el.clientWidth - hero.clientWidth) / 2;
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) setVisible(Number((entry.target as HTMLElement).dataset.index));
        }
      },
      { root: el, threshold: 0.6 },
    );
    items.forEach((item) => observer.observe(item));
    return () => observer.disconnect();
  }, [initial, pages, spreads]);

  // Warm the neighbouring spreads so turning a page shows it at once: on
  // the spreads stage only (phones page a lazy strip), and only once the
  // reader turns a page or reaches for the stage, when the browser is idle.
  useEffect(() => {
    if (!engaged && current === initial) return;
    if (!window.matchMedia("(min-width: 640px)").matches) return;
    const warm = () => {
      for (const delta of [-1, 1]) {
        for (const i of spreadPages(spreads[current + delta])) {
          const img = new Image();
          img.decoding = "async";
          img.src = pages[i].src;
        }
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 1000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 200);
    return () => window.clearTimeout(id);
  }, [current, engaged, initial, pages, spreads]);

  if (pages.length === 0) {
    return (
      <section aria-label={t("lightTableLabel")} className="cb-lt on-night">
        <div className="cb-lt-inner">
          <p className="cb-lt-empty">{t("noCapture")}</p>
          {children}
        </div>
      </section>
    );
  }

  const spread = spreads[current] ?? [null, 0];
  const first = pages[spreadPages(spread)[0] ?? 0];
  const ar = (2 * first.w) / first.h;
  const isHero = current === initial;

  const selectTab = (i: number) => {
    setCurrent(i);
    tabs.current[i]?.focus();
  };

  return (
    <section aria-label={t("lightTableLabel")} className="cb-lt on-night">
      <div className="cb-lt-inner">
        <div
          id="cb-lt-stage"
          className="cb-lt-stage"
          role="group"
          tabIndex={0}
          aria-roledescription="carousel"
          aria-label={t("lightTableLabel")}
          onPointerEnter={() => setEngaged(true)}
          onFocus={() => setEngaged(true)}
          onKeyDown={(event) => {
            if (event.target !== event.currentTarget) return;
            if (event.key === "ArrowLeft") go(-1);
            else if (event.key === "ArrowRight") go(1);
            else return;
            event.preventDefault();
          }}
          onPointerDown={(event) => {
            if (event.pointerType !== "mouse") swipe.current = { x: event.clientX, y: event.clientY };
          }}
          onPointerUp={(event) => {
            const start = swipe.current;
            swipe.current = null;
            if (!start) return;
            const dx = event.clientX - start.x;
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(event.clientY - start.y)) go(dx < 0 ? 1 : -1);
          }}
        >
          <button type="button" className="cb-lt-nav" onClick={() => go(-1)} disabled={current === 0} aria-label={t("prevSpread")}>
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <div className="cb-lt-spread" style={{ "--ar": ar } as React.CSSProperties}>
            {spread.map((i, slot) => {
              const page = i === null ? null : pages[i];
              const side = slot === 0 ? "is-verso" : "is-recto";
              if (!page) return <div key={`empty-${slot}`} aria-hidden="true" className={cn("cb-lt-page is-empty", side)} />;
              return (
                <figure key={page.n} className={cn("cb-lt-page", side)}>
                  <button type="button" className="cb-lt-open" onClick={() => setOpen({ index: i!, fromHash: false })} title={t("openPage", { page: folio(page) })}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      {...pageImgProps(page)}
                      alt={page.alt}
                      decoding="async"
                      loading={isHero ? "eager" : "lazy"}
                      fetchPriority={isHero ? "high" : "auto"}
                    />
                  </button>
                </figure>
              );
            })}
          </div>
          <button
            type="button"
            className="cb-lt-nav"
            onClick={() => go(1)}
            disabled={current === spreads.length - 1}
            aria-label={t("nextSpread")}
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
        </div>

        {/* Mobile: single pages in a scroll-snap strip. */}
        <div ref={strip} className="cb-lt-snap" aria-label={t("stripLabel")} role="group">
          {pages.map((page, i) => (
            <button
              key={page.n}
              type="button"
              data-index={i}
              className="cb-lt-snap-page"
              onClick={() => setOpen({ index: i, fromHash: false })}
              title={t("openPage", { page: folio(page) })}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                {...pageImgProps(page)}
                alt={page.alt}
                decoding="async"
                loading={spreads[initial]?.includes(i) ? "eager" : "lazy"}
              />
            </button>
          ))}
        </div>
        <div className="cb-lt-dots" aria-hidden="true">
          {pages.map((page, i) => (
            <span key={page.n} data-active={i === visible ? "" : undefined} />
          ))}
        </div>

        <div className="cb-lt-bar">
          <p className="cb-lt-count" aria-live="polite">
            {rangeLabel(t, pages, spreadPages(spread), total)}
          </p>
          <div className="cb-lt-links">
            <button type="button" className="cb-lt-link" onClick={() => setOpen({ index: spreadPages(spread)[0] ?? 0, fromHash: false })}>
              <Maximize2 aria-hidden="true" className="size-3.5" />
              {t("enlarge")}
            </button>
            {textHref && (
              <a className="cb-lt-link" href={textHref}>
                {t("asText")} →
              </a>
            )}
          </div>
        </div>

        {spreads.length > 1 && (
          <div
            role="tablist"
            aria-label={t("spreads")}
            className="cb-lt-film"
            onKeyDown={(event) => {
              const delta = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
              if (event.key === "Home") selectTab(0);
              else if (event.key === "End") selectTab(spreads.length - 1);
              else if (delta) selectTab(Math.min(spreads.length - 1, Math.max(0, current + delta)));
              else return;
              event.preventDefault();
            }}
          >
            {spreads.map((pair, s) => {
              const numbers = spreadPages(pair).map((i) => folio(pages[i]));
              return (
                <button
                  key={s}
                  ref={(el) => {
                    tabs.current[s] = el;
                  }}
                  type="button"
                  role="tab"
                  aria-selected={s === current}
                  aria-controls="cb-lt-stage"
                  tabIndex={s === current ? 0 : -1}
                  aria-label={numbers.length > 1 ? t("spreadTab", { pages: numbers.join("–") }) : t("pageTab", { page: numbers[0] })}
                  className="cb-lt-film-tab"
                  onClick={() => setCurrent(s)}
                >
                  {pair.map((i, slot) =>
                    i === null ? (
                      <span key={slot} className="cb-lt-film-blank" style={{ "--page-ar": first.w / first.h } as React.CSSProperties} />
                    ) : (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img key={slot} src={pages[i].thumb} alt="" width={240} height={Math.round((240 * pages[i].h) / pages[i].w)} loading="lazy" decoding="async" />
                    ),
                  )}
                </button>
              );
            })}
          </div>
        )}

        {children}
      </div>

      {/* The write-up's notes on another language's pages: each image's
          description (Lightbox pageImgProps), in the page's language. */}
      {pages.some((page) => page.note) && (
        <div hidden>
          {pages.map((page) => page.note && <span key={page.n} id={noteId(page)}>{page.note}</span>)}
        </div>
      )}

      {open && (
        <Lightbox
          pages={pages}
          spreads={spreads}
          total={total}
          title={title}
          start={open.index}
          single={open.single}
          onClose={(index) => {
            setCurrent(spreadOf(index));
            if (open.fromHash && PAGE_HASH.test(window.location.hash)) {
              history.replaceState(history.state, "", window.location.pathname + window.location.search);
            }
            setOpen(null);
          }}
        />
      )}
    </section>
  );
}
