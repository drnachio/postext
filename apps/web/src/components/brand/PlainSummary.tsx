import { cn } from "@/lib/utils";

/** "In short": the page again in plain words, for readers who do not know
 *  the jargon (WCAG 3.1.5 Reading Level). A labelled region with a small
 *  tracked heading over a short paragraph, ruled in the page's accent. */
export function PlainSummary({
  id,
  heading,
  children,
  className,
  ink = "text-brand",
  rule = "border-l-brand",
}: {
  /** The heading's id, which labels the region. */
  id: string;
  heading: string;
  children: React.ReactNode;
  className?: string;
  /** Text colour class of the heading (a ≥7:1 token). */
  ink?: string;
  /** Colour class of the left rule. */
  rule?: string;
}) {
  return (
    <section
      aria-labelledby={id}
      className={cn("rounded-sm border border-l-4 border-rule bg-surface px-5 py-4", rule, className)}
    >
      <h2 id={id} className={cn("kicker text-[0.75rem]", ink)}>
        {heading}
      </h2>
      <p className="mt-2 max-w-[70ch] font-body text-base leading-relaxed text-foreground">{children}</p>
    </section>
  );
}
