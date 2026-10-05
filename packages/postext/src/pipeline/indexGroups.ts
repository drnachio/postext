/**
 * Group heads and sort keys of a back-of-book index in Chinese and in
 * Arabic.
 *
 * Chinese (#182): the Latin initial of
 * the pinyin reading (A–Z) or the stroke count (一畫, 二畫 …) of an entry's
 * first character.
 *
 * No reading or stroke data ships with the engine. The collator the index
 * already sorts with knows both: CLDR's Chinese collations (`zh-u-co-pinyin`,
 * `zh-u-co-stroke`) order the characters by reading or by stroke count, and
 * place an index marker right before each group — U+FDD0 followed by the
 * letter, or by U+2800 + the stroke count (what ICU's AlphabeticIndex
 * reads). An entry's group is the last marker that sorts before its first
 * character, found by binary search. A collator without the markers (an
 * older ICU) is searched with the first character of each group instead,
 * generated from ICU 78's markers and checked by `indexChinese.test.ts`.
 * A collator that does not sort by reading or by strokes at all gives no
 * groups: the index then has no heads.
 *
 * Arabic (#372): entries sort and group by a key that drops what an Arabic
 * index ignores (see {@link arabicSortKey}), in the `ar` collation, whose
 * order is the hijāʾī one (ا ب ت ث … ن ه و ي); the head of a group is the
 * key's first letter.
 *
 * Japanese (#425): see `indexJapanese.ts`.
 */

import { chineseScriptOf, languageOf } from '../locale';

/** How the entries of an index are grouped under heads (`index.groupBy`). */
export type IndexGrouping = 'letter' | 'pinyin' | 'stroke' | 'gojuon' | 'kana' | 'none';

const GROUPINGS: readonly string[] = ['letter', 'pinyin', 'stroke', 'gojuon', 'kana', 'none'];

/** The pinyin initials that open a group: no syllable starts with I, U or
 *  V. */
export const PINYIN_INITIALS: readonly string[] = [...'ABCDEFGHJKLMNOPQRSTWXYZ'];

/** The first character of each pinyin group of {@link PINYIN_INITIALS} in
 *  the `zh` pinyin collation (CLDR, ICU 78). */
export const PINYIN_BOUNDARIES: readonly string[] = [...'吖丷嚓咑妸发旮哈丌咔垃呣拏喔妑七呥仨他屲夕丫帀'];

/** The stroke counts that open a group in the `zh` stroke collation (CLDR,
 *  ICU 78): no character has 34, 37, 38 or 40–47 strokes. */
export const STROKE_COUNTS: readonly number[] = [
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20,
  21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31, 32, 33, 35, 36, 39, 48,
];

/** The first character of each stroke group of {@link STROKE_COUNTS}. */
export const STROKE_BOUNDARIES: readonly string[] = [...'一丁万不丗丞丣並临𠀾乾𠁆亂𠁎僵亸償儭㐦儶儷亹儽儾囔㔶𣬚囖爨厵灩灪𡤻齾齉靐龘'];

/** The collator's index marker before the pinyin group of `letter`. */
export const pinyinMarker = (letter: string): string => `﷐${letter}`;
/** The collator's index marker before the group of `strokes` strokes. */
export const strokeMarker = (strokes: number): string => `﷐${String.fromCharCode(0x2800 + strokes)}`;

function ascending(collator: Intl.Collator, list: readonly string[]): boolean {
  for (let i = 1; i < list.length; i++) if (collator.compare(list[i - 1]!, list[i]!) >= 0) return false;
  return true;
}

/** The strings that open each group of `grouping` under `collator`, in
 *  order: the collator's own markers when it has them, else the boundary
 *  characters when it sorts that way, else undefined. */
function boundsFor(collator: Intl.Collator, grouping: 'pinyin' | 'stroke'): readonly string[] | undefined {
  if (grouping === 'pinyin') {
    const markers = PINYIN_INITIALS.map(pinyinMarker);
    // B's marker sorts after 阿 (a) and before 八 (bā).
    if (ascending(collator, markers) && collator.compare(markers[1]!, '阿') > 0 && collator.compare(markers[1]!, '八') < 0) return markers;
    if (ascending(collator, PINYIN_BOUNDARIES) && collator.compare('阿', '八') < 0) return PINYIN_BOUNDARIES;
    return undefined;
  }
  const markers = STROKE_COUNTS.map(strokeMarker);
  // The two-stroke marker sorts after 一 (1) and before 人 (2).
  if (ascending(collator, markers) && collator.compare(markers[1]!, '一') > 0 && collator.compare(markers[1]!, '人') < 0) return markers;
  if (ascending(collator, STROKE_BOUNDARIES) && collator.compare('二', '三') < 0) return STROKE_BOUNDARIES;
  return undefined;
}

const boundsCache = new WeakMap<Intl.Collator, Partial<Record<'pinyin' | 'stroke', readonly string[] | null>>>();

/** {@link boundsFor}, once per collator. */
function cachedBounds(collator: Intl.Collator, grouping: 'pinyin' | 'stroke'): readonly string[] | undefined {
  let entry = boundsCache.get(collator);
  if (!entry) {
    entry = {};
    boundsCache.set(collator, entry);
  }
  if (!(grouping in entry)) entry[grouping] = boundsFor(collator, grouping) ?? null;
  return entry[grouping] ?? undefined;
}

/** Whether `collator` can group by `grouping`. */
export function canGroupBy(collator: Intl.Collator, grouping: 'pinyin' | 'stroke'): boolean {
  return cachedBounds(collator, grouping) !== undefined;
}

/** Index of the group `ch` falls in: the last bound that sorts at or
 *  before it; -1 before the first. */
function groupIndex(collator: Intl.Collator, bounds: readonly string[], ch: string): number {
  let lo = 0;
  let hi = bounds.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (collator.compare(bounds[mid]!, ch) <= 0) lo = mid + 1;
    else hi = mid;
  }
  return lo - 1;
}

/** The pinyin initial (`'J'` for 贾) of the Han character `ch`, or
 *  undefined when `collator` has no pinyin groups. */
export function pinyinInitial(collator: Intl.Collator, ch: string): string | undefined {
  const bounds = cachedBounds(collator, 'pinyin');
  if (!bounds) return undefined;
  const i = groupIndex(collator, bounds, ch);
  return i >= 0 ? PINYIN_INITIALS[i] : undefined;
}

/** The stroke count group (`13` for 賈) of the Han character `ch`, or
 *  undefined when `collator` has no stroke groups. */
export function strokeGroup(collator: Intl.Collator, ch: string): number | undefined {
  const bounds = cachedBounds(collator, 'stroke');
  if (!bounds) return undefined;
  const i = groupIndex(collator, bounds, ch);
  return i >= 0 ? STROKE_COUNTS[i] : undefined;
}

const DIGITS = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];

/** `n` (1–99) in Chinese numerals: 一, 十, 十三, 二十, 四十八. */
function chineseNumber(n: number): string {
  if (n < 10) return DIGITS[n]!;
  const tens = Math.floor(n / 10);
  return `${tens === 1 ? '' : DIGITS[tens]!}十${DIGITS[n % 10]!}`;
}

/** The head of a stroke group: 一畫, 十三畫 (Traditional), 十三画
 *  (Simplified). */
export function strokeLabel(strokes: number, traditional: boolean): string {
  return `${chineseNumber(strokes)}${traditional ? '畫' : '画'}`;
}

/** The grouping `index.groupBy` asks for in `locale`: `auto` groups a
 *  Simplified Chinese index by pinyin, a Traditional one by strokes, a
 *  Japanese one by gojūon row (#425), any other by first letter. */
export function indexGrouping(groupBy: string | undefined, locale: string): IndexGrouping {
  if (groupBy !== undefined && GROUPINGS.includes(groupBy)) return groupBy as IndexGrouping;
  if (languageOf(locale) === 'ja') return 'gojuon';
  const script = chineseScriptOf(locale);
  return script === 'Hans' ? 'pinyin' : script === 'Hant' ? 'stroke' : 'letter';
}

/** The locale an index grouped by `grouping` sorts in, so that its heads
 *  and its order agree: a Chinese locale with the collation named
 *  (`zh-Hant-u-co-pinyin`), Chinese otherwise (`zh-u-co-pinyin`,
 *  `zh-Hant-u-co-stroke`). */
export function sortLocaleFor(locale: string, grouping: IndexGrouping): string {
  if (grouping !== 'pinyin' && grouping !== 'stroke') return locale;
  if (chineseScriptOf(locale)) {
    try {
      return new Intl.Locale(locale.replace(/_/g, '-'), { collation: grouping }).toString();
    } catch {
      // Fall through to the plain Chinese collation.
    }
  }
  return grouping === 'pinyin' ? 'zh-u-co-pinyin' : 'zh-Hant-u-co-stroke';
}

/** Harakat and the other vowel and reading signs written over or under an
 *  Arabic letter (tanwīn, shadda, sukūn, the dagger alif, Qurʾānic
 *  annotation marks), and the tatweel that stretches a joint: none of them
 *  changes where a word files. The hamza signs U+0654/U+0655 are not
 *  among them here: before the article is looked for, a hamza on an alif
 *  still tells أل (ألف) from the article ال. */
const ARABIC_VOWEL_SIGNS = /[\u0610-\u061a\u064b-\u0653\u0656-\u065f\u0670\u06d6-\u06dc\u06df-\u06e4\u06e7\u06e8\u06ea-\u06ed\u08d3-\u08e1\u08e3-\u08ff\u0640]/gu;

/** The definite article at the head of a word: alif (or alif waṣla) and
 *  lām, followed by at least two letters, so a short word that merely
 *  starts with those letters (الا) keeps them. */
const ARABIC_ARTICLE = /^[\u0627\u0671]\u0644(?=\p{L}{2})/u;

/** `الله` is filed as written, under ا: the article is part of the name. */
const ALLAH = /^[\u0627\u0671]\u0644\u0644\u0647(?!\p{L})/u;

/** Letters folded to the one an Arabic index files them with (arabic
 *  typography §9.4): alif waṣla and the wavy-hamza alifs to alif, a lone
 *  hamza to alif, alif maqṣūra to yāʾ, tāʾ marbūṭa to hāʾ. The hamza seats
 *  (أ إ آ ؤ ئ) fold by decomposition, their sign being dropped. */
const ARABIC_FOLDS: Readonly<Record<string, string>> = {
  '\u0671': '\u0627', '\u0672': '\u0627', '\u0673': '\u0627', '\u0621': '\u0627',
  '\u0649': '\u064a', '\u0629': '\u0647',
};

/**
 * The key an Arabic index entry sorts and groups by, from its text as
 * written:
 * 1. the vowel signs and tatweel go (ٱلْكِتَابُ reads as الكتاب);
 * 2. with `ignoreArticle`, a leading article goes (البصرة → بصرة, between
 *    بدر and بغداد); الله keeps it;
 * 3. presentation forms and ligatures are decomposed (ﻻ → لا), and the
 *    signs left on Arabic letters dropped, which takes the hamza off its
 *    seat (أحمد, إبراهيم, آدم → ا; مؤمن → مومن);
 * 4. ٱ, ء → ا; ى → ي; ة → ه.
 * Only Arabic letters change: a Latin word keeps its accents (the collator
 * weighs them as it always does).
 */
export function arabicSortKey(text: string, ignoreArticle: boolean): string {
  let key = text.normalize('NFC').replace(ARABIC_VOWEL_SIGNS, '').trim();
  if (ignoreArticle && !ALLAH.test(key)) key = key.replace(ARABIC_ARTICLE, '');
  key = key.normalize('NFKD').replace(/(\p{sc=Arabic})\p{M}+/gu, '$1');
  return key.replace(/[\u0671-\u0673\u0621\u0649\u0629]/gu, (ch) => ARABIC_FOLDS[ch] ?? ch).normalize('NFC');
}
