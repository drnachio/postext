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
// Arabic letters, their marks, the tatweel and the Arabic-Indic digits are
// word characters too (U+060C ، U+061B ؛ U+061F ؟ and U+066A–066D separate).
const SEPARATOR = /[^0-9A-Za-zÀ-ÖØ-öø-ɏḀ-ỿ\u0620-\u0669\u066E-\u06D3\u06D5-\u06FF\u0750-\u077F]+/;

/** Hiragana, katakana, the long-vowel mark ー and the combining voiced
 *  marks, as a character-class body. Unicode files ー (U+30FC) and the
 *  marks under Common script, so they are named; the middle dot ・, which
 *  separates words (傍点・圏点), is left out. */
const KANA_CLASS = "\\p{Script=Hiragana}\\p{Script=Katakana}\\u30FC\\u3099\\u309A";

/** A run of Chinese or Japanese characters: Han (the CJK blocks and their
 *  extensions, 〇 and 々), 〆, kana and ー. Kanji and kana stay in one run,
 *  so 縦書き is cut as a whole and keeps its き. */
const CJK_RUN = new RegExp(`[\\p{Script=Han}\u3006${KANA_CLASS}]+`, "gu");
const CJK = new RegExp(`[\\p{Script=Han}\u3006${KANA_CLASS}]`, "u");
const CJK_TERM = new RegExp(`^[\\p{Script=Han}\u3006${KANA_CLASS}]+$`, "u");
const KANA = new RegExp(`[${KANA_CLASS}]`, "u");

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

/** Particles, auxiliaries and question words that break a Japanese run (one
 *  holding kana), longest first. Only where the next character is not
 *  hiragana: there the word in front has ended (ルビの位置 → ルビ, 位置;
 *  縦書きには → 縦書き), while the same kana inside a word stay (ふりがな,
 *  ひらがな keep their が). A run with kana is taken as Japanese and is not
 *  cut at the Chinese words, which are Japanese words too (和文, 与える). */
const KANA_BREAKS = new RegExp(
  `(?:${[
    "どうやって", "どうすれば", "どのように", "について", "ください", "ための", "ように",
    "ですか", "ますか", "します", "から", "まで", "より", "には", "では", "とは", "への", "での",
    "との", "です", "ます", "する", "の", "は", "を", "に", "が", "で", "と", "も", "へ", "や", "か",
  ].join("|")})(?![\\p{Script=Hiragana}\\u30FC\\u3099\\u309A])`,
  "gu",
);

/** Half-width katakana (ｶﾅ) and the full-width forms of ASCII (ＰＤＦ),
 *  widened or narrowed by NFKC before anything is cut. NFKC is applied to
 *  this block only: elsewhere it would rewrite characters a reader means
 *  (², ①, ﬁ). */
const WIDTH_FORMS = /[\uFF01-\uFFEF]+/g;

function normalizeWidths(text: string): string {
  return text.replace(WIDTH_FORMS, (forms) => forms.normalize("NFKC"));
}

/** Katakana as hiragana, one code unit for one, so ルビ and るび are one
 *  term and an index into the folded text is an index into the original.
 *  ヷ–ヺ have no hiragana and stay. */
export function foldKana(text: string): string {
  return text.replace(/[\u30A1-\u30F6\u30FD\u30FE]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));
}

/** A regular-expression source matching `term` (already escaped) with each
 *  hiragana letter as either kana, for marking a folded term in the text as
 *  shown (るび marks ルビ). */
export function kanaInsensitive(term: string): string {
  return term.replace(/[\u3041-\u3096\u309D\u309E]/g, (c) => `[${c}${String.fromCharCode(c.charCodeAt(0) + 0x60)}]`);
}

/** True when `text` holds a Chinese or Japanese character (kanji or kana). */
export function hasCjk(text: string): boolean {
  return CJK.test(text);
}

/** A Chinese or Japanese run cut into words where the break lists allow,
 *  each folded (katakana as hiragana). */
function cjkPieces(run: string): string[] {
  const breaks = KANA.test(run) ? KANA_BREAKS : HAN_BREAKS;
  return run.split(breaks).filter(Boolean).map(foldKana);
}

/** A Chinese or Japanese run as search terms: every character and every
 *  overlapping pair, in order (页眉设置 → 页, 页眉, 眉, 眉设, 设, 设置, 置;
 *  ルビ → る, るび, び). Pairs find words; single characters keep
 *  one-character queries working and let a prefix query reach the pairs
 *  that start with them. */
function cjkGrams(run: string): string[] {
  const out: string[] = [];
  for (const piece of cjkPieces(run)) {
    const chars = [...piece];
    chars.forEach((char, i) => {
      out.push(char);
      if (i + 1 < chars.length) out.push(char + chars[i + 1]);
    });
  }
  return out;
}

/** The Chinese and Japanese runs of a text, cut at the break words and
 *  folded (怎么添加脚注 → 添加脚注; ルビの位置 → るび, 位置). */
export function cjkWords(text: string): string[] {
  return [...normalizeWidths(text).matchAll(CJK_RUN)].flatMap((m) => cjkPieces(m[0]));
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

/** Cuts the Chinese and Japanese runs of `text` into grams (`cjkGrams`)
 *  and hands the text between them to `words`. Half-width katakana and
 *  full-width Latin are first brought to their usual widths. */
function splitCjkRuns(text: string, words: (text: string, out: string[]) => void): string[] {
  const out: string[] = [];
  const normal = normalizeWidths(text);
  let last = 0;
  for (const match of normal.matchAll(CJK_RUN)) {
    const index = match.index ?? 0;
    words(normal.slice(last, index), out);
    out.push(...cjkGrams(match[0]));
    last = index + match[0].length;
  }
  words(normal.slice(last), out);
  return out;
}

/** Splits on whitespace and punctuation (so dotted paths such as
 *  `headings.levels[].advancedDesign` yield each segment) and also emits the
 *  camelCase parts of every word, next to the word itself. Chinese and
 *  Japanese runs, which have no spaces to split on, become characters and
 *  pairs (`cjkGrams`). The index and the query share it in every locale: an
 *  English page may quote Chinese or Japanese too. */
export function tokenize(text: string): string[] {
  return splitCjkRuns(text, latinTokens);
}

/** A tokenizer that keeps `words` (MiniSearch's default splitting, say) for
 *  everything but Chinese and Japanese runs, which become grams as in
 *  `tokenize`: for an index that keeps its own term handling and must still
 *  find the Chinese or Japanese a page quotes. */
export function cjkAwareTokenizer(words: (text: string) => string[]): (text: string) => string[] {
  return (text) => splitCjkRuns(text, (part, out) => {
    if (part) out.push(...words(part).filter(Boolean));
  });
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
  return locale === "es" || locale === "ca" || locale === "pt" || locale === "zh" || locale === "ja" || locale === "ar" ? locale : "en";
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
