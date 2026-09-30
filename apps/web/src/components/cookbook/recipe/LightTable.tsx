"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ChevronLeft, ChevronRight, Maximize2 } from "lucide-react";
import type { PageImage } from "@/lib/cookbook/images";
import { cn } from "@/lib/utils";
import { Lightbox, rangeLabel, spreadPages, type Spread } from "./Lightbox";
import { folio, noteId, pageImgProps } from "./pages";
import type { PageFlipper, SpreadSrc } from "./pageFlip";

const PAGE_HASH = /^#page-(\d+)$/;
/** A press on a page that moves less than this (px) is a click: it turns
 *  the page (the recto forward, the verso back). */
const CLICK_SLOP = 6;

/** The captured pages on a night desk, as the book shows them: spreads by
 *  the recto rule (page 1 alone on the right), turned with ‹ ›, ←/→ or a
 *  swipe, or taken by hand and dragged over (the leaves turning in
 *  three.js, `pageFlip.ts`), a filmstrip of every spread, and a lightbox
 *  that `#page-N` links (and `<PageRef>`) open. A one-page document lies
 *  centred. Below `sm` the spreads give way to a scroll-snap strip of single
 *  pages. A right-bound book lies mirrored (`dir="rtl"` on the desk): page 1
 *  alone on the left, pairs [3 | 2], the strip and the filmstrip running
 *  leftward, ← and a leftward swipe to the next spread. */
export function LightTable({
  pages,
  spreads,
  binding = "left",
  initial,
  total,
  title,
  textHref,
  children,
}: {
  pages: PageImage[];
  spreads: Spread[];
  /** The edge the book is bound on. */
  binding?: "left" | "right";
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
  // The spread the DOM shows lags `current` while leaves turn over it.
  const [shown, setShown] = useState(initial);
  const shownRef = useRef(initial);
  const canvas = useRef<HTMLCanvasElement>(null);
  const spreadEl = useRef<HTMLDivElement>(null);
  const flipper = useRef<Promise<PageFlipper | null> | null>(null);
  // Once three.js is in, the pages are taken by hand (and enlarged with
  // the bar's button instead of a click).
  const hand = useRef<PageFlipper | null>(null);
  const [byHand, setByHand] = useState(false);
  // While a page is held: lets it go (a click when it barely moved).
  const holding = useRef<((click: boolean) => void) | null>(null);
  const press = useRef<{ x: number; y: number } | null>(null);
  const solo = pages.length === 1;
  // A slot with no image is a blank page (left out of the capture) when
  // its page lies inside the document, and no page at all otherwise (the
  // cover's left, the end's right).
  const isBlank = useCallback(
    (pair: Spread, slot: number) => {
      const other = pair[1 - slot];
      if (pair[slot] !== null || other === null) return false;
      const n = pages[other].n + (slot === 0 ? -1 : 1);
      return n >= 1 && n <= total;
    },
    [pages, total],
  );
  // The paper blank pages are drawn in: sampled from a text page's corner.
  const [paper, setPaper] = useState<[number, number, number] | null>(null);
  useEffect(() => {
    if (!spreads.some((pair) => isBlank(pair, 0) || isBlank(pair, 1))) return;
    const sample = pages.find((p) => p.role === "body") ?? pages[0];
    if (!sample) return;
    let live = true;
    const img = new Image();
    img.src = sample.src;
    void img
      .decode()
      .then(() => {
        const c = document.createElement("canvas");
        c.width = c.height = 4;
        c.getContext("2d")?.drawImage(img, 2, 2, 8, 8, 0, 0, 4, 4);
        const d = c.getContext("2d")?.getImageData(1, 1, 1, 1).data;
        if (live && d) setPaper([d[0], d[1], d[2]]);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [isBlank, pages, spreads]);
  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  // three.js loads when the reader reaches for the stage (or turns a page).
  const loadFlipper = useCallback(() => {
    if (!flipper.current) {
      const book = spreads.map((pair) => pair.map((i, slot) => (i !== null ? pages[i].src : isBlank(pair, slot) ? "" : null)) as SpreadSrc);
      flipper.current = import("./pageFlip").then(({ PageFlipper, canFlip }) =>
        canvas.current && spreadEl.current && canFlip()
          ? new PageFlipper(canvas.current, spreadEl.current, book, shownRef.current, setShown, setCurrent, binding)
          : null,
      ).then((f) => {
        hand.current = f;
        if (f) setByHand(true);
        return f;
      });
    }
    return flipper.current;
  }, [binding, isBlank, pages, spreads]);
  useEffect(() => {
    if (paper && byHand) hand.current?.setPaper(paper[0] / 255, paper[1] / 255, paper[2] / 255);
  }, [paper, byHand]);
  useEffect(
    () => () => {
      holding.current?.(false);
      void flipper.current?.then((f) => f?.dispose());
    },
    [],
  );

  // Turn the pages to the current spread: every leaf in between turns, and
  // turns asked for while leaves move join them in the air.
  useEffect(() => {
    if (current === shown && !flipper.current) return;
    let live = true;
    void loadFlipper().then((f) => {
      if (!live) return;
      if (f) f.go(current);
      else setShown(current);
    });
    return () => {
      live = false;
    };
  }, [current, shown, loadFlipper]);

  // Once the DOM shows the new spread, uncover it.
  useEffect(() => {
    if (!flipper.current) return;
    const imgs = [...(spreadEl.current?.querySelectorAll("img") ?? [])];
    let raf = 0;
    void Promise.all(imgs.map((img) => img.decode().catch(() => {}))).then(() => {
      raf = requestAnimationFrame(() => void flipper.current?.then((f) => f?.clear()));
    });
    return () => cancelAnimationFrame(raf);
  }, [shown]);

  const go = useCallback((delta: number) => setCurrent((c) => Math.min(spreads.length - 1, Math.max(0, c + delta))), [spreads.length]);
  // Right to left: ← turns to the next spread, and so does a swipe to the right.
  const rtl = binding === "right";
  const dir = rtl ? "rtl" : undefined;
  const forward = rtl ? "ArrowLeft" : "ArrowRight";
  const back = rtl ? "ArrowRight" : "ArrowLeft";
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
    // Centre the hero page; measured on screen, so a right-to-left strip
    // (negative scrollLeft) scrolls the same way.
    if (hero && el.offsetParent) {
      const box = el.getBoundingClientRect();
      const page = hero.getBoundingClientRect();
      el.scrollLeft += page.left + page.width / 2 - (box.left + box.width / 2);
    }
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
      if (spreads.length > 1) {
        void loadFlipper().then((f) => f?.preload([current - 1, current, current + 1]));
      }
    };
    if (typeof window.requestIdleCallback === "function") {
      const id = window.requestIdleCallback(warm, { timeout: 1000 });
      return () => window.cancelIdleCallback(id);
    }
    const id = window.setTimeout(warm, 200);
    return () => window.clearTimeout(id);
  }, [current, engaged, initial, pages, spreads, loadFlipper]);

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
  const onDesk = spreads[shown] ?? spread;
  const first = pages[spreadPages(onDesk)[0] ?? 0];
  const ar = ((solo ? 1 : 2) * first.w) / first.h;
  const isHero = shown === initial;

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
            if (event.key === back) go(-1);
            else if (event.key === forward) go(1);
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
            if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(event.clientY - start.y)) go((dx < 0) !== rtl ? 1 : -1);
          }}
          dir={dir}
        >
          <button type="button" className="cb-lt-nav" onClick={() => go(-1)} disabled={current === 0} aria-label={t("prevSpread")}>
            {rtl ? <ChevronRight aria-hidden="true" className="size-5" /> : <ChevronLeft aria-hidden="true" className="size-5" />}
          </button>
          <div
            ref={spreadEl}
            className={cn("cb-lt-spread", solo && "is-solo", byHand && "is-by-hand")}
            style={{ "--ar": ar, ...(paper ? { "--lt-paper": `rgb(${paper.join(" ")})` } : {}) } as React.CSSProperties}
            onPointerDown={(event) => {
              if (event.button !== 0 || !hand.current || holding.current) return;
              press.current = { x: event.clientX, y: event.clientY };
              if (!hand.current.grab(event)) return;
              event.preventDefault();
              event.stopPropagation();
              // The hold follows the pointer anywhere (over the header, out
              // of the window): the window hears it even if the capture is
              // lost, and a move with the button up means the release was
              // missed.
              const el = event.currentTarget;
              const id = event.pointerId;
              const start = press.current;
              const onMove = (e: PointerEvent) => {
                if (e.pointerId !== id) return;
                if ((e.buttons & 1) === 0) end(false);
                else hand.current?.drag(e);
              };
              const onUp = (e: PointerEvent) => {
                if (e.pointerId === id) end(Math.hypot(e.clientX - start.x, e.clientY - start.y) < CLICK_SLOP);
              };
              const onCancel = (e: PointerEvent) => {
                if (e.pointerId === id) end(false);
              };
              const onBlur = () => end(false);
              const end = (click: boolean) => {
                window.removeEventListener("pointermove", onMove);
                window.removeEventListener("pointerup", onUp);
                window.removeEventListener("pointercancel", onCancel);
                window.removeEventListener("blur", onBlur);
                el.classList.remove("is-held");
                holding.current = null;
                press.current = null;
                hand.current?.release(click);
              };
              window.addEventListener("pointermove", onMove);
              window.addEventListener("pointerup", onUp);
              window.addEventListener("pointercancel", onCancel);
              window.addEventListener("blur", onBlur);
              holding.current = end;
              el.classList.add("is-held");
              try {
                el.setPointerCapture(id);
              } catch {
                // The window listeners carry the hold without it.
              }
            }}
            onPointerUp={(event) => {
              const start = press.current;
              const click = !!start && Math.hypot(event.clientX - start.x, event.clientY - start.y) < CLICK_SLOP;
              if (holding.current) {
                // Handled here (stopping it keeps it from the stage's swipe,
                // and from the window listener, which React's stop reaches).
                holding.current(click);
                event.stopPropagation();
                return;
              }
              press.current = null;
              if (click && (event.target as Element).closest(".cb-lt-page:not(.is-empty)")) {
                // Pages already in the air: the click joins them (the
                // recto turns forward: the right page, or the left one of
                // a right-bound book).
                const rect = event.currentTarget.getBoundingClientRect();
                go((event.clientX > rect.left + rect.width / 2) !== rtl ? 1 : -1);
                event.stopPropagation();
              }
            }}
            onPointerCancel={() => {
              press.current = null;
            }}
          >
            {(solo ? [0] : onDesk).map((i, slot) => {
              const page = i === null ? null : pages[i];
              const side = solo ? undefined : slot === 0 ? "is-verso" : "is-recto";
              if (!page) {
                const blank = !solo && isBlank(onDesk, slot);
                return <div key={`empty-${slot}`} aria-hidden="true" className={cn("cb-lt-page", blank ? "is-blank" : "is-empty", side)} />;
              }
              return (
                <figure key={page.n} className={cn("cb-lt-page", side)}>
                  {byHand && !solo ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      {...pageImgProps(page)}
                      alt={page.alt}
                      decoding="async"
                      draggable={false}
                      loading={isHero ? "eager" : "lazy"}
                      fetchPriority={isHero ? "high" : "auto"}
                    />
                  ) : (
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
                  )}
                </figure>
              );
            })}
            {spreads.length > 1 && <canvas ref={canvas} aria-hidden="true" className="cb-lt-flip" />}
          </div>
          <button
            type="button"
            className="cb-lt-nav"
            onClick={() => go(1)}
            disabled={current === spreads.length - 1}
            aria-label={t("nextSpread")}
          >
            {rtl ? <ChevronLeft aria-hidden="true" className="size-5" /> : <ChevronRight aria-hidden="true" className="size-5" />}
          </button>
        </div>

        {/* Mobile: single pages in a scroll-snap strip. */}
        <div ref={strip} className="cb-lt-snap" aria-label={t("stripLabel")} role="group" dir={dir}>
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
        <div className="cb-lt-dots" aria-hidden="true" dir={dir}>
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
            dir={dir}
            onKeyDown={(event) => {
              const delta = event.key === forward ? 1 : event.key === back ? -1 : 0;
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
          binding={binding}
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
