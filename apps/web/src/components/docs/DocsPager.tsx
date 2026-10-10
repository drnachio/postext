import Link from "next/link";

export interface PagerLink {
  href: string;
  /** The chapter's number in the contents. */
  number: number;
  title: string;
}

/** The previous and the next chapter in reading order, at the foot of a docs
 *  page. Server component; it takes the part colour from its ancestors. */
export function DocsPager({
  label,
  previousLabel,
  nextLabel,
  prev,
  next,
}: {
  /** Names the navigation landmark. */
  label: string;
  previousLabel: string;
  nextLabel: string;
  prev: PagerLink | null;
  next: PagerLink | null;
}) {
  if (!prev && !next) return null;
  const cell = (link: PagerLink | null, side: "prev" | "next") =>
    link ? (
      <Link
        href={link.href}
        rel={side}
        className={`group flex min-h-11 flex-col gap-1 rounded-sm border border-rule px-4 py-3 transition-colors hover:border-(--part) ${
          side === "next" ? "items-end text-end sm:col-start-2" : ""
        }`}
      >
        <span className="kicker flex items-center gap-1.5 text-[0.62rem] text-slate">
          {side === "prev" && <span aria-hidden="true" className="inline-block rtl:-scale-x-100">←</span>}
          {side === "prev" ? previousLabel : nextLabel}
          {side === "next" && <span aria-hidden="true" className="inline-block rtl:-scale-x-100">→</span>}
        </span>
        <span className="font-display text-lg leading-snug font-semibold transition-colors group-hover:text-(--part-ink)">
          <span className="text-(--part-ink) tabular-nums">{link.number}</span> {link.title}
        </span>
      </Link>
    ) : null;
  return (
    <nav aria-label={label} className="mt-14 grid gap-3 border-t border-rule pt-6 sm:grid-cols-2">
      {cell(prev, "prev")}
      {cell(next, "next")}
    </nav>
  );
}
