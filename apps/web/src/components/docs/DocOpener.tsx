import { Kicker } from "@/components/brand/Kicker";
import { PART_CLASSES, type PartColor } from "@/components/brand/partColors";
import { cn } from "@/lib/utils";

/** A docs chapter opener: the guide's band in the part colour, sized for
 *  the content column — kicker, rule, title, the page description as the
 *  lead, the chapter number large at the outer edge and an ink foot. */
export function DocOpener({
  id,
  number,
  kicker,
  title,
  lead,
  color,
}: {
  id?: string;
  number: number;
  kicker: string;
  title: string;
  lead?: string;
  color: PartColor;
}) {
  const c = PART_CLASSES[color];
  return (
    <header className={cn("relative isolate mb-4 overflow-hidden rounded-sm", c.band, c.onBand)}>
      <div className="relative px-6 pt-8 pb-7 md:px-8 md:pt-10 md:pb-8">
        <span
          aria-hidden="true"
          className="display pointer-events-none absolute -top-1 right-5 select-none text-[6rem] leading-[0.85] md:right-7 md:text-[8.5rem]"
        >
          {number}
        </span>
        <Kicker className="relative max-w-[75%] text-[0.62rem] opacity-95">{kicker}</Kicker>
        <span aria-hidden="true" className="relative mt-3 block h-[3px] w-10 bg-current" />
        <h1
          id={id}
          className="docs-heading display relative mt-4 max-w-[80%] text-[2rem] md:text-[2.6rem]"
          style={{ scrollMarginTop: "var(--docs-nav-h, 5rem)", textWrap: "balance" }}
        >
          {title}
        </h1>
        {lead && (
          <p className="relative mt-3 max-w-2xl font-body text-base leading-relaxed italic opacity-95">{lead}</p>
        )}
      </div>
      <div aria-hidden="true" className="h-1.5 bg-night" />
    </header>
  );
}
