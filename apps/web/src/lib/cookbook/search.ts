/**
 * Cookbook search: the tokenizer, term processing and MiniSearch options the
 * gallery and the ⌘K palette share, plus the helpers that rank exact
 * identifier hits and explain why a recipe matched.
 *
 * Isomorphic and browser-safe: no Node imports (only erasable type imports).
 */
import type { Options, SearchOptions } from "minisearch";
import type { Catalog, CatalogRecipe, Locale } from "./types.ts";

// ─── Fields and boosts ──────────────────────────────────────────────────────

/** Indexed fields and their boosts (spec §3.5). */
export const SEARCH_BOOSTS = {
  title: 5,
  questions: 3,
  aliases: 3,
  featureLabels: 2,
  configKeys: 2,
  apis: 2,
  directives: 2,
  warnings: 2,
  summary: 1.5,
  chapter: 1,
  genres: 1,
  headings: 1,
  gotchas: 1,
  otherTitle: 0.5,
  fonts: 0.5,
} as const;

export type SearchField = keyof typeof SEARCH_BOOSTS;
export const SEARCH_FIELDS = Object.keys(SEARCH_BOOSTS) as SearchField[];

/** The flat document MiniSearch indexes: one per recipe, every field a string. */
export type SearchDocument = { id: string } & Record<SearchField, string>;

/** Added to the score when a query word is exactly an API, config key,
 *  directive or warning kind (`renderToPdf`, `calloutOverflow`). */
export const EXACT_IDENTIFIER_BONUS = 10;

// ─── Tokenizer ──────────────────────────────────────────────────────────────

/** Anything but ASCII letters, digits and Latin letters with diacritics. */
const SEPARATOR = /[^0-9A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ]+/;

/** A run of Chinese characters (Han script: the CJK blocks and their
 *  extensions, 〇 and 々). */
const HAN_RUN = /\p{Script=Han}+/gu;
const HAN = /\p{Script=Han}/u;

/** Function and question words that break a Chinese run before it is cut
 *  into pairs, longest first. Chinese has no spaces, so without them
 *  "页眉的高度" would yield 眉的 and 的高, which an AND query would then
 *  require of every result. A word that merely contains one (目的, 以及) is
 *  cut the same way in the index and in the query, so the two still agree. */
const HAN_BREAKS = new RegExp(
  [
    "为什么", "怎么样", "如何", "怎么", "怎样", "什么", "为何", "哪些", "哪个", "是否", "能否", "可以",
    "一个", "我们", "我", "你", "的", "了", "吗", "呢", "吧", "啊", "和", "与", "及", "或", "把", "被",
  ].join("|"),
  "g",
);

/** True when `text` holds a Chinese character. */
export function hasHan(text: string): boolean {
  return HAN.test(text);
}

/** A Chinese run as search terms: every character and every overlapping
 *  pair, in order (页眉设置 → 页, 页眉, 眉, 眉设, 设, 设置, 置). Pairs find
 *  words; single characters keep one-character queries working and let a
 *  prefix query reach the pairs that start with them. */
function hanGrams(run: string): string[] {
  const out: string[] = [];
  for (const piece of run.split(HAN_BREAKS)) {
    const chars = [...piece];
    chars.forEach((char, i) => {
      out.push(char);
      if (i + 1 < chars.length) out.push(char + chars[i + 1]);
    });
  }
  return out;
}

/** The Chinese runs of a text, cut at `HAN_BREAKS` (怎么添加脚注 → 添加脚注). */
export function hanWords(text: string): string[] {
  return [...text.matchAll(HAN_RUN)].flatMap((m) => m[0].split(HAN_BREAKS)).filter(Boolean);
}

/** `advancedDesign` → advanced, Design · `renderToPDF` → render, To, PDF ·
 *  `PDFExport` → PDF, Export. */
function camelParts(word: string): string[] {
  return word
    .replace(/([a-z0-9ß-öø-ÿ])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .split(" ");
}

function latinTokens(text: string, out: string[]): void {
  for (const word of text.split(SEPARATOR)) {
    if (!word) continue;
    out.push(word);
    const parts = camelParts(word);
    if (parts.length > 1) out.push(...parts);
  }
}

/** Splits on whitespace and punctuation (so dotted paths such as
 *  `headings.levels[].advancedDesign` yield each segment) and also emits the
 *  camelCase parts of every word, next to the word itself. Chinese runs,
 *  which have no spaces to split on, become characters and pairs
 *  (`hanGrams`). The index and the query share it in every locale: an
 *  English page may quote Chinese too. */
export function tokenize(text: string): string[] {
  const out: string[] = [];
  let last = 0;
  for (const match of text.matchAll(HAN_RUN)) {
    const index = match.index ?? 0;
    latinTokens(text.slice(last, index), out);
    out.push(...hanGrams(match[0]));
    last = index + match[0].length;
  }
  latinTokens(text.slice(last), out);
  return out;
}

// ─── Term processing ────────────────────────────────────────────────────────

const EN_STOP_WORDS = [
  "a", "an", "and", "are", "as", "at", "be", "but", "by", "can", "do", "does", "for", "from",
  "how", "i", "if", "in", "into", "is", "it", "its", "me", "my", "of", "on", "or", "so", "than",
  "that", "the", "their", "then", "there", "these", "this", "to", "via", "what", "when",
  "where", "which", "why", "will", "with", "you", "your",
];

/** About forty words per locale that carry no meaning in a recipe query
 *  (compared after lowercasing and stripping diacritics). Chinese drops
 *  the characters and pairs `HAN_BREAKS` leaves behind that say nothing
 *  alone, and the English list for the Latin words a Chinese text quotes. */
export const STOP_WORDS: Record<Locale, ReadonlySet<string>> = {
  en: new Set(EN_STOP_WORDS),
  zh: new Set([
    ...EN_STOP_WORDS,
    "是", "在", "有", "这", "那", "这个", "那个", "个", "也", "都", "就", "还", "又", "要", "想", "能",
    "会", "请", "让", "用", "中", "上", "下", "时", "里", "并", "而", "但", "则", "即", "之", "其",
  ]),
  es: new Set([
    "a", "al", "como", "con", "cual", "cuando", "de", "del", "donde", "e", "el", "en", "entre",
    "es", "esa", "ese", "esta", "este", "esto", "hay", "la", "las", "le", "lo", "los", "mas",
    "me", "mi", "mis", "muy", "no", "o", "para", "pero", "por", "que", "se", "si", "sin", "sobre",
    "su", "sus", "tu", "un", "una", "uno", "unos", "y", "yo",
  ]),
};

/** Lowercase and without diacritics: "Cómo" → "como", "Título" → "titulo". */
export function foldText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Naive plural folding, the same for the index and the query, so it only
 *  has to be consistent, not correct. */
function singular(term: string, locale: Locale): string {
  if (term.length <= 3 || /\d/.test(term)) return term;
  if (locale === "es") {
    // colores → color, imagenes → imagen, luces → luz, notas → nota
    if (term.length > 4 && /ces$/.test(term)) return term.slice(0, -3) + "z";
    if (term.length > 4 && /[^aeiou]es$/.test(term)) return term.slice(0, -2);
    if (/[aeiou]s$/.test(term)) return term.slice(0, -1);
    return term;
  }
  // boxes → box, classes → class, entries → entry, captions → caption
  if (term.length > 4 && /(ss|x|z|ch|sh)es$/.test(term)) return term.slice(0, -2);
  if (term.length > 4 && /[^aeiou]ies$/.test(term)) return term.slice(0, -3) + "y";
  if (/[^siu]s$/.test(term)) return term.slice(0, -1);
  return term;
}

/** MiniSearch `processTerm` for a locale: lowercases, strips diacritics
 *  (NFD), drops stop words and one-letter terms (not one Chinese character,
 *  which is a word), folds naive plurals. */
export function processTerm(term: string, locale: Locale): string | null {
  const folded = foldText(term);
  if (folded.length < 2 && !/\d/.test(folded) && !HAN.test(folded)) return null;
  if (STOP_WORDS[locale].has(folded)) return null;
  return singular(folded, locale);
}

export function makeProcessTerm(locale: Locale): (term: string) => string | null {
  return (term) => processTerm(term, locale);
}

/** The search locale of a site locale segment, English for anything else. */
export function searchLocale(locale: string): Locale {
  return locale === "es" || locale === "zh" ? locale : "en";
}

// ─── MiniSearch ─────────────────────────────────────────────────────────────

/** Fuzzy matching only for terms of five or more characters. */
function fuzzy(term: string): number | false {
  return term.length >= 5 ? 0.2 : false;
}

/** Default search options: prefix, fuzzy for long terms, AND. The gallery
 *  retries with `{ combineWith: "OR" }` ("Showing partial matches"). */
export const SEARCH_OPTIONS: SearchOptions = {
  boost: { ...SEARCH_BOOSTS },
  prefix: true,
  fuzzy,
  combineWith: "AND",
};

/** MiniSearch options for a locale's catalogue. */
export function miniSearchOptions(locale: Locale): Options<SearchDocument> {
  return {
    idField: "id",
    fields: [...SEARCH_FIELDS],
    storeFields: ["id"],
    tokenize,
    processTerm: makeProcessTerm(locale),
    searchOptions: SEARCH_OPTIONS,
  };
}

export const MINISEARCH_OPTIONS: Record<Locale, Options<SearchDocument>> = {
  en: miniSearchOptions("en"),
  es: miniSearchOptions("es"),
  zh: miniSearchOptions("zh"),
};

type Facets = Catalog["facets"];

function titleOf<T extends { title: string }>(list: T[], match: (item: T) => boolean): string {
  return list.find(match)?.title ?? "";
}

/** The document MiniSearch indexes for a catalogue recipe. */
export function searchDocument(recipe: CatalogRecipe, facets: Facets): SearchDocument {
  const join = (values: readonly string[]) => values.filter(Boolean).join("\n");
  const warningLabels = recipe.warnings.map(
    (kind) => facets.warnings.find((w) => w.kind === kind)?.label ?? "",
  );
  return {
    id: recipe.slug,
    title: recipe.title,
    questions: join(recipe.search.questions),
    aliases: join(recipe.search.aliases),
    featureLabels: join(recipe.search.featureLabels),
    configKeys: join(recipe.search.configKeys),
    apis: join(recipe.search.apis),
    directives: join(recipe.search.directives),
    warnings: join([...recipe.warnings, ...warningLabels]),
    summary: recipe.summary,
    chapter: titleOf(facets.chapters, (c) => c.id === recipe.chapter),
    genres: join(recipe.genres.map((id) => titleOf(facets.genres, (g) => g.id === id))),
    headings: join(recipe.search.headings),
    gotchas: join(recipe.search.gotchas),
    otherTitle: recipe.search.otherTitle,
    fonts: join(recipe.search.fonts),
  };
}

// ─── Ranking helpers ────────────────────────────────────────────────────────

/** True for names worth an exact-hit bonus: camelCase or dotted/prefixed
 *  identifiers (`renderToPdf`, `headings.levels`, `:::toc`), not plain words. */
function isIdentifier(name: string): boolean {
  return /[A-Z]/.test(name.slice(1)) || /[.:_]/.test(name);
}

/** The words of a query as typed, trimmed of wrapping punctuation
 *  (`renderToPdf()` → `renderToPdf`); Chinese text around an identifier
 *  separates it too (`renderToPdf怎么用`). */
function queryWords(query: string): string[] {
  return query
    .split(/[\s,;，；、。？！：\p{Script=Han}]+/u)
    .map((word) => word.replace(/^[^\w:.]+|[^\w]+$/g, ""))
    .filter(Boolean);
}

/** `EXACT_IDENTIFIER_BONUS` when a query word equals (ignoring case) one of
 *  the recipe's identifiers: its APIs, config keys, directives and warning
 *  kinds. Added to MiniSearch's score by the caller. */
export function exactIdentifierBonus(query: string, identifiers: readonly string[]): number {
  const names = new Set(identifiers.filter(isIdentifier).map((name) => name.toLowerCase()));
  if (names.size === 0) return 0;
  return queryWords(query).some((word) => names.has(word.toLowerCase())) ? EXACT_IDENTIFIER_BONUS : 0;
}

/** The identifiers of a catalogue recipe, for `exactIdentifierBonus`. */
export function recipeIdentifiers(recipe: CatalogRecipe): string[] {
  return [...recipe.search.apis, ...recipe.search.configKeys, ...recipe.search.directives, ...recipe.warnings];
}

export interface MatchReason {
  field: SearchField;
  /** The processed query terms that hit this field. */
  terms: string[];
  /** The value that matched, when the recipe is given ("Question: How do I…"). */
  text?: string;
}

/** Values of a field as a list, for `matchReason`'s text. */
function fieldValues(recipe: CatalogRecipe, field: SearchField): string[] {
  switch (field) {
    case "summary":
      return [recipe.summary];
    case "otherTitle":
      return [recipe.search.otherTitle];
    case "warnings":
      return recipe.warnings;
    case "title":
    case "chapter":
    case "genres":
      return [];
    default:
      return recipe.search[field];
  }
}

/** Why a result matched, for the card: the best non-title field hit in a
 *  MiniSearch result's `match` (term → fields), by boost, then by number of
 *  terms. Null when only the title matched. */
export function matchReason(
  match: Record<string, string[]>,
  recipe?: CatalogRecipe,
  locale: Locale = "en",
): MatchReason | null {
  const byField = new Map<SearchField, string[]>();
  for (const [term, fields] of Object.entries(match)) {
    for (const field of fields) {
      if (field === "title" || !(field in SEARCH_BOOSTS)) continue;
      const key = field as SearchField;
      byField.set(key, [...(byField.get(key) ?? []), term]);
    }
  }
  let best: MatchReason | null = null;
  for (const [field, terms] of byField) {
    if (
      !best ||
      SEARCH_BOOSTS[field] > SEARCH_BOOSTS[best.field] ||
      (SEARCH_BOOSTS[field] === SEARCH_BOOSTS[best.field] && terms.length > best.terms.length)
    ) {
      best = { field, terms };
    }
  }
  if (best && recipe) {
    const terms = best.terms;
    const text = fieldValues(recipe, best.field).find((value) =>
      tokenize(value).some((token) => {
        const processed = processTerm(token, locale);
        return processed !== null && terms.some((term) => processed.startsWith(term) || term.startsWith(processed));
      }),
    );
    if (text) best.text = text;
  }
  return best;
}

// ─── ⌘K palette ─────────────────────────────────────────────────────────────

/** A palette row built from the catalogue. It carries every field of the
 *  docs index's `SearchSection` (lib/docs.ts) plus a kind and a locale-less
 *  href, so the palette can index both lists alike. */
export interface CookbookPaletteEntry {
  kind: "recipe" | "warning";
  id: string;
  slug: string;
  docTitle: string;
  anchor: string;
  sectionTitle: string;
  breadcrumb: string;
  level: number;
  body: string;
  /** Locale-less: "/cookbook/<slug>", "/cookbook/<slug>#warning-<kind>" or "/cookbook?warn=<kind>". */
  href: string;
}

/** One entry per recipe, plus one per explained warning (pointing at the
 *  recipe's Pitfalls anchor, or at the filtered gallery when several
 *  recipes explain it). `cookbook` is the section's name for breadcrumbs.
 *  Bodies are whole, so every feature label and config key is indexed; the
 *  palette cuts its own snippet around the match. */
export function cookbookPaletteEntries(catalog: Catalog, labels: { cookbook: string }): CookbookPaletteEntry[] {
  const entries: CookbookPaletteEntry[] = [];
  for (const recipe of catalog.recipes) {
    const chapter = titleOf(catalog.facets.chapters, (c) => c.id === recipe.chapter);
    const body = [
      recipe.question,
      recipe.summary,
      recipe.search.featureLabels.join(", "),
      recipe.search.aliases.join(", "),
      recipe.search.configKeys.join(", "),
    ]
      .filter(Boolean)
      .join(" · ");
    entries.push({
      kind: "recipe",
      id: `cookbook::${recipe.slug}`,
      slug: recipe.slug,
      docTitle: recipe.title,
      anchor: "",
      sectionTitle: recipe.title,
      breadcrumb: [labels.cookbook, chapter].filter(Boolean).join(" › "),
      level: 0,
      body,
      href: recipe.href,
    });
  }
  for (const { kind, label } of catalog.facets.warnings) {
    const explaining = catalog.recipes.filter((recipe) => recipe.warnings.includes(kind));
    if (explaining.length === 0) continue;
    const only = explaining.length === 1 ? explaining[0] : null;
    entries.push({
      kind: "warning",
      id: `cookbook::warning::${kind}`,
      slug: only?.slug ?? "",
      docTitle: kind,
      anchor: `warning-${kind}`,
      sectionTitle: kind,
      breadcrumb: [labels.cookbook, only?.title].filter(Boolean).join(" › "),
      level: 0,
      body: label,
      href: only ? `${only.href}#warning-${kind}` : `/cookbook?warn=${encodeURIComponent(kind)}`,
    });
  }
  return entries;
}
