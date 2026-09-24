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

/** Last `order` of each part (inclusive); anything later is "practice". */
const PART_ENDS = [2, 5];

export function docPart(order: number): DocPart {
  const i = PART_ENDS.findIndex((end) => order <= end);
  return PARTS[i === -1 ? PARTS.length - 1 : i]!;
}

/** The CSS class that sets `--part`, `--part-ink` and `--part-on`. */
export const partClass = (color: PartColor) => `part-${color}`;
