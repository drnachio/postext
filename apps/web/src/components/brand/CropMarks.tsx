import { cn } from "@/lib/utils";

/** Printer's crop marks just outside the four corners of the parent (which
 *  must be positioned). Decorative. */
export function CropMarks({
  className,
  offset = 10,
  length = 18,
}: {
  className?: string;
  offset?: number;
  length?: number;
}) {
  const o = `${offset}px`;
  const l = `${length}px`;
  const h = "absolute h-px bg-current";
  const v = "absolute w-px bg-current";
  return (
    <span aria-hidden="true" className={cn("pointer-events-none absolute inset-0 text-gold/70", className)}>
      <span className={h} style={{ top: 0, left: `calc(-${o} - ${l})`, width: l }} />
      <span className={v} style={{ left: 0, top: `calc(-${o} - ${l})`, height: l }} />
      <span className={h} style={{ top: 0, right: `calc(-${o} - ${l})`, width: l }} />
      <span className={v} style={{ right: 0, top: `calc(-${o} - ${l})`, height: l }} />
      <span className={h} style={{ bottom: 0, left: `calc(-${o} - ${l})`, width: l }} />
      <span className={v} style={{ left: 0, bottom: `calc(-${o} - ${l})`, height: l }} />
      <span className={h} style={{ bottom: 0, right: `calc(-${o} - ${l})`, width: l }} />
      <span className={v} style={{ right: 0, bottom: `calc(-${o} - ${l})`, height: l }} />
    </span>
  );
}
