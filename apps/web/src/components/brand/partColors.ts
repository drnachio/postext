/** The guide's three part colours. Each landing chapter and docs section
 *  takes one, the way `:::part{palette="band=…"}` recolours a part. */
export type PartColor = "blue" | "gilt" | "vermilion";

/** Tailwind classes per part colour: the band fill, the accent for text on
 *  the page (theme-aware) and the stripe/rule fill. */
export const PART_CLASSES: Record<
  PartColor,
  { band: string; text: string; fill: string; soft: string; onBand: string }
> = {
  blue: {
    band: "bg-blue",
    text: "text-accent-blue",
    fill: "bg-blue",
    soft: "bg-blue/10",
    onBand: "text-white",
  },
  gilt: {
    // White on the guide's deep gilt is under 4.5:1; night on bright gilt
    // keeps small type on the band readable.
    band: "bg-gold",
    text: "text-gilt",
    fill: "bg-gold",
    soft: "bg-gold/12",
    onBand: "text-night",
  },
  vermilion: {
    band: "bg-red",
    text: "text-vermilion",
    fill: "bg-red",
    soft: "bg-red/10",
    onBand: "text-white",
  },
};
