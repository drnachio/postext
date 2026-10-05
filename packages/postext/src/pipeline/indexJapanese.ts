/**
 * The order and the group heads of a Japanese back-of-book index (#425).
 *
 * A Japanese index files its entries in gojūon order (五十音順) by their
 * reading (読み), never by the characters written: 東京 files where とうきょう
 * does. No algorithm reads kanji reliably, so the reading comes from the
 * author (`:index[東京]{yomi="とうきょう"}`, or the ruby of the marked text);
 * an entry without one is reported (`indexReadingMissing`) and files after
 * the kana, by code point.
 *
 * The comparison is JIS X 4061 (日本語文字列照合順番), written out here so
 * that the order does not depend on the ICU data of the browser:
 *
 * - Character groups: symbols (space first) < Arabic digits < Latin < kana
 *   < kanji < geta 〓. Digit runs compare as numbers.
 * - Kana compare first on their base letter in gojūon order (あいうえお … わ
 *   ゐゑをん): katakana as hiragana, a small kana as its large form, a voiced
 *   or semi-voiced one as its plain form (ガ = か, ぱ = は, ぁ = あ). The long
 *   vowel mark ー stands for the vowel of the kana before it (カー = かあ);
 *   the iteration marks ゝゞヽヾ for the kana before them (いすゞ = いすず).
 * - Ties between equal base letters break, in this order: 清音 < 濁音 <
 *   半濁音 (は < ば < ぱ); 長音記号 < 小文字 < 繰返し記号 < 大文字 (ー < ぁ <
 *   ゝ < あ); 平仮名 < 片仮名. Last, the code points of the key.
 *
 * Kanji compare by code point: JIS X 4061 orders them by their JIS X 0208
 * code (level 1 by reading, level 2 by radical), a table the engine does
 * not ship, and an entry that reaches this comparison lacks a reading
 * anyway.
 *
 * The heads (ja typography §13): `gojuon` files an entry under the row of
 * its first kana (あ行 か行 さ行 た行 な行 は行 ま行 や行 ら行 わ行; ん under
 * わ行), the form technical and reference books use, which also says the
 * group spans a row; `kana` under the first kana itself (か for が, カ and
 * ヵ), the form of dictionaries and long name indexes.
 */

/** The base letters in gojūon order: the primary weight of a kana is its
 *  place here. */
export const GOJUON = 'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわゐゑをん';

/** The rows of the gojūon table and where each starts in {@link GOJUON}:
 *  や and わ hold fewer letters (やゆよ; わゐゑをん, ん filed with わ). */
export const GOJUON_ROWS: readonly { head: string; start: number }[] = [
  { head: 'あ', start: 0 }, { head: 'か', start: 5 }, { head: 'さ', start: 10 }, { head: 'た', start: 15 },
  { head: 'な', start: 20 }, { head: 'は', start: 25 }, { head: 'ま', start: 30 }, { head: 'や', start: 35 },
  { head: 'ら', start: 38 }, { head: 'わ', start: 43 },
];

/** The vowel each base letter ends in, which a following ー repeats (ん
 *  repeats itself). */
const VOWEL_OF = 'あいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあいうえおあうおあいうえおあいえおん';

/** Small kana and their large forms, hiragana (the katakana ones fold to
 *  these first), with the small katakana of the Ainu extension (ㇰ …). */
const SMALL_KANA: Readonly<Record<string, string>> = {
  'ぁ': 'あ', 'ぃ': 'い', 'ぅ': 'う', 'ぇ': 'え', 'ぉ': 'お', 'っ': 'つ', 'ゃ': 'や', 'ゅ': 'ゆ', 'ょ': 'よ',
  'ゎ': 'わ', 'ゕ': 'か', 'ゖ': 'け',
  'ㇰ': 'く', 'ㇱ': 'し', 'ㇲ': 'す', 'ㇳ': 'と', 'ㇴ': 'ぬ', 'ㇵ': 'は', 'ㇶ': 'ひ', 'ㇷ': 'ふ', 'ㇸ': 'へ',
  'ㇹ': 'ほ', 'ㇺ': 'む', 'ㇻ': 'ら', 'ㇼ': 'り', 'ㇽ': 'る', 'ㇾ': 'れ', 'ㇿ': 'ろ',
};

/** The iteration marks: their voicing (ゞ voices the kana it repeats) and
 *  script. 〱〲 are the vertical forms. */
const ITERATION: Readonly<Record<string, { voiced: boolean; katakana: boolean }>> = {
  'ゝ': { voiced: false, katakana: false }, 'ゞ': { voiced: true, katakana: false },
  'ヽ': { voiced: false, katakana: true }, 'ヾ': { voiced: true, katakana: true },
  '〱': { voiced: false, katakana: false }, '〲': { voiced: true, katakana: false },
};

const LONG_VOWEL = 'ー';

/** Character groups of JIS X 4061, in their order. */
const Group = { Symbol: 0, Digit: 1, Latin: 2, Kana: 3, Kanji: 4, Geta: 5 } as const;
type Group = (typeof Group)[keyof typeof Group];

/** The kind of a kana for the second tie-break. */
const KanaKind = { Long: 0, Small: 1, Iteration: 2, Large: 3 } as const;

/** One collation element of a key. */
interface Element {
  group: Group;
  /** Primary weight inside the group: the gojūon place of a kana, the
   *  value of a digit run, the folded code point of anything else. */
  primary: number;
  /** First tie-break: 清 0, 濁 1, 半濁 2 (kana); unaccented 0, accented 1
   *  (Latin). */
  voicing: number;
  /** Second tie-break: {@link KanaKind} (kana); 0 otherwise. */
  kind: number;
  /** Third tie-break: hiragana 0, katakana 1 (kana); lower case 0, upper
   *  case 1 (Latin). */
  script: number;
}

/** A plain kana's base letter, voicing, size and script, from its
 *  canonical decomposition (ガ → カ + U+3099). Undefined when `ch` is no
 *  kana letter. */
function kanaParts(ch: string): { base: number; voicing: number; small: boolean; katakana: boolean } | undefined {
  const nfd = ch.normalize('NFD');
  let letter = nfd[0]!;
  const mark = nfd.charCodeAt(1);
  const voicing = mark === 0x3099 ? 1 : mark === 0x309a ? 2 : 0;
  const code = letter.charCodeAt(0);
  let katakana = false;
  if (code >= 0x30a1 && code <= 0x30f6) {
    katakana = true;
    letter = String.fromCharCode(code - 0x60);
  } else if (code >= 0x31f0 && code <= 0x31ff) {
    katakana = true;
  } else if (!(code >= 0x3041 && code <= 0x3096)) {
    return undefined;
  }
  const large = SMALL_KANA[letter];
  const base = GOJUON.indexOf(large ?? letter);
  if (base < 0) return undefined;
  return { base, voicing, small: large !== undefined, katakana };
}

/** The collation elements of `key` (see the module header). */
function elementsOf(key: string): Element[] {
  const text = key.normalize('NFKC');
  const out: Element[] = [];
  /** The last kana element, which ー and the iteration marks repeat. */
  let lastKana: Element | undefined;
  const chars = [...text];
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i]!;
    if (ch >= '0' && ch <= '9') {
      // A run of digits (fullwidth ones made ASCII by NFKC) is one element
      // weighed by its value: 2 before 10.
      let j = i;
      while (j + 1 < chars.length && chars[j + 1]! >= '0' && chars[j + 1]! <= '9') j++;
      out.push({ group: Group.Digit, primary: Number(chars.slice(i, j + 1).join('')), voicing: 0, kind: 0, script: 0 });
      i = j;
      lastKana = undefined;
      continue;
    }
    const kana = kanaParts(ch);
    if (kana) {
      const el: Element = {
        group: Group.Kana, primary: kana.base, voicing: kana.voicing,
        kind: kana.small ? KanaKind.Small : KanaKind.Large, script: kana.katakana ? 1 : 0,
      };
      out.push(el);
      lastKana = el;
      continue;
    }
    if (ch === LONG_VOWEL && lastKana) {
      const el: Element = {
        group: Group.Kana, primary: GOJUON.indexOf(VOWEL_OF[lastKana.primary]!), voicing: 0,
        kind: KanaKind.Long, script: lastKana.script,
      };
      out.push(el);
      lastKana = el;
      continue;
    }
    const iteration = ITERATION[ch];
    if (iteration && lastKana) {
      const el: Element = {
        group: Group.Kana, primary: lastKana.primary, voicing: iteration.voiced ? 1 : 0,
        kind: KanaKind.Iteration, script: iteration.katakana ? 1 : 0,
      };
      out.push(el);
      lastKana = el;
      continue;
    }
    lastKana = undefined;
    if (ch === '〓') {
      out.push({ group: Group.Geta, primary: 0, voicing: 0, kind: 0, script: 0 });
    } else if (ch === LONG_VOWEL || ITERATION[ch] || /[\p{sc=Hiragana}\p{sc=Katakana}]/u.test(ch)) {
      // A long mark or an iteration mark with no kana to repeat, and the
      // kana digraphs (ゟ, ヿ), file as symbols.
      out.push({ group: Group.Symbol, primary: ch.codePointAt(0)!, voicing: 0, kind: 0, script: 0 });
    } else if (/\p{sc=Han}/u.test(ch)) {
      out.push({ group: Group.Kanji, primary: ch.codePointAt(0)!, voicing: 0, kind: 0, script: 0 });
    } else if (/\p{L}/u.test(ch)) {
      const lower = ch.toLowerCase();
      const plain = lower.normalize('NFD').replace(/\p{M}/gu, '') || lower;
      out.push({
        group: Group.Latin, primary: plain.codePointAt(0)!, voicing: plain === lower ? 0 : 1,
        kind: 0, script: lower === ch ? 0 : 1,
      });
    } else {
      out.push({ group: Group.Symbol, primary: ch.codePointAt(0)!, voicing: 0, kind: 0, script: 0 });
    }
  }
  return out;
}

const elementsCache = new Map<string, Element[]>();

function cachedElements(key: string): Element[] {
  let els = elementsCache.get(key);
  if (!els) {
    if (elementsCache.size > 4096) elementsCache.clear();
    els = elementsOf(key);
    elementsCache.set(key, els);
  }
  return els;
}

/** Compare two element lists on one level: the primary level weighs the
 *  group and the primary weight, a shorter list sorting first; the
 *  tie-break levels (reached with equal primaries, hence equal lengths)
 *  their own field. */
function compareLevel(a: readonly Element[], b: readonly Element[], level: 'primary' | 'voicing' | 'kind' | 'script'): number {
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) {
    const x = a[i]!;
    const y = b[i]!;
    if (level === 'primary') {
      if (x.group !== y.group) return x.group - y.group;
      if (x.primary !== y.primary) return x.primary < y.primary ? -1 : 1;
    } else if (x[level] !== y[level]) {
      return x[level] - y[level];
    }
  }
  return a.length - b.length;
}

/** JIS X 4061 order of two index keys (readings): negative when `a` files
 *  first. See the module header. */
export function compareJapanese(a: string, b: string): number {
  if (a === b) return 0;
  const ea = cachedElements(a);
  const eb = cachedElements(b);
  return compareLevel(ea, eb, 'primary')
    || compareLevel(ea, eb, 'voicing')
    || compareLevel(ea, eb, 'kind')
    || compareLevel(ea, eb, 'script')
    || (a < b ? -1 : 1);
}

/** Whether a key's primary weights equal (the base comparison: か = が =
 *  カ = ヵ). */
export function sameJapaneseBase(a: string, b: string): boolean {
  return compareLevel(cachedElements(a), cachedElements(b), 'primary') === 0;
}

/** What a key files under in a Japanese index: the gojūon place of its
 *  first kana, or the group of its first character. */
export type JapaneseLead =
  | { kind: 'kana'; base: number }
  | { kind: 'latin' | 'digit' | 'symbol' | 'kanji' };

/** The first collation element of `key`, as a {@link JapaneseLead}. A
 *  leading ー or iteration mark repeats nothing: it is a symbol. */
export function japaneseLead(key: string): JapaneseLead {
  const first = cachedElements(key.trim())[0];
  if (!first) return { kind: 'symbol' };
  switch (first.group) {
    case Group.Kana: return { kind: 'kana', base: first.primary };
    case Group.Latin: return { kind: 'latin' };
    case Group.Digit: return { kind: 'digit' };
    case Group.Kanji: return { kind: 'kanji' };
    default: return { kind: 'symbol' };
  }
}

/** The row (0 = あ行 … 9 = わ行) of the base letter at `base` in
 *  {@link GOJUON}. */
export function gojuonRow(base: number): number {
  let row = 0;
  while (row + 1 < GOJUON_ROWS.length && GOJUON_ROWS[row + 1]!.start <= base) row++;
  return row;
}

/** The head of gojūon row `row`: あ行 … わ行. */
export function gojuonRowLabel(row: number): string {
  return `${GOJUON_ROWS[row]!.head}行`;
}

/** The head of the kana group at `base`: the plain hiragana letter (か
 *  for が, カ and ヵ). */
export function kanaLabel(base: number): string {
  return GOJUON[base]!;
}

/** Whether `text` holds a kanji (a Han character, 々 included): such a
 *  key needs a reading. */
export function hasKanji(text: string): boolean {
  return /\p{sc=Han}/u.test(text);
}

/** Characters a ruby reading may hold for it to give an entry's reading:
 *  kana, the long vowel mark, the iteration marks, the middle dot and
 *  spaces. A pinyin or zhuyin ruby gives none. */
const KANA_READING = /^[\p{sc=Hiragana}\p{sc=Katakana}ー・゠\s]+$/u;

/** Whether `reading` is written in kana alone (see {@link KANA_READING}). */
export function isKanaReading(reading: string): boolean {
  return KANA_READING.test(reading);
}
