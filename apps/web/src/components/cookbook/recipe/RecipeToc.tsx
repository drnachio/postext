"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/** "On this page": the write-up's sections, the one being read marked in
 *  the part colour. */
export function RecipeToc({
  sections,
  label,
  className,
}: {
  sections: { anchor: string; title: string }[];
  label: string;
  className?: string;
}) {
  const [active, setActive] = useState("");

  useEffect(() => {
    const headings = sections
      .map((s) => document.getElementById(s.anchor))
      .filter((el): el is HTMLElement => Boolean(el));
    const observer = new IntersectionObserver(
      (entries) => {
        const hit = entries
          .filter((e) => e.isIntersecting)
          .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)[0];
        if (hit) setActive(hit.target.id);
      },
      { rootMargin: "-80px 0px -65% 0px" },
    );
    headings.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections]);

  return (
    <nav aria-label={label} className={cn("cb-toc", className)}>
      <ol>
        {sections.map((s) => (
          <li key={s.anchor}>
            <a href={`#${s.anchor}`} aria-current={active === s.anchor ? "location" : undefined}>
              {s.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
