/**
 * Japanese numerals and kana counters, as the predefined styles of CSS
 * Counter Styles 3 define them: the counted kanji numerals
 * (`japanese-informal`, 百一, 六千一), the daiji of legal and financial
 * text (`japanese-formal`, 壱百壱), the gojūon kana series (`hiragana` あいう…, `katakana` アイウ…) and the iroha
 * series (`hiragana-iroha` いろは…, `katakana-iroha` イロハ…).
 *
 * The counted style is not the Chinese longhand (chineseNumerals.ts):
 * Japanese drops the 一 before 十・百・千 (十一, 百, 千) and writes no 零 for
 * a gap (101 百一, 6001 六千一, where Chinese has 一百零一, 六千零一). The
 * positional style (二〇二六) is `cjk-decimal`, shared with Chinese.
 */

/** 〇 (U+3007) and the informal digits; 〇 only ever stands alone (zero). */
const INFORMAL_DIGITS = ['〇', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
/** The daiji: 壱 弐 参 伍 replace 一 二 三 五, which a stroke turns into
 *  another number; 四 and 六–九 stay. 零 is the formal zero. */
const FORMAL_DIGITS = ['零', '壱', '弐', '参', '四', '伍', '六', '七', '八', '九'];
/** 十 百 千 (informal) and 拾 百 阡 (formal), for the tens, hundreds and
 *  thousands of a four-digit group. */
const INFORMAL_MARKERS = ['', '十', '百', '千'];
const FORMAL_MARKERS = ['', '拾', '百', '阡'];
/** The units of the four-digit groups: 10⁴, 10⁸ and 10¹². The formal 萬 is
 *  the daiji of 万; 億 and 兆 have none. */
const INFORMAL_GROUP_UNITS = ['', '万', '億', '兆'];
const FORMAL_GROUP_UNITS = ['', '萬', '億', '兆'];
/** Past this (and past `Number.MAX_SAFE_INTEGER`, which is smaller) the
 *  numerals print in digits, as the Chinese longhand does. */
const MAX_JAPANESE = 10 ** 16 - 1;

/** One group of up to four digits (1–9999), by the additive symbol table of
 *  CSS Counter Styles 3: each non-zero digit with its marker, zeros left
 *  out; the informal style drops a 1 before its marker (十, 百, 千 — but 一
 *  alone), the formal style keeps it (壱拾, 壱百, 壱阡). */
function groupText(g: number, kind: 'informal' | 'formal'): string {
  const digits = kind === 'formal' ? FORMAL_DIGITS : INFORMAL_DIGITS;
  const markers = kind === 'formal' ? FORMAL_MARKERS : INFORMAL_MARKERS;
  let out = '';
  for (let pos = 3; pos >= 0; pos--) {
    const d = Math.floor(g / 10 ** pos) % 10;
    if (d === 0) continue;
    out += (d === 1 && pos > 0 && kind === 'informal' ? '' : digits[d]!) + markers[pos]!;
  }
  return out;
}

/**
 * `n` (a positive integer) in Japanese counted numerals. CSS Counter Styles 3
 * defines `japanese-informal` and `japanese-formal` up to 9 999; past it,
 * as ja-typography §9 (c) asks, the number goes on in four-digit groups
 * with the units 万 億 兆 (formal 萬 億 兆), each group written as a number
 * of its own and empty groups left out: 一万 (10 000), 一万一 (10 001),
 * 十一万 (110 000), 一億一万 (100 010 000); formal 壱萬, 壱億壱萬. A
 * group keeps its 一 before a unit (一万, never 万) but not before 十百千
 * (千万 for 10 000 000, the per-group reading). Past 10¹⁶ − 1 the number
 * prints in digits.
 */
export function japaneseNumeral(n: number, kind: 'informal' | 'formal'): string {
  if (!Number.isSafeInteger(n) || n < 1 || n > MAX_JAPANESE) return String(n);
  const units = kind === 'formal' ? FORMAL_GROUP_UNITS : INFORMAL_GROUP_UNITS;
  let out = '';
  let i = 0;
  for (let x = n; x > 0; x = Math.floor(x / 10_000), i++) {
    const g = x % 10_000;
    if (g === 0) continue;
    out = groupText(g, kind) + units[i]! + out;
  }
  return out;
}

/** The zero of each counted style: 〇 (U+3007) informal, 零 formal. */
export function japaneseZero(kind: 'informal' | 'formal'): string {
  return kind === 'formal' ? '零' : '〇';
}

/** The 48 kana of the gojūon order as CSS `hiragana` lists them (the
 *  modern 46 plus the obsolete ゐ ゑ, which the CSS series keeps): the five
 *  vowels, the k s t n h m rows, や ゆ よ, the r row, then わ ゐ ゑ を ん. */
export const HIRAGANA: readonly string[] = [...'あいうえおかきくけこさしすせそたちつてとなにぬねのはひふへほまみむめもやゆよらりるれろわゐゑをん'];
/** The same 48 in katakana (`katakana`): ア … ワ ヰ ヱ ヲ ン. */
export const KATAKANA: readonly string[] = [...'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヰヱヲン'];
/** The 47 kana of the iroha poem, each once (`hiragana-iroha`): no ん. */
export const HIRAGANA_IROHA: readonly string[] = [...'いろはにほへとちりぬるをわかよたれそつねならむうゐのおくやまけふこえてあさきゆめみしゑひもせす'];
/** The iroha in katakana (`katakana-iroha`): イ ロ ハ … セ ス. */
export const KATAKANA_IROHA: readonly string[] = [...'イロハニホヘトチリヌルヲワカヨタレソツネナラムウヰノオクヤマケフコエテアサキユメミシヱヒモセス'];

/**
 * The `n`th marker of a kana series, by the CSS `alphabetic` system (the
 * bijective rule of `lower-alpha`): past the last kana the series goes on
 * in two (hiragana: ん is 48, ああ 49, あい 50; iroha: す is 47, いい 48),
 * then three. Zero and below print nothing: the system has no zero.
 */
export function kanaSeries(n: number, symbols: readonly string[]): string {
  if (!Number.isSafeInteger(n) || n < 1) return '';
  let s = '';
  for (let x = n; x > 0; x = Math.floor(x / symbols.length)) {
    x -= 1;
    s = symbols[x % symbols.length]! + s;
  }
  return s;
}
