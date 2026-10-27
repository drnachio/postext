// Counter styles, spelled numbers, templates and formatNumeral
// (#1278: split out of numbering.ts).
import { type NumberWordsOptions, type WordsCase, caseWords, numberToWords } from '../numberWords.js';
import type { DigitSystem } from '../../types.js';
import { chineseNumeral, cjkDecimal, fixedSymbol, CJK_HEAVENLY_STEMS, CJK_EARTHLY_BRANCHES, circledDecimal, fullwidthDecimal } from '../chineseNumerals.js';
import { japaneseZero, japaneseNumeral, kanaSeries, HIRAGANA, KATAKANA, HIRAGANA_IROHA, KATAKANA_IROHA } from '../japaneseNumerals.js';
import { withDigits, arabicIndicDecimal, persianDecimal, abjadNumeral, arabicLettering, ABJAD_LETTERS, HIJAI_LETTERS } from '../arabicNumerals.js';
import { parseNumberFormat } from './formats.js';
import { type NumeralStyle, STYLE_ALIASES, type CounterStyle, type SpelledNumeralStyle, type Token } from './styles.js';

/** A template token's style: its own alias, else any format-field
 *  spelling (`{1:roman-lower}`, `{1:一}` in the script of `locale`), else
 *  decimal. */
function templateStyle(raw: string, locale?: string): NumeralStyle {
  const s = raw.trim();
  return Object.prototype.hasOwnProperty.call(STYLE_ALIASES, s) ? STYLE_ALIASES[s]! : parseNumberFormat(s, locale) ?? 'decimal';
}

const SPELLED_STYLES = new Set<string>(['words', 'Words', 'WORDS', 'ordinal', 'Ordinal', 'ORDINAL']);

/** The modifiers a spelled style takes, lower-cased, and what each sets. */
const SPELLED_MODIFIERS: Readonly<Record<string, NumberWordsOptions>> = {
  f: { gender: 'feminine' },
  feminine: { gender: 'feminine' },
  m: { gender: 'masculine' },
  masculine: { gender: 'masculine' },
  n: { gender: 'neuter' },
  neuter: { gender: 'neuter' },
  classical: { spelling: 'classical' },
  modern: { spelling: 'modern' },
};

interface SpelledStyle {
  kind: 'cardinal' | 'ordinal';
  wordsCase: WordsCase;
  options: NumberWordsOptions;
}

/** What a spelled style token says (`Ordinal-feminine` → an ordinal, first
 *  letter capital, feminine); `undefined` when the token is not one — an
 *  unknown modifier included. */
function parseSpelledStyle(token: string): SpelledStyle | undefined {
  const [base, ...mods] = token.split('-');
  if (base === undefined || !SPELLED_STYLES.has(base)) return undefined;
  let options: NumberWordsOptions = {};
  for (const mod of mods) {
    const set = SPELLED_MODIFIERS[mod.toLowerCase()];
    if (!set) return undefined;
    options = { ...options, ...set };
  }
  return {
    kind: base.toLowerCase() === 'ordinal' ? 'ordinal' : 'cardinal',
    wordsCase: base === base.toUpperCase() ? 'upper' : base[0] === base[0]!.toUpperCase() ? 'capital' : 'lower',
    options,
  };
}

/** The style a template token names after its colon (`{1:A}`, `{h1:A}`,
 *  `{n:i}`): the short aliases, any numbering-format name or one-character
 *  token, a spelled style. None, or one the engine does not know, counts
 *  in decimal. Heading templates and resource templates share it (#730). */
export function counterStyleOf(raw: string | undefined, locale?: string): CounterStyle {
  if (!raw) return 'decimal';
  const key = raw.trim();
  if (parseSpelledStyle(key)) return key as SpelledNumeralStyle;
  return templateStyle(key, locale);
}

/** Whether `raw` names a style {@link counterStyleOf} knows (rather than
 *  one it counts in decimal for want of another). */
export function isCounterStyle(raw: string): boolean {
  const key = raw.trim();
  return parseSpelledStyle(key) !== undefined || Object.prototype.hasOwnProperty.call(STYLE_ALIASES, key) || parseNumberFormat(key) !== undefined;
}

/** A counter value in a template style; spelled-out styles use the
 *  document language `locale`, decimal ones the document's `digits`. */
export function formatCounter(n: number, style: CounterStyle, locale?: string, digits?: DigitSystem): string {
  const spelled = parseSpelledStyle(style);
  if (!spelled) return formatNumeral(n, style as NumeralStyle, digits);
  if (n <= 0) return '';
  return caseWords(numberToWords(n, spelled.kind, locale, spelled.options), spelled.wordsCase, locale);
}

/** The tokens of a numbering template. `locale` (the document language)
 *  decides the numerals of the `{1:一}` token (Japanese or the Chinese of
 *  its script) and the script of `{1:壹}`. */
export function parseTemplate(tpl: string, locale?: string): Token[] {
  const tokens: Token[] = [];
  let buf = '';
  let i = 0;
  const flush = () => {
    if (buf.length > 0) {
      tokens.push({ kind: 'literal', text: buf });
      buf = '';
    }
  };
  while (i < tpl.length) {
    const ch = tpl[i]!;
    if (ch === '\\' && i + 1 < tpl.length) {
      const next = tpl[i + 1]!;
      if (next === '{' || next === '}' || next === '\\') {
        buf += next;
        i += 2;
        continue;
      }
    }
    if (ch === '{') {
      const end = tpl.indexOf('}', i + 1);
      if (end === -1) {
        buf += ch;
        i++;
        continue;
      }
      const body = tpl.slice(i + 1, end);
      const [rawLevel, rawStyle] = body.split(':');
      const level = Number(rawLevel);
      if (Number.isInteger(level) && level >= 1 && level <= 6) {
        const style = counterStyleOf(rawStyle, locale);
        flush();
        tokens.push({ kind: 'counter', level, style });
        i = end + 1;
        continue;
      }
      buf += ch;
      i++;
      continue;
    }
    buf += ch;
    i++;
  }
  flush();
  return tokens;
}

function toUpperAlpha(n: number): string {
  if (n <= 0) return '';
  let s = '';
  let x = n;
  while (x > 0) {
    x -= 1;
    s = String.fromCharCode(65 + (x % 26)) + s;
    x = Math.floor(x / 26);
  }
  return s;
}

function toRoman(n: number): string {
  if (n <= 0) return '';
  const table: Array<[number, string]> = [
    [1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'],
    [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'],
    [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I'],
  ];
  let x = n;
  let s = '';
  for (const [val, sym] of table) {
    while (x >= val) {
      s += sym;
      x -= val;
    }
  }
  return s;
}

/**
 * The style a document writes `style` in: `decimal` takes the document's
 * digit system (`'arab'` → `arabic-indic`, `'arabext'` → `persian`); every
 * other style, and every style in a `'latn'` document, is kept. What a
 * page label records as its format, so that the PDF's `/PageLabels` and a
 * book's next chapter see the digits the page prints.
 */
export function documentNumeralStyle<S extends NumeralStyle>(style: S, digits: DigitSystem | undefined): S | 'arabic-indic' | 'persian' {
  if (style !== 'decimal' || !digits || digits === 'latn') return style;
  return digits === 'arab' ? 'arabic-indic' : 'persian';
}

/**
 * `n` in `style`. `digits`, the document's digit system, writes the
 * decimal styles (`decimal`, `decimal-02`) in Arabic-Indic or Persian
 * digits; a style the author names is printed as named.
 */
export function formatNumeral(n: number, style: NumeralStyle, digits?: DigitSystem): string {
  if (digits !== undefined && digits !== 'latn' && (style === 'decimal' || style === 'decimal-02')) {
    return withDigits(formatNumeral(n, style), digits);
  }
  if (n === 0) {
    // The positional East Asian styles have a zero; the others print
    // nothing for it, as before.
    switch (style) {
      case 'simp-chinese-informal':
      case 'trad-chinese-informal':
      case 'simp-chinese-formal':
      case 'trad-chinese-formal':
        return '零';
      case 'japanese-informal':
        return japaneseZero('informal');
      case 'japanese-formal':
        return japaneseZero('formal');
      case 'cjk-decimal':
        return '〇';
      case 'circled-decimal':
        return '⓪';
      case 'fullwidth-decimal':
        return '０';
      case 'arabic-indic':
        return '٠';
      case 'persian':
        return '۰';
      default:
        return '';
    }
  }
  if (n < 0) return '';
  switch (style) {
    case 'decimal':
      return String(n);
    case 'decimal-02':
      return n < 10 ? `0${n}` : String(n);
    case 'upper-alpha':
      return toUpperAlpha(n);
    case 'lower-alpha':
      return toUpperAlpha(n).toLowerCase();
    case 'upper-roman':
      return toRoman(n);
    case 'lower-roman':
      return toRoman(n).toLowerCase();
    case 'simp-chinese-informal':
      return chineseNumeral(n, 'informal', false);
    case 'trad-chinese-informal':
      return chineseNumeral(n, 'informal', true);
    case 'simp-chinese-formal':
      return chineseNumeral(n, 'formal', false);
    case 'trad-chinese-formal':
      return chineseNumeral(n, 'formal', true);
    case 'japanese-informal':
      return japaneseNumeral(n, 'informal');
    case 'japanese-formal':
      return japaneseNumeral(n, 'formal');
    case 'hiragana':
      return kanaSeries(n, HIRAGANA);
    case 'katakana':
      return kanaSeries(n, KATAKANA);
    case 'hiragana-iroha':
      return kanaSeries(n, HIRAGANA_IROHA);
    case 'katakana-iroha':
      return kanaSeries(n, KATAKANA_IROHA);
    case 'cjk-decimal':
      return cjkDecimal(n);
    case 'cjk-heavenly-stem':
      return fixedSymbol(n, CJK_HEAVENLY_STEMS);
    case 'cjk-earthly-branch':
      return fixedSymbol(n, CJK_EARTHLY_BRANCHES);
    case 'circled-decimal':
      return circledDecimal(n);
    case 'fullwidth-decimal':
      return fullwidthDecimal(n);
    case 'arabic-indic':
      return arabicIndicDecimal(n);
    case 'persian':
      return persianDecimal(n);
    case 'arabic-abjad':
      return abjadNumeral(n, 'mashriqi');
    case 'arabic-abjad-maghrebi':
      return abjadNumeral(n, 'maghrebi');
    case 'abjad':
      return arabicLettering(n, ABJAD_LETTERS);
    case 'hijai':
      return arabicLettering(n, HIJAI_LETTERS);
    default:
      // A style from outside the type (a hand-written config, a stale
      // continuation) numbers in decimal rather than printing "undefined".
      return String(n);
  }
}

/** A pre-resolved template piece fed to {@link renderCounterTemplate}. A
 *  `counter` piece whose `text` is empty is treated as a "missing" counter and
 *  triggers separator collapsing — its adjacent literal separator is dropped so
 *  the rendered string never carries dangling punctuation. */
export type RenderPiece =
  | { kind: 'literal'; text: string }
  | { kind: 'counter'; text: string };

/** Shared template renderer used by both heading and resource numbering. Joins
 *  the pieces in order, dropping a literal separator that sits next to an empty
 *  counter so a missing leading/trailing counter doesn't leave orphan
 *  punctuation (e.g. `{h1}.{n}` with no h1 renders as `1`, not `.1`). */
export function renderCounterTemplate(pieces: RenderPiece[]): string {
  // Work on a shallow copy so the collapsing logic can blank neighbouring
  // literals without mutating the caller's array.
  const work: RenderPiece[] = pieces.map((p) => ({ ...p }));
  let out = '';
  for (let i = 0; i < work.length; i++) {
    const p = work[i]!;
    if (p.kind === 'counter' && p.text === '') {
      const prev = out;
      const next = work[i + 1];
      if (next && next.kind === 'literal') {
        work[i + 1] = { kind: 'literal', text: '' };
        continue;
      }
      if (prev.length > 0 && work[i - 1]?.kind === 'literal') {
        // Punctuation and spaces go; letters and numerals of any script
        // stay (第 before a missing counter is text, not a separator).
        out = out.replace(/[^\p{L}\p{N}]+$/u, '');
      }
      continue;
    }
    out += p.text;
  }
  return out;
}

export function renderTemplate(
  tokens: Token[],
  counters: number[],
  currentLevel: number,
  locale?: string,
  digits?: DigitSystem,
): string {
  const pieces: RenderPiece[] = [];
  for (const t of tokens) {
    if (t.kind === 'literal') {
      pieces.push({ kind: 'literal', text: t.text });
      continue;
    }
    if (t.level > currentLevel) continue;
    const value = counters[t.level] ?? 0;
    const rendered = value > 0 ? formatCounter(value, t.style, locale, digits) : '';
    pieces.push({ kind: 'counter', text: rendered });
  }
  return renderCounterTemplate(pieces);
}
