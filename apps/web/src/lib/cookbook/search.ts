/**
 * Cookbook search: the tokenizer, term processing and MiniSearch options the
 * gallery and the ⌘K palette share, plus the helpers that rank exact
 * identifier hits and explain why a recipe matched.
 *
 * Isomorphic and browser-safe: no Node imports (only erasable type imports).
 */
import type { SearchOptions, Options } from "minisearch";
import type { Locale, Catalog, CatalogRecipe } from "./types.ts";
import { CJK_TERM, CJK, tokenize } from "./search/tokenize.ts";

export { foldKana, kanaInsensitive, hasCjk, cjkWords, tokenize, cjkAwareTokenizer } from "./search/tokenize.ts";

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
 *  alone, and the English list for the Latin words a Chinese text quotes.
 *  Japanese drops the kana words `KANA_BREAKS` leaves standing (as grams,
 *  folded to hiragana: こと, ため, よう…), with the English list too. */
export const STOP_WORDS: Record<Locale, ReadonlySet<string>> = {
  en: new Set(EN_STOP_WORDS),
  zh: new Set([
    ...EN_STOP_WORDS,
    "是", "在", "有", "这", "那", "这个", "那个", "个", "也", "都", "就", "还", "又", "要", "想", "能",
    "会", "请", "让", "用", "中", "上", "下", "时", "里", "并", "而", "但", "则", "即", "之", "其",
  ]),
  ja: new Set([
    ...EN_STOP_WORDS,
    "こと", "もの", "ため", "よう", "これ", "それ", "あれ", "この", "その", "あの", "どの", "どれ",
    "どう", "なに", "ある", "いる", "なる", "ない", "して", "した", "され", "れる", "られ", "でき",
    "たい", "とき", "など", "なら", "けど", "だけ", "ほど", "また", "さら", "おく", "いう", "みる",
  ]),
  es: new Set([
    "a", "al", "como", "con", "cual", "cuando", "de", "del", "donde", "e", "el", "en", "entre",
    "es", "esa", "ese", "esta", "este", "esto", "hay", "la", "las", "le", "lo", "los", "mas",
    "me", "mi", "mis", "muy", "no", "o", "para", "pero", "por", "que", "se", "si", "sin", "sobre",
    "su", "sus", "tu", "un", "una", "uno", "unos", "y", "yo",
  ]),
  // Folded as the terms are (`foldArabic`).
  ar: new Set([
    ...EN_STOP_WORDS,
    ...[
      "في", "من", "إلى", "على", "عن", "مع", "أو", "و", "ثم", "أن", "إن", "لا", "ما", "ماذا", "كيف", "متى",
      "أين", "هل", "هذا", "هذه", "ذلك", "تلك", "التي", "الذي", "كل", "بعض", "به", "بها", "له", "لها",
      "هو", "هي", "أنا", "أنت", "عند", "بين", "حتى", "قد", "لم", "لن", "كان", "كانت", "أي", "غير",
    ].map(foldArabic),
  ]),
  ca: new Set([
    "a", "al", "als", "amb", "com", "de", "del", "dels", "el", "els", "en", "entre", "es", "esta",
    "aquest", "aquesta", "aixo", "hi", "ho", "i", "la", "les", "li", "lo", "ma", "mes", "meu", "molt",
    "no", "o", "on", "per", "pero", "que", "quan", "qual", "se", "si", "sense", "sobre", "seu",
    "seus", "teu", "un", "una", "uns", "unes", "jo",
  ]),
  pt: new Set([
    "a", "ao", "aos", "as", "com", "como", "da", "das", "de", "do", "dos", "e", "ela", "ele", "em",
    "entre", "esta", "este", "isso", "isto", "mais", "mas", "me", "meu", "minha", "muito", "na", "nas",
    "no", "nos", "num", "numa", "o", "onde", "os", "ou", "para", "pela", "pelo", "por", "pra", "qual",
    "quando", "que", "se", "sem", "seu", "sua", "sobre", "um", "uma", "uns", "umas", "voce", "eu",
  ]),
  fr: new Set([
    "a", "au", "aux", "avec", "ce", "ces", "cet", "cette", "comment", "dans", "de", "des", "du", "elle",
    "en", "est", "et", "il", "je", "l", "la", "le", "les", "leur", "ma", "mais", "me", "mes", "mon",
    "ne", "ou", "par", "pas", "plus", "pour", "qu", "quand", "que", "quel", "quelle", "qui", "sa",
    "sans", "se", "ses", "son", "sur", "un", "une", "vos", "votre", "vous", "y",
  ]),
  // Folded as the terms are: "für" → "fur", "über" → "uber".
  de: new Set([
    "aber", "als", "am", "an", "auf", "aus", "bei", "bis", "das", "dass", "dem", "den", "der", "des",
    "die", "durch", "ein", "eine", "einem", "einen", "einer", "eines", "es", "fur", "ich", "ihr",
    "im", "in", "ist", "kann", "man", "mit", "nach", "nicht", "noch", "ob", "oder", "ohne", "sich",
    "sie", "sind", "so", "uber", "um", "und", "unter", "vom", "von", "vor", "was", "wenn", "wie",
    "wird", "wo", "zu", "zum", "zur",
  ]),
  it: new Set([
    "a", "ad", "agli", "ai", "al", "alla", "alle", "allo", "che", "chi", "ci", "come", "con", "cosa",
    "da", "dal", "dalla", "dei", "del", "della", "delle", "dello", "di", "e", "ed", "gli", "il", "in",
    "io", "la", "le", "lo", "ma", "mi", "nei", "nel", "nella", "non", "o", "per", "perche", "piu",
    "quale", "quando", "questo", "questa", "se", "si", "su", "sul", "sulla", "ti", "tra", "tu", "tuo",
    "tua", "un", "una", "uno",
  ]),
};

/** Lowercase and without diacritics: "Cómo" → "como", "Título" → "titulo". */
export function foldText(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

/** Arabic spellings a reader types interchangeably, folded alike: no
 *  vowel marks or tatweel, hamza seats and alef forms as bare alef, ى as ي,
 *  ة as ه, Arabic-Indic digits as 0–9, and the article (with a joined و,
 *  ف, ب, ك or ل) dropped: «الجداول» and «جداول» are one term. */
export function foldArabic(term: string): string {
  let t = term
    .replace(/[\u0610-\u061A\u064B-\u065F\u0670\u06D6-\u06ED\u0640]/g, "")
    .replace(/[أإآٱ]/g, "ا").replace(/ى/g, "ي").replace(/ة/g, "ه").replace(/ؤ/g, "و").replace(/ئ/g, "ي")
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x6f0));
  const article = /^(?:[وف]?(?:[بكل])?ال|لل)(.{2,})$/.exec(t);
  if (article && t !== "الله") t = article[1]!;
  return t;
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
  if (/[\u0620-\u064A]/.test(term)) {
    // Arabic in any locale: sound plurals and the dual (صفحات → صفح ← صفحه,
    // مترجمون / مترجمين → مترجم); broken plurals stay apart.
    if (term.length > 4 && /(ات|ون|ين|ان)$/.test(term)) return term.slice(0, -2);
    if (term.length > 3 && /ه$/.test(term)) return term.slice(0, -1);
    return term;
  }
  if (locale === "pt") {
    // cores → cor, imagens → imagem, legendas → legenda, papeis → papel
    if (term.length > 4 && /ns$/.test(term)) return term.slice(0, -2) + "m";
    if (term.length > 4 && /oes$/.test(term)) return term.slice(0, -3) + "ao";
    if (term.length > 4 && /eis$/.test(term)) return term.slice(0, -3) + "el";
    if (term.length > 4 && /[rz]es$/.test(term)) return term.slice(0, -2);
    if (/[aeiou]s$/.test(term)) return term.slice(0, -1);
    return term;
  }
  if (locale === "fr") {
    // couleurs → couleur, tableaux → tableau, journaux → journal, notes → note
    if (term.length > 4 && /aux$/.test(term)) return term.slice(0, -3) + "al";
    if (term.length > 4 && /eaux$/.test(term)) return term.slice(0, -1);
    if (/[^su]s$/.test(term) || /[aeiou]s$/.test(term)) return term.slice(0, -1);
    return term;
  }
  if (locale === "de") {
    // Spalten / Spalte → spalt, Abbildungen → abbildung, Bilder → bild,
    // Sätze → satz (folded), Fonts → font
    if (term.length > 5 && /(en|er|es)$/.test(term)) return term.slice(0, -2);
    if (term.length > 4 && /[ens]$/.test(term)) return term.slice(0, -1);
    return term;
  }
  if (locale === "it") {
    // tabelle / tabella → tabell, libri / libro → libr, righe / riga → rig
    if (term.length > 4 && /[cg]h[ei]$/.test(term)) return term.slice(0, -2);
    if (/[aeio]$/.test(term)) return term.slice(0, -1);
    return term;
  }
  if (locale === "ca") {
    // taules / taula → taul, imatges / imatge → imatg, colors → color
    if (term.length > 4 && /es$/.test(term)) return term.slice(0, -2);
    if (/[^aeiou]s$/.test(term)) return term.slice(0, -1);
    if (term.length > 4 && /[ae]$/.test(term)) return term.slice(0, -1);
    return term;
  }
  // boxes → box, classes → class, entries → entry, captions → caption
  if (term.length > 4 && /(ss|x|z|ch|sh)es$/.test(term)) return term.slice(0, -2);
  if (term.length > 4 && /[^aeiou]ies$/.test(term)) return term.slice(0, -3) + "y";
  if (/[^siu]s$/.test(term)) return term.slice(0, -1);
  return term;
}

/** MiniSearch `processTerm` for a locale: lowercases, strips diacritics
 *  (NFD), drops stop words and one-letter terms (not one Chinese character
 *  or kana, which can be a word), folds naive plurals. A Chinese or
 *  Japanese gram comes from `tokenize` already folded and is kept whole:
 *  NFD would split が into か and a mark. */
export function processTerm(term: string, locale: Locale): string | null {
  if (CJK_TERM.test(term)) return STOP_WORDS[locale].has(term) ? null : term;
  const folded = foldArabic(foldText(term));
  if (folded.length < 2 && !/\d/.test(folded) && !CJK.test(folded)) return null;
  if (STOP_WORDS[locale].has(folded)) return null;
  return singular(folded, locale);
}

export function makeProcessTerm(locale: Locale): (term: string) => string | null {
  return (term) => processTerm(term, locale);
}

/** The search locale of a site locale segment, English for anything else. */
export function searchLocale(locale: string): Locale {
  return locale === "es" || locale === "ca" || locale === "pt" || locale === "fr" || locale === "de" || locale === "it" || locale === "zh" || locale === "ja" || locale === "ar" ? locale : "en";
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
  ca: miniSearchOptions("ca"),
  pt: miniSearchOptions("pt"),
  fr: miniSearchOptions("fr"),
  de: miniSearchOptions("de"),
  it: miniSearchOptions("it"),
  zh: miniSearchOptions("zh"),
  ja: miniSearchOptions("ja"),
  ar: miniSearchOptions("ar"),
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
 *  (`renderToPdf()` → `renderToPdf`); Chinese or Japanese text around an
 *  identifier separates it too (`renderToPdf怎么用`, `renderToPdfの使い方`). */
function queryWords(query: string): string[] {
  return query
    .split(/[\s,;，；、。？！：・「」\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}\u30FC]+/u)
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
