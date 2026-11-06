"use client";

import { useMemo } from "react";
import { useTranslations } from "next-intl";
import type { PartColor } from "@/components/brand/partColors";
import { RecipeCard } from "@/components/cookbook/RecipeCard";
import { plateLabels } from "./labels";
import { fromWirePlate, type WirePlate } from "./plateWire";
import type { PlateFacets } from "./plates";

type ChapterRef = { title: string; color: PartColor };

/** A grid of plates, rendered on the server for the HTML and hydrated from
 *  compact props (`WirePlate` rows; links rebuilt under `hrefBase`).
 *  `chapter` is one chapter for every plate (a shelf) or one per plate
 *  (the editor's picks). */
export function PlateGrid({
  plates,
  hrefBase,
  chapter,
  facets,
  className,
  itemClassName,
  headingLevel,
  eager,
  size,
}: {
  plates: WirePlate[];
  hrefBase: string;
  chapter: ChapterRef | ChapterRef[];
  facets: PlateFacets;
  className: string;
  itemClassName?: string;
  headingLevel?: 2 | 3 | 4;
  eager?: boolean;
  size?: "md" | "lg";
}) {
  const t = useTranslations("Cookbook");
  const labels = useMemo(() => plateLabels(t, facets), [t, facets]);
  return (
    <ul className={className}>
      {plates.map((plate, i) => (
        <li key={plate.slug} className={itemClassName}>
          <RecipeCard
            recipe={fromWirePlate(plate, hrefBase)}
            chapter={Array.isArray(chapter) ? chapter[i] : chapter}
            labels={labels}
            headingLevel={headingLevel}
            eager={eager}
            size={size}
          />
        </li>
      ))}
    </ul>
  );
}
