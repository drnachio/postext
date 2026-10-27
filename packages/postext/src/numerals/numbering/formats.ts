// Number format names and tokens, and their parse into counter styles
// (#1278: split out of numbering.ts).
import type { OrderedListNumberFormat } from '../../types.js';
import { localeScript, languageOf } from '../../hyphenation/locale.js';
import { type NumberFormatStyle, EAST_ASIAN_NUMERAL_STYLES, ARABIC_NUMERAL_STYLES } from './styles.js';

/** Every spelling of a numbering format the engine accepts, lower-cased.
 *  Three configuration vocabularies grew apart — page labels and
 *  `:::numbering` say `lower-roman`, resource counters `roman-lower`, lists
 *  `arabic` for decimal — and CSS adds `lower-latin`; each field takes all
 *  of them. */
const NUMBER_FORMAT_NAMES: ReadonlyMap<string, NumberFormatStyle> = new Map<string, NumberFormatStyle>([
  ['decimal', 'decimal'],
  ['arabic', 'decimal'],
  ['lower-roman', 'lower-roman'],
  ['roman-lower', 'lower-roman'],
  ['upper-roman', 'upper-roman'],
  ['roman-upper', 'upper-roman'],
  ['lower-alpha', 'lower-alpha'],
  ['alpha-lower', 'lower-alpha'],
  ['lower-latin', 'lower-alpha'],
  ['upper-alpha', 'upper-alpha'],
  ['alpha-upper', 'upper-alpha'],
  ['upper-latin', 'upper-alpha'],
  ...EAST_ASIAN_NUMERAL_STYLES.map((name): [string, NumberFormatStyle] => [name, name]),
  // CSS keeps `cjk-ideographic` as another name of the traditional informal.
  ['cjk-ideographic', 'trad-chinese-informal'],
  ...ARABIC_NUMERAL_STYLES.map((name): [string, NumberFormatStyle] => [name, name]),
  // The W3C "Ready-made Counter Styles" names: `urdu` is `persian` with a
  // suffix of its own (a numbering format carries none), and
  // `maghrebi-abjad` the Maghrebi values. Their `arabic-abjad` is a
  // 28-letter series where 11 is ك; here it is the additive numeral (11
  // يا), as in Arabic books, and the series is `abjad`.
  ['urdu', 'persian'],
  ['maghrebi-abjad', 'arabic-abjad-maghrebi'],
  ['arabic-alpha', 'hijai'],
  ['arabic-alphabetic', 'hijai'],
]);

/** The one-character tokens of the heading templates (`{1:i}`), which the
 *  format fields accept as well. Case-sensitive: `i` and `I` differ. The
 *  Chinese tokens `一` and `壹` are read apart: they follow the document's
 *  language and script (see {@link parseNumberFormat}). Each kana token is
 *  the first of its series: あ and ア open the gojūon, い and イ the iroha
 *  (い is the second gojūon kana, never a series of its own). */
const NUMBER_FORMAT_TOKENS: ReadonlyMap<string, NumberFormatStyle> = new Map<string, NumberFormatStyle>([
  ['1', 'decimal'],
  ['i', 'lower-roman'],
  ['I', 'upper-roman'],
  ['a', 'lower-alpha'],
  ['A', 'upper-alpha'],
  ['〇', 'cjk-decimal'],
  ['①', 'circled-decimal'],
  ['甲', 'cjk-heavenly-stem'],
  ['子', 'cjk-earthly-branch'],
  ['１', 'fullwidth-decimal'],
  ['壱', 'japanese-formal'],
  ['あ', 'hiragana'],
  ['ア', 'katakana'],
  ['い', 'hiragana-iroha'],
  ['イ', 'katakana-iroha'],
  // A single أ cannot tell the two Arabic letter series apart: their first
  // letters name them (أبجد, أبتث).
  ['١', 'arabic-indic'],
  ['۱', 'persian'],
  ['أبجد', 'abjad'],
  ['أبتث', 'hijai'],
]);

/** Whether `locale` is written in Traditional characters (`zh-Hant`,
 *  `zh-TW`, `zh-HK`…). */
function traditional(locale: string | undefined): boolean {
  return localeScript(locale) === 'Hant';
}

/** The informal Chinese style of a document's script: `trad-chinese-informal`
 *  for a Traditional tag, else `simp-chinese-informal`. What spelled-out
 *  Chinese numbers use. */
export function chineseInformalStyle(locale?: string): 'simp-chinese-informal' | 'trad-chinese-informal' {
  return traditional(locale) ? 'trad-chinese-informal' : 'simp-chinese-informal';
}

/** Whether `locale` is Japanese (`ja`, `ja-JP`, `ja-Jpan`…), by its
 *  language subtag. */
function japanese(locale: string | undefined): boolean {
  return languageOf(locale) === 'ja';
}

/** The counted kanji numerals of a document's language: `japanese-informal`
 *  for a Japanese tag (百一, ja-typography §9), else the informal Chinese
 *  style of its script (一百零一). What `{1:一}` and the `{numberHan}`
 *  placeholder write. */
export function hanInformalStyle(locale?: string): 'japanese-informal' | 'simp-chinese-informal' | 'trad-chinese-informal' {
  return japanese(locale) ? 'japanese-informal' : chineseInformalStyle(locale);
}

/**
 * The numeral style a numbering-format value names, in any of the
 * spellings the engine accepts (see `NUMBER_FORMAT_NAMES`: `decimal` /
 * `arabic`, `lower-roman` / `roman-lower` / `i`, `upper-alpha` /
 * `alpha-upper` / `upper-latin` / `A`, the CSS names of the East Asian
 * styles and their one-character tokens `〇`, `①`, `甲`, `子`, `１`…, the
 * Japanese tokens `壱`, `あ`, `ア`, `い`, `イ`, the Arabic styles and their
 * tokens `١`, `۱`, `أبجد`, `أبتث`; names are case-insensitive). `一` names
 * the counted numerals of the document's language: `japanese-informal`
 * when `locale` is Japanese, else the informal Chinese of its script. `壹`
 * names the formal Chinese numerals of the script (Japanese daiji are
 * `壱`). The script is Traditional when `locale` is (`zh-Hant`, `zh-TW`…),
 * else Simplified. `undefined` for anything else — the caller numbers in
 * decimal.
 */
export function parseNumberFormat(value: unknown, locale?: string): NumberFormatStyle | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (v === '一') return hanInformalStyle(locale);
  if (v === '壹') return traditional(locale) ? 'trad-chinese-formal' : 'simp-chinese-formal';
  return NUMBER_FORMAT_TOKENS.get(v) ?? NUMBER_FORMAT_NAMES.get(v.toLowerCase());
}

/** A numeral style in the ordered-list vocabulary (`arabic` for decimal). */
export function toOrderedListNumberFormat(style: NumberFormatStyle): OrderedListNumberFormat {
  return style === 'decimal' ? 'arabic' : style;
}
