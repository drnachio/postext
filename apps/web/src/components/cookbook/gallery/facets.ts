import type { Catalog } from "@/lib/cookbook/types";
import type { FacetOption } from "./FacetControls";
import type { Translate } from "./labels";
import type { GalleryModel, ListKey } from "./model";

type Facets = Catalog["facets"];

/** The options of a list facet, in registry order, with the model's
 *  disjunctive counts. Features sort active first, then by count. */
export function facetOptions(key: ListKey, facets: Facets, model: GalleryModel): FacetOption[] {
  const counts = model.counts[key];
  const chosen = new Set(model.state[key]);
  const option = (id: string, label: string, hint?: string): FacetOption => ({
    id,
    label,
    hint,
    count: counts[id] ?? 0,
    active: chosen.has(id),
  });
  switch (key) {
    case "genre":
      return facets.genres.map((g) => option(g.id, g.title));
    case "level":
      return facets.levels.map((l) => option(String(l.id), l.title));
    case "out":
      return facets.outputs.map((o) => option(o.id, o.title));
    case "feat":
      return facets.features
        .map((f) => option(f.id, f.label))
        .sort((a, b) => Number(b.active) - Number(a.active) || b.count - a.count || a.label.localeCompare(b.label));
    case "warn":
      return facets.warnings.map((w) => option(w.kind, w.label, w.kind));
    case "col":
      return facets.collections.map((c) => option(c.id, c.title));
  }
}

export interface ActiveChip {
  key: "cat" | ListKey;
  id: string;
  text: string;
}

const CHIP_KEY: Record<"cat" | ListKey, string> = {
  cat: "chipChapter",
  genre: "chipGenre",
  level: "chipLevel",
  out: "chipOutput",
  feat: "chipFeature",
  warn: "chipWarning",
  col: "chipCollection",
};

/** The label of one selection, from the catalogue's vocabularies. */
export function selectionLabel(key: "cat" | ListKey, id: string, facets: Facets): string {
  switch (key) {
    case "cat":
      return facets.chapters.find((c) => c.id === id)?.title ?? id;
    case "genre":
      return facets.genres.find((g) => g.id === id)?.title ?? id;
    case "level":
      return facets.levels.find((l) => String(l.id) === id)?.title ?? id;
    case "out":
      return facets.outputs.find((o) => o.id === id)?.title ?? id;
    case "feat":
      return facets.features.find((f) => f.id === id)?.label ?? id;
    case "warn":
      return id;
    case "col":
      return facets.collections.find((c) => c.id === id)?.title ?? id;
  }
}

/** "Genre: Textbook", "Uses: Side captions"… for every selection. */
export function activeChips(model: GalleryModel, facets: Facets, t: Translate): ActiveChip[] {
  const { state } = model;
  const chips: ActiveChip[] = [];
  const push = (key: "cat" | ListKey, id: string) =>
    chips.push({ key, id, text: t(CHIP_KEY[key], { label: selectionLabel(key, id, facets) }) });
  if (state.cat) push("cat", state.cat);
  for (const key of ["genre", "level", "out", "feat", "warn", "col"] as const) {
    for (const id of state[key]) push(key, id);
  }
  return chips;
}
