/**
 * `catalog.json` on the wire. A recipe's search fields repeat registry text
 * (every label and alias of its features, its questions, its gotchas' titles)
 * and every prefix of its config keys; shipped as is, that is most of the
 * file. The wire form ships the registry text once per catalogue, keyed by
 * id, and the config keys as a trie; `unpackCatalog` rebuilds the `Catalog`
 * that search.ts indexes, field for field.
 *
 * Isomorphic and browser-safe: no Node imports (only erasable type imports).
 */
import type { Catalog, CatalogRecipe } from "./types.ts";

/** Bump when the wire form changes. */
export const CATALOG_WIRE = 2;

type Search = CatalogRecipe["search"];

export interface PackedRecipe extends Omit<CatalogRecipe, "search"> {
  search: Omit<Search, "questions" | "featureLabels" | "gotchas" | "configKeys"> & {
    /** Question ids (`answers`), in order. */
    questions: string[];
    /** Gotcha ids, in order. */
    gotchas: string[];
    /** A trie (`packKeys`), or the plain list when a key cannot be written in one. */
    configKeys: string | string[];
  };
}

export interface PackedCatalog extends Omit<Catalog, "recipes"> {
  wire: typeof CATALOG_WIRE;
  /** Registry text by id: a question's text and index phrasing, a gotcha's
   *  title. Feature labels and aliases travel in `facets.features`. */
  terms: { questions: Record<string, string[]>; gotchas: Record<string, string> };
  recipes: PackedRecipe[];
}

/** The ids a recipe's registry-derived search fields come from. */
export interface RecipeTermIds {
  answers: string[];
  gotchas: string[];
}

function unique(values: readonly string[]): string[] {
  return [...new Set(values.map((v) => v.trim()).filter(Boolean))];
}

// ─── Config keys as a trie ─────────────────────────────────────────────────

interface KeyNode {
  key: boolean;
  children: Map<string, KeyNode>;
}

/** `["a", "a.b", "a.c", "d[].e"]` → `a{b,c},!d[]{e}`: dotted segments nest
 *  in braces, and a `!` marks a segment that is only a prefix, not a key. */
export function packKeys(keys: readonly string[]): string | string[] {
  if (keys.some((k) => /[{},!]/.test(k) || k.split(".").some((seg) => seg === ""))) return [...keys];
  const root = new Map<string, KeyNode>();
  for (const k of keys) {
    let level = root;
    let node: KeyNode | undefined;
    for (const seg of k.split(".")) {
      node = level.get(seg);
      if (!node) {
        node = { key: false, children: new Map() };
        level.set(seg, node);
      }
      level = node.children;
    }
    if (node) node.key = true;
  }
  const write = (level: Map<string, KeyNode>): string =>
    [...level].map(([seg, n]) => `${n.key ? "" : "!"}${seg}${n.children.size ? `{${write(n.children)}}` : ""}`).join(",");
  return write(root);
}

/** The keys of a `packKeys` trie, depth first. */
export function unpackKeys(packed: string | readonly string[]): string[] {
  if (typeof packed !== "string") return [...packed];
  const out: string[] = [];
  let i = 0;
  const parse = (prefix: string) => {
    while (i < packed.length) {
      const key = packed[i] !== "!";
      if (!key) i++;
      let seg = "";
      while (i < packed.length && !"{},".includes(packed[i])) seg += packed[i++];
      const path = prefix ? `${prefix}.${seg}` : seg;
      if (key) out.push(path);
      if (packed[i] === "{") {
        i++;
        parse(path);
        i++; // the closing brace
      }
      if (packed[i] !== ",") return;
      i++;
    }
  };
  if (packed) parse("");
  return out;
}

// ─── Catalogue ──────────────────────────────────────────────────────────────

/** The wire form of a catalogue. `ids(slug)` gives the question and gotcha
 *  ids behind a recipe's fields; `terms` their text. */
export function packCatalog(
  catalog: Catalog,
  ids: (slug: string) => RecipeTermIds,
  terms: PackedCatalog["terms"],
): PackedCatalog {
  return {
    ...catalog,
    wire: CATALOG_WIRE,
    terms,
    recipes: catalog.recipes.map((recipe) => {
      const { answers, gotchas } = ids(recipe.slug);
      const { apis, directives, fonts, headings, aliases, otherTitle, configKeys } = recipe.search;
      const search = { aliases, apis, directives, fonts, headings, otherTitle };
      return { ...recipe, search: { ...search, questions: answers, gotchas, configKeys: packKeys(configKeys) } };
    }),
  };
}

/** The `Catalog` a wire form stands for (a plain catalogue passes through). */
export function unpackCatalog(json: Catalog | PackedCatalog): Catalog {
  if (!("wire" in json) || json.wire !== CATALOG_WIRE) return json as Catalog;
  const { terms } = json;
  const features = new Map(json.facets.features.map((f) => [f.id, [f.label, ...(f.aliases ?? [])]]));
  const catalog: Catalog = {
    locale: json.locale,
    testedWith: json.testedWith,
    facets: json.facets,
    ...(json.gaps ? { gaps: json.gaps } : {}),
    recipes: json.recipes.map((recipe): CatalogRecipe => {
      const { questions, gotchas, configKeys, ...search } = recipe.search;
      return {
        ...recipe,
        search: {
          ...search,
          questions: unique(questions.flatMap((id) => terms.questions[id] ?? [])),
          featureLabels: unique(recipe.features.flatMap((id) => features.get(id) ?? [])),
          configKeys: unpackKeys(configKeys),
          gotchas: unique(gotchas.map((id) => terms.gotchas[id] ?? "")),
        },
      };
    }),
  };
  return catalog;
}
