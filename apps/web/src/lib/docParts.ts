import type { PartColor } from "@/components/brand/partColors";

/** The docs are grouped like the guide's three parts, by `order`:
 *  Foundations (blue), The craft (gilt), In practice (vermilion). */
export interface DocPart {
  key: "foundations" | "craft" | "practice";
  number: "I" | "II" | "III";
  color: PartColor;
}

const PARTS: DocPart[] = [
  { key: "foundations", number: "I", color: "blue" },
  { key: "craft", number: "II", color: "gilt" },
  { key: "practice", number: "III", color: "vermilion" },
];

/** Last `order` of each part (inclusive); anything later is "practice".
 *  Part I ends with the Architecture chapter and its page (3); Part II runs
 *  from Configuration (4) and the twenty pages of its reference to
 *  Comics (35), Music notation (36), Exercises (37), Composed pages (38),
 *  its page of figures (39) and Special inks and die-cuts (40). */
const PART_ENDS = [3, 40];

export function docPart(order: number): DocPart {
  const i = PART_ENDS.findIndex((end) => order <= end);
  return PARTS[i === -1 ? PARTS.length - 1 : i]!;
}

/** The CSS class that sets `--part`, `--part-ink` and `--part-on`. */
export const partClass = (color: PartColor) => `part-${color}`;
