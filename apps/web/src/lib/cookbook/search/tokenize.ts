// Tokenizing recipe text and queries: Latin words, camelCase parts and
// CJK runs cut into words and grams.

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
export const CJK = new RegExp(`[\\p{Script=Han}\u3006${KANA_CLASS}]`, "u");
export const CJK_TERM = new RegExp(`^[\\p{Script=Han}\u3006${KANA_CLASS}]+$`, "u");
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
