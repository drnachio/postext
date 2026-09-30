import type { ContentBlock } from './parse';
import { caseWords, numberToWords, type WordsCase } from './numberWords';
import type { OrderedListNumberFormat } from './types';
import { localeScript } from './locale';
import { chineseNumeral, cjkDecimal, circledDecimal, fullwidthDecimal, fixedSymbol, CJK_HEAVENLY_STEMS, CJK_EARTHLY_BRANCHES } from './chineseNumerals';

/** The East Asian numeral styles, named as in CSS Counter Styles 3: Chinese
 *  numerals in the informal (一百二十) and formal (壹佰贰拾) longhand of
 *  either script, digit by digit (`cjk-decimal`, 二〇二六), the heavenly
 *  stems (甲乙丙) and earthly branches (子丑寅), circled (①) and fullwidth
 *  (１２３) digits. Every numbering setting takes them. */
export type EastAsianNumeralStyle =
  | 'simp-chinese-informal'
  | 'trad-chinese-informal'
  | 'simp-chinese-formal'
  | 'trad-chinese-formal'
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
  'cjk-decimal',
  'cjk-heavenly-stem',
  'cjk-earthly-branch',
  'circled-decimal',
  'fullwidth-decimal',
] as const);

export type NumeralStyle =
  | 'decimal'
  | 'decimal-02'
  | 'upper-alpha'
  | 'lower-alpha'
  | 'upper-roman'
  | 'lower-roman'
  | EastAsianNumeralStyle;

/** A counter spelled out in words (heading templates only): cardinal
 *  (`words`) or ordinal (`ordinal`), the case of the suffix picking the
 *  case of the words — `{1:words}` "twenty-one", `{1:Words}` "Twenty-one",
 *  `{1:WORDS}` "TWENTY-ONE". */
export type SpelledNumeralStyle = 'words' | 'Words' | 'WORDS' | 'ordinal' | 'Ordinal' | 'ORDINAL';

/** Format of a counter in a heading numbering template. */
export type CounterStyle = NumeralStyle | SpelledNumeralStyle;

type Token =
  | { kind: 'literal'; text: string }
  | { kind: 'counter'; level: number; style: CounterStyle };

const STYLE_ALIASES: Record<string, NumeralStyle> = {
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
]);

/** The one-character tokens of the heading templates (`{1:i}`), which the
 *  format fields accept as well. Case-sensitive: `i` and `I` differ. The
 *  Chinese tokens `一` and `壹` are read apart: they follow the document's
 *  script (see {@link parseNumberFormat}). */
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
]);

/** Whether `locale` is written in Traditional characters (`zh-Hant`,
 *  `zh-TW`, `zh-HK`…). */
function traditional(locale: string | undefined): boolean {
  return localeScript(locale) === 'Hant';
}

/** The informal Chinese style of a document's script: `trad-chinese-informal`
 *  for a Traditional tag, else `simp-chinese-informal`. What `{1:一}`, the
 *  `{numberHan}` placeholder and spelled-out Chinese numbers use. */
export function chineseInformalStyle(locale?: string): 'simp-chinese-informal' | 'trad-chinese-informal' {
  return traditional(locale) ? 'trad-chinese-informal' : 'simp-chinese-informal';
}

/**
 * The numeral style a numbering-format value names, in any of the
 * spellings the engine accepts (see `NUMBER_FORMAT_NAMES`: `decimal` /
 * `arabic`, `lower-roman` / `roman-lower` / `i`, `upper-alpha` /
 * `alpha-upper` / `upper-latin` / `A`, the CSS names of the East Asian
 * styles and their one-character tokens `〇`, `①`, `甲`, `子`, `１`…; names
 * are case-insensitive). `一` and `壹` name the informal and formal Chinese
 * numerals of the document's script: Traditional when `locale` is
 * (`zh-Hant`, `zh-TW`…), else Simplified. `undefined` for anything else —
 * the caller numbers in decimal.
 */
export function parseNumberFormat(value: unknown, locale?: string): NumberFormatStyle | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim();
  if (v === '一') return chineseInformalStyle(locale);
  if (v === '壹') return traditional(locale) ? 'trad-chinese-formal' : 'simp-chinese-formal';
  return NUMBER_FORMAT_TOKENS.get(v) ?? NUMBER_FORMAT_NAMES.get(v.toLowerCase());
}

/** A numeral style in the ordered-list vocabulary (`arabic` for decimal). */
export function toOrderedListNumberFormat(style: NumberFormatStyle): OrderedListNumberFormat {
  return style === 'decimal' ? 'arabic' : style;
}

/** A template token's style: its own alias, else any format-field
 *  spelling (`{1:roman-lower}`, `{1:一}` in the script of `locale`), else
 *  decimal. */
function templateStyle(raw: string, locale?: string): NumeralStyle {
  const s = raw.trim();
  return Object.prototype.hasOwnProperty.call(STYLE_ALIASES, s) ? STYLE_ALIASES[s]! : parseNumberFormat(s, locale) ?? 'decimal';
}

const SPELLED_STYLES = new Set<string>(['words', 'Words', 'WORDS', 'ordinal', 'Ordinal', 'ORDINAL']);

function counterStyleOf(raw: string | undefined, locale?: string): CounterStyle {
  if (!raw) return 'decimal';
  const key = raw.trim();
  if (SPELLED_STYLES.has(key)) return key as SpelledNumeralStyle;
  return templateStyle(key, locale);
}

/** A counter value in a template style; spelled-out styles use the
 *  document language `locale`. */
export function formatCounter(n: number, style: CounterStyle, locale?: string): string {
  if (!SPELLED_STYLES.has(style)) return formatNumeral(n, style as NumeralStyle);
  if (n <= 0) return '';
  const kind = style.toLowerCase() === 'ordinal' ? 'ordinal' : 'cardinal';
  const wordsCase: WordsCase = style === style.toUpperCase() ? 'upper' : style[0] === style[0]!.toUpperCase() ? 'capital' : 'lower';
  return caseWords(numberToWords(n, kind, locale), wordsCase, locale);
}

/** The tokens of a numbering template. `locale` (the document language)
 *  decides the script of the `{1:一}` and `{1:壹}` tokens. */
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

export function formatNumeral(n: number, style: NumeralStyle): string {
  if (n === 0) {
    // The positional East Asian styles have a zero; the others print
    // nothing for it, as before.
    switch (style) {
      case 'simp-chinese-informal':
      case 'trad-chinese-informal':
      case 'simp-chinese-formal':
      case 'trad-chinese-formal':
        return '零';
      case 'cjk-decimal':
        return '〇';
      case 'circled-decimal':
        return '⓪';
      case 'fullwidth-decimal':
        return '０';
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

function renderTemplate(
  tokens: Token[],
  counters: number[],
  currentLevel: number,
  locale?: string,
): string {
  const pieces: RenderPiece[] = [];
  for (const t of tokens) {
    if (t.kind === 'literal') {
      pieces.push({ kind: 'literal', text: t.text });
      continue;
    }
    if (t.level > currentLevel) continue;
    const value = counters[t.level] ?? 0;
    const rendered = value > 0 ? formatCounter(value, t.style, locale) : '';
    pieces.push({ kind: 'counter', text: rendered });
  }
  return renderCounterTemplate(pieces);
}

export type HeadingTemplates = Partial<Record<1 | 2 | 3 | 4 | 5 | 6, string>>;

// ---------------------------------------------------------------------------
// Page-level numbering sequencer
// ---------------------------------------------------------------------------

/** A switch in the page-numbering sequence. At `startPageIndex`, the
 *  (optional) `format` and/or (optional) `startAt` take effect.
 *  A `format`-only segment keeps the counter flowing; a `startAt`-only
 *  segment resets the counter without changing the format. The first
 *  segment (typically pushed from `cfg.page.pageNumbering`) must set both
 *  and have `startPageIndex === 0`. */
export interface PageNumberSegment {
  startPageIndex: number;
  format?: NumeralStyle;
  startAt?: number;
}

export interface PageLabelInfo {
  value: number;
  label: string;
  format: NumeralStyle;
}

/** Assign (format, numeric value, rendered label) to every page.
 *
 *  Segments must be sorted by `startPageIndex`. The first segment is
 *  treated as the document-wide default and must define both `format`
 *  and `startAt`. Later segments with an omitted field carry over the
 *  previous one. */
export function buildPageLabels(
  pageCount: number,
  segments: PageNumberSegment[],
): PageLabelInfo[] {
  if (pageCount <= 0) return [];
  if (segments.length === 0) {
    // Defensive default — behave as a plain decimal-from-1 sequence.
    return Array.from({ length: pageCount }, (_, i) => ({
      value: i + 1,
      label: String(i + 1),
      format: 'decimal' as NumeralStyle,
    }));
  }
  const sorted = [...segments].sort((a, b) => a.startPageIndex - b.startPageIndex);
  const out: PageLabelInfo[] = new Array(pageCount);

  let curFormat: NumeralStyle = sorted[0]!.format ?? 'decimal';
  let curValue: number = sorted[0]!.startAt ?? 1;
  let segIdx = 0;
  // Absorb any segments that apply before / at page 0.
  while (segIdx < sorted.length && sorted[segIdx]!.startPageIndex <= 0) {
    const s = sorted[segIdx]!;
    if (s.format !== undefined) curFormat = s.format;
    if (s.startAt !== undefined) curValue = s.startAt;
    segIdx++;
  }

  for (let i = 0; i < pageCount; i++) {
    while (segIdx < sorted.length && sorted[segIdx]!.startPageIndex === i) {
      const s = sorted[segIdx]!;
      if (s.format !== undefined) curFormat = s.format;
      if (s.startAt !== undefined) curValue = s.startAt;
      segIdx++;
    }
    const label = formatNumeral(curValue, curFormat);
    out[i] = { value: curValue, label, format: curFormat };
    curValue++;
  }
  return out;
}

/** One contiguous run of pages sharing `(format, counter)`. Boundary rule:
 *  a run starts whenever the format differs from the previous page or the
 *  counter is not exactly `previous + 1`. Feeds the PDF `/PageLabels`
 *  emitter. `maxValue` is the max `value` seen in the run — used by the
 *  PDF backend to detect the alpha-overflow (`>26`) case. */
export interface PageLabelRun {
  startPageIndex: number;
  endPageIndex: number;
  format: NumeralStyle;
  startAt: number;
  maxValue: number;
}

export function collectPageLabelRuns(labels: PageLabelInfo[]): PageLabelRun[] {
  const runs: PageLabelRun[] = [];
  for (let i = 0; i < labels.length; i++) {
    const p = labels[i]!;
    const prev = runs[runs.length - 1];
    if (
      prev
      && prev.format === p.format
      && p.value === prev.startAt + (i - prev.startPageIndex)
    ) {
      prev.endPageIndex = i;
      if (p.value > prev.maxValue) prev.maxValue = p.value;
      continue;
    }
    runs.push({
      startPageIndex: i,
      endPageIndex: i,
      format: p.format,
      startAt: p.value,
      maxValue: p.value,
    });
  }
  return runs;
}

/** Heading counters carried over from preceding content: `[h1..h6]`. */
export type HeadingCounterStart = readonly number[];

/** The value a heading's `startAt` attribute (`# Appendix {startAt=1}`)
 *  sets its level's counter to, in place of advancing it: a positive
 *  integer, else undefined (the attribute is ignored). */
export function headingCounterStart(block: Pick<ContentBlock, 'attrs'>): number | undefined {
  const raw = block.attrs?.startAt;
  if (raw === undefined) return undefined;
  const n = Number(raw);
  return Number.isInteger(n) && n >= 1 ? n : undefined;
}

/** A numbered heading's counter after it: its `startAt`, else one more
 *  than the level's running count. */
export function nextHeadingCounter(block: Pick<ContentBlock, 'attrs'>, current: number): number {
  return headingCounterStart(block) ?? current + 1;
}

export interface HeadingNumberingOptions {
  /** Document language of spelled-out counters (`{1:words}`,
   *  `{1:ordinal}`). English when unset. */
  locale?: string;
  /** A template replacing the level's for one heading (a heading style's
   *  `numberingTemplate`); `undefined` keeps the level's. */
  templateFor?: (block: ContentBlock) => string | undefined;
}

export interface HeadingNumbering {
  /** Rendered number prefix per block index; undefined where none. */
  prefixes: Array<string | undefined>;
  /** Counter value of each numbered heading (its level's running count)
   *  per block index; undefined for other blocks and unnumbered headings. */
  values: Array<number | undefined>;
}

export function computeHeadingNumbering(
  blocks: ContentBlock[],
  templates: HeadingTemplates,
  start?: HeadingCounterStart,
  /** Whether a heading block advances its counter; an unnumbered heading
   *  (a style with `numbered: false`) gets no prefix and counts for nothing.
   *  Every heading is numbered when omitted. */
  isNumbered: (block: ContentBlock) => boolean = () => true,
  options: HeadingNumberingOptions = {},
): HeadingNumbering {
  const counters = [0, 0, 0, 0, 0, 0, 0];
  if (start) for (let lvl = 1; lvl <= 6; lvl++) counters[lvl] = start[lvl - 1] ?? 0;
  const parsed = new Map<string, Token[] | null>();
  const tokensOf = (tpl: string): Token[] | null => {
    let tokens = parsed.get(tpl);
    if (tokens === undefined) {
      tokens = tpl.length > 0 ? parseTemplate(tpl, options.locale) : null;
      parsed.set(tpl, tokens);
    }
    return tokens;
  };
  const prefixes: Array<string | undefined> = new Array(blocks.length);
  const values: Array<number | undefined> = new Array(blocks.length);
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type !== 'heading' || !b.level) continue;
    if (!isNumbered(b)) continue;
    const lvl = b.level;
    counters[lvl] = nextHeadingCounter(b, counters[lvl] ?? 0);
    for (let k = lvl + 1; k <= 6; k++) counters[k] = 0;
    values[i] = counters[lvl];
    const tokens = tokensOf(options.templateFor?.(b) ?? templates[lvl as 1 | 2 | 3 | 4 | 5 | 6] ?? '');
    if (!tokens) continue;
    const rendered = renderTemplate(tokens, counters, lvl, options.locale);
    if (rendered.length > 0) prefixes[i] = rendered;
  }
  return { prefixes, values };
}

/** The rendered number prefix of every heading (see
 *  {@link computeHeadingNumbering}). */
export function computeHeadingNumbers(
  blocks: ContentBlock[],
  templates: HeadingTemplates,
  start?: HeadingCounterStart,
  isNumbered: (block: ContentBlock) => boolean = () => true,
  options?: HeadingNumberingOptions,
): Array<string | undefined> {
  return computeHeadingNumbering(blocks, templates, start, isNumbered, options).prefixes;
}
