import { cn } from "@/lib/utils";

/** The Postext mark: a chapter opener in miniature — a Postext-blue band
 *  with the initial set white in Fraunces and a gilt foot rule. */
export function LogoMark({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "relative inline-flex aspect-square shrink-0 items-center justify-center overflow-hidden rounded-[22%] bg-blue font-display font-[800] leading-none text-white",
        className,
      )}
      style={{ fontVariationSettings: '"SOFT" 30, "WONK" 0, "opsz" 72' }}
    >
      <span className="-mt-[0.08em] text-[0.72em]">P</span>
      <span className="absolute inset-x-0 bottom-0 h-[13%] bg-gold" />
    </span>
  );
}

/** Mark + wordmark. `size` scales both through the font size. */
export function Logo({
  className,
  markClassName,
}: {
  className?: string;
  markClassName?: string;
}) {
  return (
    <span className={cn("inline-flex items-center gap-[0.4em] text-2xl", className)}>
      <LogoMark className={cn("size-[1.35em] text-[1.35em]", markClassName)} />
      <span
        className="font-display font-[750] leading-none tracking-[-0.03em]"
        style={{ fontVariationSettings: '"SOFT" 30, "WONK" 0, "opsz" 72' }}
      >
        Postext
      </span>
    </span>
  );
}
