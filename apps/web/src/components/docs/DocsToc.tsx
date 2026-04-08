"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import type { TocItem } from "@/lib/docs";

interface DocsTocProps {
  items: TocItem[];
}

interface IndicatorPos {
  top: number;
  height: number;
}

export function DocsToc({ items }: DocsTocProps) {
  const [activeId, setActiveId] = useState<string>("");
  const navRef = useRef<HTMLElement>(null);
  const activeRef = useRef<HTMLAnchorElement | null>(null);
  const [indicator, setIndicator] = useState<IndicatorPos | null>(null);
  const t = useTranslations("Docs");

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
    if (activeRef.current) {
      activeRef.current.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    // Delay slightly so the DOM has settled after scroll
    const raf = requestAnimationFrame(updateIndicator);
    return () => cancelAnimationFrame(raf);
  }, [activeId, updateIndicator]);

  if (items.length === 0) return null;

  return (
    <aside className="sticky top-[var(--docs-nav-h)] hidden h-[calc(100vh-var(--docs-nav-h))] w-52 shrink-0 overflow-y-auto py-6 pl-4 xl:block 2xl:w-60">
      <h2 className="mb-3 font-display text-[0.65rem] font-semibold uppercase tracking-widest text-slate 2xl:text-xs">
        {t("onThisPage")}
      </h2>
      <nav ref={navRef} aria-label={t("onThisPage")} className="relative">
        {/* Animated indicator line */}
        <div
          className="absolute left-0 w-[2px] rounded-full bg-gilt transition-all duration-300 ease-in-out"
          style={
            indicator
              ? { top: indicator.top, height: indicator.height, opacity: 1 }
              : { top: 0, height: 0, opacity: 0 }
          }
        />
        {/* Subtle track line */}
        <div className="absolute left-0 top-0 h-full w-[2px] rounded-full bg-rule/30" />

        <ul className="space-y-0.5 pl-3">
          {items.map((item) => {
            const isActive = activeId === item.id;
            return (
              <li key={item.id}>
                <a
                  ref={isActive ? activeRef : undefined}
                  href={`#${item.id}`}
                  onClick={(e) => {
                    e.preventDefault();
                    const el = document.getElementById(item.id);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth" });
                      history.replaceState(null, "", `#${item.id}`);
                      setActiveId(item.id);
                    }
                  }}
                  className={`block py-0.5 text-[0.7rem] leading-snug transition-colors duration-200 2xl:text-xs ${
                    item.level === 1
                      ? "pl-0 font-semibold"
                      : item.level === 3
                        ? "pl-3"
                        : "pl-1.5"
                  } ${
                    isActive
                      ? "font-medium text-gilt"
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
