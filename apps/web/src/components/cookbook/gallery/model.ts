/**
 * The gallery's state and results, as pure functions: the URL grammar
 * (spec §3.5), search over the catalogue with MiniSearch, facet filtering
 * with disjunctive counts, sorting, gap hits and empty-state suggestions.
 * Browser-safe; the islands call these through `useGallery`.
 */
import MiniSearch from "minisearch";
import {
  MINISEARCH_OPTIONS,
  exactIdentifierBonus,
  hanWords,
  hasHan,
  matchReason,
  processTerm,
  recipeIdentifiers,
  searchDocument,
  tokenize,
  type MatchReason,
  type SearchDocument,
} from "@/lib/cookbook/search";
import type { Catalog, CatalogRecipe, Locale } from "@/lib/cookbook/types";

// ─── URL grammar ────────────────────────────────────────────────────────────

/** Multi-value keys: comma lists of registry ids. */
export const LIST_KEYS = ["genre", "level", "out", "feat", "warn", "col"] as const;
export type ListKey = (typeof LIST_KEYS)[number];
/** Every key of the grammar, in the order they are written. Any of them in
 *  the URL turns the book view into the results view. */
export const URL_KEYS = ["q", "cat", ...LIST_KEYS, "view", "sort"] as const;

export const SORTS = ["contents", "relevance", "new", "level", "az"] as const;
export type SortId = (typeof SORTS)[number];
export type ViewId = "plates" | "contents";

export interface GalleryState {
  q: string;
  cat: string | null;
  genre: string[];
  level: string[];
  out: string[];
  feat: string[];
  warn: string[];
  col: string[];
  view: ViewId;
  /** Null: the default (Relevance with a query, else Contents). */
  sort: SortId | null;
}

export const EMPTY_STATE: GalleryState = {
  q: "",
  cat: null,
  genre: [],
  level: [],
  out: [],
  feat: [],
  warn: [],
  col: [],
  view: "plates",
  sort: null,
};

function list(value: string | null): string[] {
  if (!value) return [];
  return [...new Set(value.split(",").map((v) => v.trim()).filter(Boolean))];
}

export function parseState(params: URLSearchParams): GalleryState {
  const sort = params.get("sort");
  return {
    q: params.get("q") ?? "",
    cat: params.get("cat")?.trim() || null,
    genre: list(params.get("genre")),
    level: list(params.get("level")),
    out: list(params.get("out")),
    feat: list(params.get("feat")),
    warn: list(params.get("warn")),
    col: list(params.get("col")),
    view: params.get("view") === "contents" ? "contents" : "plates",
    sort: (SORTS as readonly string[]).includes(sort ?? "") ? (sort as SortId) : null,
  };
}

/** True when the state differs from the unfiltered book view. */
export function isFiltered(state: GalleryState): boolean {
  return (
    state.q.trim() !== "" ||
    state.cat !== null ||
    LIST_KEYS.some((key) => state[key].length > 0) ||
    state.view !== "plates" ||
    state.sort !== null
  );
}

/** Number of facet selections (the chapter, list values; not the query). */
export function selectionCount(state: GalleryState): number {
  return (state.cat ? 1 : 0) + LIST_KEYS.reduce((n, key) => n + state[key].length, 0);
}

/** The ids each key accepts, in registry order (from the catalogue). */
export function vocabularies(catalog: Catalog): Record<"cat" | ListKey, string[]> {
  const { facets } = catalog;
  return {
    cat: facets.chapters.map((c) => c.id),
    genre: facets.genres.map((g) => g.id),
    level: facets.levels.map((l) => String(l.id)),
    out: facets.outputs.map((o) => o.id),
    feat: facets.features.map((f) => f.id),
    warn: facets.warnings.map((w) => w.kind),
    col: facets.collections.map((c) => c.id),
  };
}

/** Drops unknown ids and writes lists in registry order, so equal states
 *  share one URL. */
export function sanitizeState(state: GalleryState, catalog: Catalog): GalleryState {
  const vocab = vocabularies(catalog);
  const next: GalleryState = { ...state, cat: state.cat && vocab.cat.includes(state.cat) ? state.cat : null };
  for (const key of LIST_KEYS) {
    const chosen = new Set(state[key]);
    next[key] = vocab[key].filter((id) => chosen.has(id));
  }
  return next;
}

/** The query string of a state (without "?"), keys in grammar order; comma
 *  lists keep their commas readable. */
export function serializeState(state: GalleryState): string {
  const parts: string[] = [];
  const q = state.q.trim();
  if (q) parts.push(`q=${encodeURIComponent(q).replace(/%20/g, "+")}`);
  if (state.cat) parts.push(`cat=${encodeURIComponent(state.cat)}`);
  for (const key of LIST_KEYS) {
    if (state[key].length) parts.push(`${key}=${state[key].map(encodeURIComponent).join(",")}`);
  }
  if (state.view !== "plates") parts.push(`view=${state.view}`);
  if (state.sort) parts.push(`sort=${state.sort}`);
  return parts.join("&");
}

// ─── Search ─────────────────────────────────────────────────────────────────

export interface LoadedCatalog {
  catalog: Catalog;
  index: MiniSearch<SearchDocument>;
  /** slug → recipe */
  bySlug: Map<string, CatalogRecipe>;
  /** slug → position in contents order */
  order: Map<string, number>;
}

export function indexCatalog(catalog: Catalog, locale: Locale): LoadedCatalog {
  const index = new MiniSearch<SearchDocument>(MINISEARCH_OPTIONS[locale]);
  index.addAll(catalog.recipes.map((recipe) => searchDocument(recipe, catalog.facets)));
  return {
    catalog,
    index,
    bySlug: new Map(catalog.recipes.map((r) => [r.slug, r])),
    order: new Map(catalog.recipes.map((r, i) => [r.slug, i])),
  };
}

interface Hit {
  score: number;
  reason: MatchReason | null;
}

function runSearch(
  loaded: LoadedCatalog,
  q: string,
  locale: Locale,
): { hits: Map<string, Hit>; partial: boolean } | null {
  if (!q.trim()) return null;
  let found = loaded.index.search(q);
  let partial = false;
  if (found.length === 0) {
    found = loaded.index.search(q, { combineWith: "OR" });
    partial = found.length > 0;
  }
  const hits = new Map<string, Hit>();
  for (const result of found) {
    const recipe = loaded.bySlug.get(String(result.id));
    if (!recipe) continue;
    hits.set(recipe.slug, {
      score: result.score + exactIdentifierBonus(q, recipeIdentifiers(recipe)),
      reason: matchReason(result.match, recipe, locale),
    });
  }
  return { hits, partial };
}

// ─── Facets ─────────────────────────────────────────────────────────────────

type FacetKey = "cat" | ListKey;
export const FACET_KEYS: readonly FacetKey[] = ["cat", ...LIST_KEYS];

function values(recipe: CatalogRecipe, key: FacetKey): readonly string[] {
  switch (key) {
    case "cat":
      return [recipe.chapter];
    case "genre":
      return recipe.genres;
    case "level":
      return [String(recipe.level)];
    case "out":
      return recipe.outputs;
    case "feat":
      return recipe.features;
    case "warn":
      return recipe.warnings;
    case "col":
      return recipe.collections;
  }
}

function selected(state: GalleryState, key: FacetKey): readonly string[] {
  return key === "cat" ? (state.cat ? [state.cat] : []) : state[key];
}

/** Features combine with AND ("uses all of"); every other facet with OR. */
function passes(recipe: CatalogRecipe, key: FacetKey, chosen: readonly string[]): boolean {
  if (chosen.length === 0) return true;
  const own = values(recipe, key);
  return key === "feat" ? chosen.every((id) => own.includes(id)) : chosen.some((id) => own.includes(id));
}

function passesAll(recipe: CatalogRecipe, state: GalleryState, except?: FacetKey): boolean {
  return FACET_KEYS.every((key) => key === except || passes(recipe, key, selected(state, key)));
}

export type FacetCounts = Record<FacetKey, Record<string, number>>;

/** Disjunctive counts over the query's result set: each value's count
 *  assumes the other facets stay as they are. */
function facetCounts(pool: CatalogRecipe[], state: GalleryState): FacetCounts {
  const counts = {} as FacetCounts;
  for (const key of FACET_KEYS) {
    const bucket: Record<string, number> = {};
    const rest = pool.filter((recipe) => passesAll(recipe, state, key));
    const chosen = selected(state, key);
    for (const recipe of rest) {
      for (const id of values(recipe, key)) {
        // AND facet: the value counts recipes that also keep every other pick.
        if (key === "feat" && !chosen.every((c) => c === id || recipe.features.includes(c))) continue;
        bucket[id] = (bucket[id] ?? 0) + 1;
      }
    }
    counts[key] = bucket;
  }
  return counts;
}

// ─── Gaps ───────────────────────────────────────────────────────────────────

export type GapEntry = NonNullable<Catalog["gaps"]>[number];

/** Words of a text as the index sees them (folded, singular, no stop
 *  words), joined by single spaces. Chinese runs stay whole (cut only at
 *  function words) after the Latin words: they have no word boundaries to
 *  match on, so a gap term in Chinese is found as a substring. */
function normalWords(text: string, locale: Locale): string {
  return tokenize(text.replace(/\p{Script=Han}+/gu, " "))
    .map((word) => processTerm(word, locale))
    .filter((word): word is string => Boolean(word))
    .concat(hanWords(text))
    .join(" ");
}

/** A gap term's `normalWords` is long enough to be named on purpose. */
function namable(words: string): boolean {
  return words.length >= (hasHan(words) ? 2 : 3);
}

/** `query` (padded with spaces) names `words` whole. */
function names(query: string, words: string): boolean {
  return hasHan(words) ? query.includes(words) : query.includes(` ${words} `);
}

/** Gaps whose label or an alias the query names in full ("footnotes",
 *  "notas al pie", "how do I add footnotes", "怎么加脚注"), word for word. */
export function matchedGaps(q: string, gaps: readonly GapEntry[], locale: Locale): GapEntry[] {
  const query = ` ${normalWords(q, locale)} `;
  if (!namable(query.trim())) return [];
  return gaps.filter((gap) =>
    [gap.label, ...gap.aliases].some((term) => {
      const words = normalWords(term, locale);
      return namable(words) && names(query, words);
    }),
  );
}

/** What the query says besides the gaps it names ("" when it only names
 *  them), in `normalWords` form. */
function gapRemainder(q: string, gaps: readonly GapEntry[], locale: Locale): string {
  let rest = ` ${normalWords(q, locale)} `;
  for (const gap of gaps) {
    for (const term of [gap.label, ...gap.aliases]) {
      const words = normalWords(term, locale);
      if (namable(words)) rest = rest.split(hasHan(words) ? words : ` ${words} `).join(" ");
    }
  }
  return rest.trim();
}

// ─── The model ──────────────────────────────────────────────────────────────

export interface ResultItem {
  recipe: CatalogRecipe;
  reason: MatchReason | null;
  /** A workaround pinned first because the query names its gap. */
  pinned: boolean;
}

export interface Removal {
  key: FacetKey;
  id: string;
  /** Results with this one selection removed. */
  count: number;
}

export interface GalleryModel {
  /** The state with unknown ids dropped. */
  state: GalleryState;
  sort: SortId;
  results: ResultItem[];
  /** The AND search found nothing; these are OR matches. */
  partial: boolean;
  counts: FacetCounts;
  gaps: GapEntry[];
  /** When nothing matches the query at all: a looser search, top 3. */
  nearest: CatalogRecipe[];
  /** When the facets exclude everything: selections worth removing. */
  removals: Removal[];
}

function filterAndSort(
  loaded: LoadedCatalog,
  state: GalleryState,
  searched: ReturnType<typeof runSearch>,
  sort: SortId,
  locale: Locale,
): CatalogRecipe[] {
  const pool = searched ? [...searched.hits.keys()].map((slug) => loaded.bySlug.get(slug)!) : loaded.catalog.recipes;
  const kept = pool.filter((recipe) => passesAll(recipe, state));
  const order = (r: CatalogRecipe) => loaded.order.get(r.slug) ?? 0;
  const collator = new Intl.Collator(locale, { sensitivity: "base", numeric: true });
  const compare: Record<SortId, (a: CatalogRecipe, b: CatalogRecipe) => number> = {
    contents: (a, b) => order(a) - order(b),
    relevance: (a, b) =>
      (searched?.hits.get(b.slug)?.score ?? 0) - (searched?.hits.get(a.slug)?.score ?? 0) || order(a) - order(b),
    new: (a, b) => b.created.localeCompare(a.created) || b.number - a.number,
    level: (a, b) => a.level - b.level || order(a) - order(b),
    az: (a, b) => collator.compare(a.title, b.title),
  };
  return kept.sort(compare[sort]);
}

export function computeModel(loaded: LoadedCatalog, rawState: GalleryState, locale: Locale): GalleryModel {
  const state = sanitizeState(rawState, loaded.catalog);
  const q = state.q.trim();
  const sort: SortId = state.sort ?? (q ? "relevance" : "contents");
  const searched = runSearch(loaded, q, locale);
  const sorted = filterAndSort(loaded, state, searched, sort, locale);

  const gaps = q ? matchedGaps(q, loaded.catalog.gaps ?? [], locale) : [];
  // A query that only names a gap ("notas al pie") is answered by the gap
  // note and its workarounds: its words also mean other things ("pie" is a
  // caption too), and free-text hits on them would read as answers.
  const onlyGaps = gaps.length > 0 && gapRemainder(q, gaps, locale) === "";
  const pinnedSlugs = new Set(
    gaps
      .flatMap((gap) => gap.recipes)
      .filter((slug) => {
        const recipe = loaded.bySlug.get(slug);
        return recipe !== undefined && passesAll(recipe, state);
      }),
  );
  const pinned = loaded.catalog.recipes.filter((r) => pinnedSlugs.has(r.slug));
  const results: ResultItem[] = [
    ...pinned.map((recipe) => ({ recipe, reason: searched?.hits.get(recipe.slug)?.reason ?? null, pinned: true })),
    ...sorted
      .filter((recipe) => !onlyGaps && !pinnedSlugs.has(recipe.slug))
      .map((recipe) => ({ recipe, reason: searched?.hits.get(recipe.slug)?.reason ?? null, pinned: false })),
  ];

  const pool = onlyGaps
    ? loaded.catalog.recipes.filter((r) => gaps.some((gap) => gap.recipes.includes(r.slug)))
    : searched
      ? [...searched.hits.keys()].map((slug) => loaded.bySlug.get(slug)!)
      : loaded.catalog.recipes;
  const counts = facetCounts(pool, state);

  let nearest: CatalogRecipe[] = [];
  let removals: Removal[] = [];
  if (results.length === 0) {
    if (q && searched && searched.hits.size === 0) {
      nearest = loaded.index
        .search(q, { combineWith: "OR", fuzzy: 0.4, prefix: true })
        .slice(0, 3)
        .map((r) => loaded.bySlug.get(String(r.id)))
        .filter((r): r is CatalogRecipe => Boolean(r));
    } else {
      for (const key of FACET_KEYS) {
        for (const id of selected(state, key)) {
          const without: GalleryState =
            key === "cat" ? { ...state, cat: null } : { ...state, [key]: state[key].filter((v) => v !== id) };
          const count = pool.filter((recipe) => passesAll(recipe, without)).length;
          if (count > 0) removals.push({ key, id, count });
        }
      }
      removals = removals.sort((a, b) => b.count - a.count).slice(0, 4);
    }
  }

  return { state, sort, results, partial: Boolean(searched?.partial), counts, gaps, nearest, removals };
}
