"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { TocItem } from "@/lib/docs";
import { scrollToAnchor, whenScrollSettles } from "@/lib/scrollToAnchor";

interface DocsTocProps {
  items: TocItem[];
}

interface IndicatorPos {
  top: number;
  height: number;
}

export function DocsToc({ items }: DocsTocProps) {
  const [activeId, setActiveId] = useState<string>("");
  const asideRef = useRef<HTMLElement>(null);
  const navRef = useRef<HTMLElement>(null);
  // Set while a click's scroll is under way: the clicked entry stays the
  // active one, whatever headings cross the page on the way (#654).
  const releaseClick = useRef<(() => void) | null>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const [indicator, setIndicator] = useState<IndicatorPos | null>(null);
  const t = useTranslations("Docs");
  const a11y = useTranslations("Accessibility");

  const updateIndicator = useCallback(() => {
    if (!activeRef.current || !navRef.current) {
      setIndicator(null);
      return;
    }
    const navRect = navRef.current.getBoundingClientRect();
    const elRect = activeRef.current.getBoundingClientRect();
    setIndicator({
      top: elRect.top - navRect.top,
      height: elRect.height,
    });
  }, []);

  useEffect(() => {
    if (items.length === 0) return;

    const observer = new IntersectionObserver(
      (entries) => {
        if (releaseClick.current) return;
        const visible = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);

        if (visible.length > 0) {
          setActiveId(visible[0].target.id);
        }
      },
      { rootMargin: "-80px 0px -60% 0px", threshold: 0 }
    );

    const elements = items
      .map((item) => document.getElementById(item.id))
      .filter(Boolean) as HTMLElement[];

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [items]);

  useEffect(() => {
    // Delay slightly so the DOM has settled after scroll
    const raf = requestAnimationFrame(updateIndicator);
    // The list keeps its active entry in view by scrolling its own box, and
    // only once the page is still: a scripted scroll while the page is on its
    // way to a heading would cancel that scroll (#654).
    const cancel = whenScrollSettles(() => {
      const aside = asideRef.current;
      const link = activeRef.current;
      if (!aside || !link) return;
      const box = aside.getBoundingClientRect();
      const row = link.getBoundingClientRect();
      const room = row.height;
      const delta =
        row.top < box.top + room ? row.top - box.top - room
        : row.bottom > box.bottom - room ? row.bottom - box.bottom + room
        : 0;
      if (delta === 0) return;
      const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      aside.scrollTo({ top: aside.scrollTop + delta, behavior: still ? "instant" : "smooth" });
    });
    return () => {
      cancelAnimationFrame(raf);
      cancel();
    };
  }, [activeId, updateIndicator]);

  useEffect(() => () => releaseClick.current?.(), []);

  if (items.length === 0) return null;

  return (
    <aside ref={asideRef} aria-label={a11y("docsOnThisPage")} className="sticky top-[var(--docs-nav-h)] hidden h-[calc(100vh-var(--docs-nav-h))] w-52 shrink-0 overflow-y-auto py-6 ps-4 xl:block 2xl:w-60">
      <h2 className="kicker mb-3 text-[0.6rem] text-slate">
        {t("onThisPage")}
      </h2>
      <nav ref={navRef} aria-label={t("onThisPage")} className="relative">
        {/* Animated indicator line */}
        <div
          className="absolute start-0 w-[3px] bg-(--part,var(--brand)) transition-all duration-300 ease-in-out"
          style={
            indicator
              ? { top: indicator.top, height: indicator.height, opacity: 1 }
              : { top: 0, height: 0, opacity: 0 }
          }
        />
        {/* Subtle track line */}
        <div className="absolute start-0 top-0 h-full w-[3px] bg-rule/60" />

        <ul className="ps-3">
          {items.map((item) => {
            const isActive = activeId === item.id;
            return (
              <li key={item.id}>
                <a
                  ref={isActive ? activeRef : undefined}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    // A click with a modifier opens the link the browser's way.
                    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                    const el = document.getElementById(item.id);
                    if (!el) return;
                    e.preventDefault();
                    releaseClick.current?.();
                    setActiveId(item.id);
                    history.replaceState(null, "", `#${item.id}`);
                    scrollToAnchor(el);
                    const cancel = whenScrollSettles(() => {
                      releaseClick.current = null;
                    });
                    releaseClick.current = () => {
                      cancel();
                      releaseClick.current = null;
                    };
                  }}
                  className={`flex min-h-10 items-center py-1 font-sans text-[0.72rem] leading-snug transition-colors duration-200 2xl:text-xs ${
                    item.level === 1
                      ? "ps-0 font-semibold"
                      : item.level === 3
                        ? "ps-3"
                        : "ps-1.5"
                  } ${
                    isActive
                      ? "font-semibold text-(--part-ink,var(--brand))"
                      : "text-slate hover:text-foreground"
                  }`}
                >
                  {item.text}
                </a>
              </li>
            );
          })}
        </ul>
      </nav>
    </aside>
  );
}
