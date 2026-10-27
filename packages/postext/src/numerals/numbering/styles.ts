// Numeral and counter style names (#1278: split out of numbering.ts).


/** The East Asian numeral styles, named as in CSS Counter Styles 3: Chinese
 *  numerals in the informal (一百二十) and formal (壹佰贰拾) longhand of
 *  either script, Japanese counted numerals (`japanese-informal` 百二十,
 *  `japanese-formal` 壱百弐拾), the kana series in gojūon (`hiragana`
 *  あいう, `katakana` アイウ) and iroha order (`hiragana-iroha` いろは,
 *  `katakana-iroha` イロハ), digit by digit (`cjk-decimal`, 二〇二六), the
 *  heavenly stems (甲乙丙) and earthly branches (子丑寅), circled (①) and
 *  fullwidth (１２３) digits. Every numbering setting takes them. */
export type EastAsianNumeralStyle =
  | 'simp-chinese-informal'
  | 'trad-chinese-informal'
  | 'simp-chinese-formal'
  | 'trad-chinese-formal'
  | 'japanese-informal'
  | 'japanese-formal'
  | 'hiragana'
  | 'katakana'
  | 'hiragana-iroha'
  | 'katakana-iroha'
  | 'cjk-decimal'
  | 'cjk-heavenly-stem'
  | 'cjk-earthly-branch'
  | 'circled-decimal'
  | 'fullwidth-decimal';

/** Every {@link EastAsianNumeralStyle}, in the order a picker lists them. */
export const EAST_ASIAN_NUMERAL_STYLES: readonly EastAsianNumeralStyle[] = Object.freeze([
  'simp-chinese-informal',
  'trad-chinese-informal',
  'simp-chinese-formal',
  'trad-chinese-formal',
  'japanese-informal',
  'japanese-formal',
  'hiragana',
  'katakana',
  'hiragana-iroha',
  'katakana-iroha',
  'cjk-decimal',
  'cjk-heavenly-stem',
  'cjk-earthly-branch',
  'circled-decimal',
  'fullwidth-decimal',
] as const);

/** The Arabic-script numeral styles: the Arabic-Indic digits of the
 *  Mashriq (`arabic-indic`, ١٢٣) and the Extended Arabic-Indic digits of
 *  Persian and Urdu (`persian`, ۱۲۳), named as in CSS Counter Styles 3; the
 *  additive abjad numerals of Classical Arabic (`arabic-abjad`, يا = 11)
 *  and their Maghrebi values (`arabic-abjad-maghrebi`); and the letter
 *  series of list items, in abjad order (`abjad`: أ ب ج د هـ) and in
 *  alphabetical order (`hijai`: أ ب ت ث). `'arabic'` is not among them: it
 *  has always meant the European decimal digits. */
export type ArabicNumeralStyle =
  | 'arabic-indic'
  | 'persian'
  | 'arabic-abjad'
  | 'arabic-abjad-maghrebi'
  | 'abjad'
  | 'hijai';

/** Every {@link ArabicNumeralStyle}, in the order a picker lists them. */
export const ARABIC_NUMERAL_STYLES: readonly ArabicNumeralStyle[] = Object.freeze([
  'arabic-indic',
  'persian',
  'abjad',
  'hijai',
  'arabic-abjad',
  'arabic-abjad-maghrebi',
] as const);

export type NumeralStyle =
  | 'decimal'
  | 'decimal-02'
  | 'upper-alpha'
  | 'lower-alpha'
  | 'upper-roman'
  | 'lower-roman'
  | EastAsianNumeralStyle
  | ArabicNumeralStyle;

type SpelledBase = 'words' | 'Words' | 'WORDS' | 'ordinal' | 'Ordinal' | 'ORDINAL';

/** A counter spelled out in words (heading templates only): cardinal
 *  (`words`) or ordinal (`ordinal`), the case of the suffix picking the
 *  case of the words — `{1:words}` "twenty-one", `{1:Words}` "Twenty-one",
 *  `{1:WORDS}` "TWENTY-ONE". Modifiers after a hyphen choose the gender
 *  and the spelling of a language that inflects them:
 *  `{1:ordinal-feminine}` (or `-f`) الأولى, «prima», « première »,
 *  `-masculine` (`-m`, the default) الأول, «primo»; `-neuter` (`-n`) the
 *  German „erstes“ (`-m` „erster“, `-f` „erste“; none, the „erste“ after
 *  the article); `-classical` مائة for مئة (Arabic);
 *  `{1:ordinal-f-classical}` combines them. Other languages ignore the
 *  modifiers. */
export type SpelledNumeralStyle = SpelledBase | `${SpelledBase}-${string}`;

/** Format of a counter in a heading numbering template. */
export type CounterStyle = NumeralStyle | SpelledNumeralStyle;

export type Token =
  | { kind: 'literal'; text: string }
  | { kind: 'counter'; level: number; style: CounterStyle };

export const STYLE_ALIASES: Record<string, NumeralStyle> = {
  '1': 'decimal',
  decimal: 'decimal',
  '01': 'decimal-02',
  'decimal-02': 'decimal-02',
  A: 'upper-alpha',
  'upper-alpha': 'upper-alpha',
  a: 'lower-alpha',
  'lower-alpha': 'lower-alpha',
  I: 'upper-roman',
  'upper-roman': 'upper-roman',
  i: 'lower-roman',
  'lower-roman': 'lower-roman',
};

/** The numeral styles a format field can name: every {@link NumeralStyle}
 *  but the template-only zero-padded `decimal-02`. */
export type NumberFormatStyle = Exclude<NumeralStyle, 'decimal-02'>;
