import { cn } from "@/lib/utils";
import { Kicker } from "./Kicker";
import { PART_CLASSES, type PartColor } from "./partColors";

/** A chapter opener from the guide, as a full-bleed web band: the kicker,
 *  a short rule, the title in display type and the lead in italic, with the
 *  chapter number set huge at the outer edge and an ink foot rule. */
export function ChapterOpener({
  id,
  color,
  number,
  kicker,
  title,
  lead,
  className,
}: {
  id?: string;
  color: PartColor;
  number: string;
  kicker: React.ReactNode;
  title: React.ReactNode;
  lead?: React.ReactNode;
  className?: string;
}) {
  const c = PART_CLASSES[color];
  return (
    <header className={cn("relative isolate overflow-hidden", c.band, c.onBand, className)}>
      <div
        aria-hidden="true"
        className="band-grid pointer-events-none absolute inset-0 -z-10"
      />
      <div className="relative mx-auto max-w-6xl px-6 pt-20 pb-16 md:pt-28 md:pb-20 2xl:max-w-7xl 2xl:px-8 4xl:max-w-[96rem] 4xl:px-12">
        <span
          aria-hidden="true"
          className="chapter-numeral display pointer-events-none absolute -top-2 right-4 select-none text-[11rem] leading-[0.8] md:right-8 md:text-[17rem] 2xl:text-[20rem]"
        >
          {number}
        </span>
        <Kicker className="relative max-w-[70%] opacity-95">{kicker}</Kicker>
        <span aria-hidden="true" className="relative mt-4 block h-[3px] w-14 bg-current" />
        <h2
          id={id}
          className="display relative mt-7 max-w-[17ch] text-[2.6rem] md:text-[4.2rem] 2xl:text-[4.8rem]"
          style={{ textWrap: "balance" }}
        >
          {title}
        </h2>
        {lead && (
          <p className="relative mt-7 max-w-2xl font-body text-lg leading-relaxed italic opacity-95 md:text-xl">
            {lead}
          </p>
        )}
      </div>
      <div aria-hidden="true" className="h-2 bg-night" />
    </header>
  );
}
