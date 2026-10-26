import type { ColorValue, Dimension } from './page.js';

// ---------------------------------------------------------------------------
// Back-of-book index — what `:::index` prints (#165).
// ---------------------------------------------------------------------------

/** The letter heads of an index: the first letter of each group of
 *  entries, set above them. */
export interface IndexGroupsConfig {
  /** Print a letter head above each group. Default `true`. */
  enabled?: boolean;
  fontFamily?: string;
  fontSize?: Dimension;
  /** Default `700`. */
  fontWeight?: number;
  italic?: boolean;
  color?: ColorValue;
  /** Space above each group (letter head or not), except at the top of a
   *  column. Default one body line. */
  marginTop?: Dimension;
  /** The fewest entries of a group left at the foot of a column, and the
   *  fewest carried to the head of the next, when a column or a page ends
   *  inside the group (#712). An entry is one entry block: a main entry or
   *  a sub-entry, with the head and the page-less entries set above it. A
   *  group too short to leave that many on each side moves whole to the
   *  next column; one taller than a column is divided where it must be.
   *  `1` lets a column end between any two entries, as up to postext 1.27.
   *  A whole number of 1 or more. Default `2`; configurations stored
   *  earlier whose text sets an index read with `1` (see `migrateConfig` in
   *  `postext/bundle`). */
  splitMinEntries?: number;
  /** Head of the entries that start with a symbol. Default `Symbols` /
   *  `Símbolos` in the document language. */
  symbolsLabel?: string;
  /** Head of the entries that start with a digit. Default `0–9`. */
  numbersLabel?: string;
}

export interface IndexConfig {
  /** Entry typography; every field inherits the body text when unset. */
  fontFamily?: string;
  fontSize?: Dimension;
  lineHeight?: Dimension;
  fontWeight?: number;
  color?: ColorValue;
  /** Indent of each sub-entry level. Default `1em`. */
  indent?: Dimension;
  /** Extra indent of an entry's wrapped lines (turnover lines), beyond its
   *  deepest level. Default `2em`. */
  turnoverIndent?: Dimension;
  /** Space above each main entry. Default `0`. */
  entrySpacing?: Dimension;
  /** Between the term and its first page number. Default `', '` (the
   *  Arabic comma `'، '` in an index sorted in a language written in
   *  Arabic script). */
  separator?: string;
  /** Between two page numbers. Default `', '` (`'، '` in Arabic script). */
  locatorSeparator?: string;
  /** Between the ends of a page range. Default `'–'` (en dash). */
  rangeSeparator?: string;
  /** Join consecutive pages into a range (`12, 13, 14` → `12–14`).
   *  Default `true`. */
  mergeRanges?: boolean;
  /** How the second number of a range is written: `'full'` (`234–237`)
   *  or `'chicago'` (`234–37`, *The Chicago Manual of Style* 9.64).
   *  Default `'full'`. */
  rangeFormat?: 'full' | 'chicago';
  /** Style of the principal page number (`main` on a mark). Default
   *  bold. */
  main?: { bold?: boolean; italic?: boolean };
  /** Cross-references. The labels default to `See` / `See also` (Spanish
   *  `Véase` / `Véase también`, Arabic `انظر` / `انظر أيضًا`), in italics
   *  — upright in an Arabic-script index, whose fonts have no italics.
   *
   *  `separator` is printed before the label (#836). Default `'. '`
   *  (*The Chicago Manual of Style*: `Firearms. See weapons`), by the
   *  index's language: `', '` in French, Italian and German (`pierrier,
   *  voir éboulis`), a space in Portuguese (ABNT NBR 6034: `Aviação ver
   *  Aeronáutica`) and Catalan (IEC: `abecedari v. alfabet`), `'。'` in
   *  Chinese, an ideographic space in Japanese. A built-in label takes
   *  the case the separator asks for: a capital after a full stop (or
   *  `!`, `?`, `。`), a small letter after anything else (`Geröllhalde,
   *  siehe Schutthalde`); a label of the author's own prints as written. */
  see?: { label?: string; alsoLabel?: string; italic?: boolean; separator?: string };
  /** Language whose alphabetical order sorts the entries (a BCP 47 tag).
   *  Default: the document language. */
  locale?: string;
  /** What the group heads are (#182):
   *  - `'letter'`: the first letter of the sort key (up to postext 1.8 the
   *    only grouping);
   *  - `'pinyin'`: an entry starting with a Han character files under the
   *    Latin initial of its pinyin reading (A–Z; 贾宝玉 under J), a Latin
   *    sort key under its letter, after the Han entries (`sort="jia mu"`
   *    ends J); a Han key read as wanted sorts in place (`sort="崇阳"`
   *    for 重阳);
   *  - `'stroke'`: under the stroke count of its first character (一畫,
   *    二畫 …; 一画 … in Simplified Chinese);
   *  - `'gojuon'` (五十音, #425): under the gojūon row of the first kana of
   *    the entry's reading (あ行 か行 さ行 た行 な行 は行 ま行 や行 ら行
   *    わ行); see below for the order;
   *  - `'kana'`: under the first kana of the reading itself (か for が,
   *    カ and ヵ);
   *  - `'none'`: no heads; symbols, numbers and words are set apart by the
   *    groups' `marginTop` only;
   *  - `'auto'` (default): `'pinyin'` in Simplified Chinese (`zh`,
   *    `zh-Hans`, `zh-CN`), `'stroke'` in Traditional Chinese (`zh-Hant`,
   *    `zh-TW`, `zh-HK`), `'gojuon'` in Japanese (`ja`, `ja-JP`),
   *    `'letter'` in any other language.
   *
   *  A Japanese index (or one grouped by `gojuon` or `kana`) sorts by the
   *  entries' readings in JIS X 4061 order: symbols, digits, Latin (under
   *  their letters), then the kana rows; katakana file as hiragana, small
   *  kana as large, voiced as plain (清 < 濁 < 半濁 break the ties), ー as
   *  the vowel before it. The reading is the mark's `yomi` (alias
   *  `reading`), else the kana ruby of the marked text, else `sort`; an
   *  entry with a kanji and no reading raises `indexReadingMissing` and
   *  files after the kana, with no head.
   *
   *  The entries sort in the collation the heads come from (a
   *  `zh-Hant` index grouped by pinyin sorts by pinyin). A browser without
   *  Chinese collation data sets a pinyin or stroke index with no heads. */
  groupBy?: IndexGroupBy;
  groups?: IndexGroupsConfig;
  /** Sort and group Arabic entries as if a leading article `ال` (`ٱل`)
   *  were not there: البصرة files under ب, between بدر and بغداد, and
   *  prints as written. The article is the definite `al-` only — `ابن`,
   *  `أبو`, `وال`… are kept — and an entry with its own `sort` key is
   *  sorted by that key as given. Default: `true` when the index sorts in
   *  Arabic (`locale`, else the document language, is `ar` or `ar-…`),
   *  else `false`. */
  ignoreArticle?: boolean;
}

/** See {@link IndexConfig.groupBy}. */
export type IndexGroupBy = 'auto' | 'letter' | 'pinyin' | 'stroke' | 'gojuon' | 'kana' | 'none';

export interface ResolvedIndexConfig {
  fontFamily: string;
  fontSize: Dimension;
  lineHeight: Dimension;
  fontWeight: number;
  color: ColorValue;
  indent: Dimension;
  turnoverIndent: Dimension;
  entrySpacing: Dimension;
  separator: string;
  locatorSeparator: string;
  rangeSeparator: string;
  mergeRanges: boolean;
  rangeFormat: 'full' | 'chicago';
  main: { bold: boolean; italic: boolean };
  /** Unset labels follow the document language. */
  see: { label?: string; alsoLabel?: string; italic: boolean; separator: string };
  locale?: string;
  groupBy: IndexGroupBy;
  ignoreArticle: boolean;
  groups: {
    enabled: boolean;
    fontFamily: string;
    fontSize: Dimension;
    fontWeight: number;
    italic: boolean;
    color: ColorValue;
    marginTop: Dimension;
    splitMinEntries: number;
    symbolsLabel?: string;
    numbersLabel?: string;
  };
}
