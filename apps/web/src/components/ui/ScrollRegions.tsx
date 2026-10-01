"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";

/** Containers in the page content that may scroll sideways or down: code
 *  blocks, wide tables and figures (MDX and the Cookbook render them on the
 *  server, so they are found here rather than given props). A component can
 *  opt in with `data-scroll-region`, and name it with `data-scroll-label`
 *  (a file name, a caption). */
const SELECTOR = "main pre, main .scroll-wrapper, main [data-scroll-region]";
const MARK = "data-scroll-region-auto";

type Kind = "code" | "table" | "figure";

/** Makes every scrolling content container reachable by keyboard (WCAG
 *  2.1.1): while it overflows it is a focusable region with a name of its
 *  own (regions are landmarks, so no two share one); when it fits again it
 *  goes back to being plain content. */
export function ScrollRegions() {
  const t = useTranslations("Accessibility");
  const text = {
    code: t("scrollableCode"),
    table: t("scrollableTable"),
    figure: t("scrollableFigure"),
    codeN: t("scrollableCodeN", { n: "{n}" }),
    tableN: t("scrollableTableN", { n: "{n}" }),
    figureN: t("scrollableFigureN", { n: "{n}" }),
  };
  const key = JSON.stringify(text);

  useEffect(() => {
    const labels = JSON.parse(key) as typeof text;
    const kindOf = (el: HTMLElement): Kind =>
      el.matches("pre") || el.querySelector(":scope > code, :scope > pre")
        ? "code"
        : el.querySelector("table")
          ? "table"
          : "figure";
    const caption = (el: HTMLElement) =>
      (
        el.dataset.scrollLabel ??
        el.closest("figure")?.querySelector(".cb-excerpt-file, :scope > figcaption:not(:has(button, a))")?.textContent ??
        ""
      )
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 80);

    const scrolls = (el: HTMLElement) => {
      const cs = getComputedStyle(el);
      const x = /auto|scroll/.test(cs.overflowX) && el.scrollWidth > el.clientWidth + 1;
      const y = /auto|scroll/.test(cs.overflowY) && el.scrollHeight > el.clientHeight + 1;
      return x || y;
    };

    /** Names every region this component manages: the kind, plus the
     *  caption when there is one; kinds without captions are numbered
     *  when more than one is on the page. */
    const relabel = () => {
      const regions = [...document.querySelectorAll<HTMLElement>(`[${MARK}]`)];
      const named = new Map<string, HTMLElement[]>();
      for (const el of regions) {
        const kind = el.getAttribute(MARK) as Kind;
        const cap = caption(el);
        const name = cap ? `${labels[kind]}: ${cap}` : labels[kind];
        named.set(name, [...(named.get(name) ?? []), el]);
      }
      for (const [name, els] of named) {
        els.forEach((el, i) => {
          if (el.hasAttribute("data-scroll-own-label")) return;
          const kind = el.getAttribute(MARK) as Kind;
          let label = name;
          if (els.length > 1) {
            const numbered = labels[`${kind}N`].replace("{n}", String(i + 1));
            const cap = caption(el);
            label = cap ? `${numbered}: ${cap}` : numbered;
          }
          if (el.getAttribute("aria-label") !== label) el.setAttribute("aria-label", label);
        });
      }
    };

    const update = (el: HTMLElement) => {
      const own = el.hasAttribute(MARK);
      // Leave alone what a component already made focusable itself.
      if (!own && el.hasAttribute("tabindex")) return false;
      if (scrolls(el)) {
        if (own) return false;
        el.setAttribute(MARK, kindOf(el));
        el.tabIndex = 0;
        el.setAttribute("role", "region");
        if (el.hasAttribute("aria-label") || el.hasAttribute("aria-labelledby")) el.setAttribute("data-scroll-own-label", "");
        return true;
      }
      if (!own) return false;
      el.removeAttribute(MARK);
      el.removeAttribute("tabindex");
      el.removeAttribute("role");
      if (el.hasAttribute("data-scroll-own-label")) el.removeAttribute("data-scroll-own-label");
      else el.removeAttribute("aria-label");
      return true;
    };

    const resize = new ResizeObserver((entries) => {
      let changed = false;
      for (const entry of entries) changed = update(entry.target as HTMLElement) || changed;
      if (changed) relabel();
    });
    const watched = new WeakSet<Element>();
    const scan = () => {
      let changed = false;
      for (const el of document.querySelectorAll<HTMLElement>(SELECTOR)) {
        if (watched.has(el)) continue;
        watched.add(el);
        resize.observe(el);
        changed = update(el) || changed;
      }
      if (changed) relabel();
    };
    scan();
    let queued = 0;
    const mutations = new MutationObserver(() => {
      if (queued) return;
      queued = requestAnimationFrame(() => {
        queued = 0;
        scan();
      });
    });
    mutations.observe(document.body, { childList: true, subtree: true });
    return () => {
      resize.disconnect();
      mutations.disconnect();
      if (queued) cancelAnimationFrame(queued);
    };
  }, [key]);

  return null;
}
