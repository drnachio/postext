import type {
  CjkBookTitleMark,
  CjkBracketPair,
  CjkConfig,
  CjkEmphasis,
  CjkEmphasisMarkConfig,
  CjkEmphasisMarkStyle,
  CjkGridConfig,
  CjkHangingPunctuation,
  CjkKuntenConfig,
  CjkKuntenPlacement,
  CjkLineBreak,
  CjkParagraphStartBracket,
  CjkPunctuationWidth,
  CjkRegion,
  CjkRubyAlign,
  CjkRubyConfig,
  CjkRubyOverhang,
  CjkRubyPosition,
  CjkWarichuConfig,
  CjkWordBreak,
  ColorValue,
  Dimension,
  ResolvedCjkConfig,
  ResolvedCjkEmphasisMarkConfig,
  ResolvedCjkGridConfig,
  ResolvedCjkKuntenConfig,
  ResolvedCjkRubyConfig,
  ResolvedCjkWarichuConfig,
} from '../types';
import { cjkRegionOf, isJapaneseLanguage, languageOf } from '../locale';
import { dimensionsEqual } from './shared';

/** `cjk` as written when nothing is set: everything follows the locale
 *  (marks hang in Japan only), lines break between characters (no
 *  `keep-all`), a quarter em between Han and Latin, no grid; readings, warichu notes and kanbun marks at half the text size
 *  (the 返り点 after their character, JIS X 4051 §5.5), warichu brackets
 *  by region (none but in Japan, `defaultCjkWarichuBrackets`), marks in
 *  the text colour (`annotationColor` unset). */
export const DEFAULT_CJK_CONFIG: Required<Omit<CjkConfig, 'annotationColor'>> & Pick<CjkConfig, 'annotationColor'> = {
  region: 'auto',
  lineBreak: 'auto',
  punctuationWidth: 'auto',
  compressAdjacent: 'auto',
  trimLineStart: 'auto',
  hangingPunctuation: 'auto',
  spaceAfterQuestion: 'auto',
  paragraphStartBracket: 'auto',
  wordBreak: 'normal',
  latinSpacing: { value: 0.25, unit: 'em' },
  uprightDigits: 2,
  grid: { enabled: false, show: false },
  emphasis: 'auto',
  emphasisMark: { style: 'auto', fill: 'auto', position: 'auto' },
  bookTitleMark: 'auto',
  bookTitleBrackets: 'auto',
  ruby: { fontSize: { value: 0.5, unit: 'em' }, position: 'auto', overhang: 'auto', align: 'auto', smallKana: 'keep' },
  warichu: { fontSize: { value: 0.5, unit: 'em' }, open: '', close: '' },
  kunten: { fontSize: { value: 0.5, unit: 'em' }, placement: 'inline' },
};

const EMPHASES: readonly CjkEmphasis[] = ['italic', 'dots'];
const BOOK_TITLE_MARKS: readonly CjkBookTitleMark[] = ['brackets', 'wavy', 'none'];
const RUBY_POSITIONS: readonly CjkRubyPosition[] = ['over', 'under', 'right'];

/** What `*…*` does to Chinese characters by default: emphasis dots when the
 *  document language is Chinese or Japanese, italics otherwise. Japanese
 *  has no italics: emphasis is 傍点 (JLReq §3.3.9), set as the region's
 *  mark (`defaultCjkEmphasisMark`). */
export function defaultCjkEmphasis(locale: string | undefined): CjkEmphasis {
  return languageOf(locale) === 'zh' || isJapaneseLanguage(locale) ? 'dots' : 'italic';
}

/** What `:book[…]` prints by default: brackets on the mainland (《》) and
 *  in Japan (『』, `defaultCjkBookTitleBrackets`), the wavy line in Taiwan
 *  and Hong Kong. */
export function defaultCjkBookTitleMark(region: CjkRegion): CjkBookTitleMark {
  return region === 'taiwan' || region === 'hongkong' ? 'wavy' : 'brackets';
}

/** The brackets a book title is set between by default, outermost first:
 *  『』 then 「」 in Japan (an article or a chapter named inside a book's
 *  title takes 「」), 《》 then 〈〉 for Chinese (GB/T 15834—2011). */
export function defaultCjkBookTitleBrackets(region: CjkRegion): CjkBracketPair[] {
  return region === 'japan'
    ? [{ open: '『', close: '』' }, { open: '「', close: '」' }]
    : [{ open: '《', close: '》' }, { open: '〈', close: '〉' }];
}

/** The emphasis mark a region sets when `cjk.emphasisMark` says nothing:
 *  in Japan the filled sesame ﹅ over the text, which is right of vertical
 *  text (JLReq §3.3.9; the Aozora 傍点 is the sesame in either direction);
 *  for Chinese the filled dot, with the side the writing mode gives (under
 *  horizontal text, right of vertical text). */
export function defaultCjkEmphasisMark(region: CjkRegion): ResolvedCjkEmphasisMarkConfig {
  return region === 'japan'
    ? { style: 'sesame', fill: 'auto', position: 'over' }
    : { style: 'dot', fill: 'auto', position: 'auto' };
}

const MARK_STYLES: readonly CjkEmphasisMarkStyle[] = ['dot', 'circle', 'sesame'];

function resolveEmphasisMark(mark: CjkEmphasisMarkConfig | undefined, region: CjkRegion): ResolvedCjkEmphasisMarkConfig {
  const d = defaultCjkEmphasisMark(region);
  return {
    style: mark?.style && MARK_STYLES.includes(mark.style as CjkEmphasisMarkStyle) ? (mark.style as CjkEmphasisMarkStyle) : d.style,
    fill: mark?.fill === 'filled' || mark?.fill === 'open' ? mark.fill : d.fill,
    position: mark?.position === 'over' || mark?.position === 'under' ? mark.position : d.position,
  };
}

/** Whether `v` is a list of bracket pairs (at least one). */
function isBracketPairs(v: unknown): v is CjkBracketPair[] {
  return Array.isArray(v) && v.length > 0
    && v.every((p) => !!p && typeof p === 'object' && typeof (p as CjkBracketPair).open === 'string' && typeof (p as CjkBracketPair).close === 'string');
}

/** The brackets a warichu note is set between by default: （ ） in Japan
 *  (JLReq §3.4.2: 割注 is normally bracketed), none elsewhere (Chinese
 *  双行夹注 is set bare). */
export function defaultCjkWarichuBrackets(region: CjkRegion): { open: string; close: string } {
  return region === 'japan' ? { open: '（', close: '）' } : { open: '', close: '' };
}

function isColor(c: unknown): c is ColorValue {
  return !!c && typeof c === 'object' && typeof (c as ColorValue).hex === 'string';
}

const RUBY_OVERHANGS: readonly CjkRubyOverhang[] = ['none', 'kana', 'any'];
const RUBY_ALIGNS: readonly CjkRubyAlign[] = ['center', 'jis', 'start'];

/** What a reading longer than its base may run onto by default (#422):
 *  in Japan up to one ruby character onto kana and the blanks of marks,
 *  never onto kanji (`kana`, JLReq §3.3.8); undefined elsewhere, where a
 *  quarter of the ruby em passes onto any neighbour without a reading
 *  (clreq, as before). */
export function defaultCjkRubyOverhang(region: CjkRegion): CjkRubyOverhang | undefined {
  return region === 'japan' ? 'kana' : undefined;
}

/** Where a reading sits on its base by default (#422): JIS X 4051's 1:2:1
 *  in Japan (`jis`); undefined elsewhere (centred, as before). */
export function defaultCjkRubyAlign(region: CjkRegion): CjkRubyAlign | undefined {
  return region === 'japan' ? 'jis' : undefined;
}

function resolveRuby(ruby: CjkRubyConfig | undefined, region: CjkRegion): ResolvedCjkRubyConfig {
  const d = DEFAULT_CJK_CONFIG.ruby;
  const family = typeof ruby?.fontFamily === 'string' && ruby.fontFamily.trim() !== '' ? ruby.fontFamily.trim() : undefined;
  const overhang = ruby?.overhang && RUBY_OVERHANGS.includes(ruby.overhang as CjkRubyOverhang)
    ? (ruby.overhang as CjkRubyOverhang)
    : defaultCjkRubyOverhang(region);
  const align = ruby?.align && RUBY_ALIGNS.includes(ruby.align as CjkRubyAlign) ? (ruby.align as CjkRubyAlign) : defaultCjkRubyAlign(region);
  return {
    ...(family ? { fontFamily: family } : {}),
    fontSize: isLength(ruby?.fontSize) && ruby.fontSize.value > 0 ? { value: ruby.fontSize.value, unit: ruby.fontSize.unit } : { ...d.fontSize! },
    ...(isColor(ruby?.color) ? { color: ruby.color } : {}),
    position: ruby?.position && RUBY_POSITIONS.includes(ruby.position as CjkRubyPosition) ? ruby.position : 'auto',
    // Present only when they change something, so a Chinese document's
    // resolved config is what it was before they existed.
    ...(overhang ? { overhang } : {}),
    ...(align ? { align } : {}),
    ...(ruby?.smallKana === 'full' ? { smallKana: 'full' as const } : {}),
  };
}

const KUNTEN_PLACEMENTS: readonly CjkKuntenPlacement[] = ['inline', 'interlinear'];

function resolveKunten(kunten: CjkKuntenConfig | undefined): ResolvedCjkKuntenConfig {
  const d = DEFAULT_CJK_CONFIG.kunten;
  return {
    fontSize: isLength(kunten?.fontSize) && kunten.fontSize.value > 0 ? { value: kunten.fontSize.value, unit: kunten.fontSize.unit } : { ...d.fontSize! },
    ...(isColor(kunten?.color) ? { color: kunten.color } : {}),
    placement: kunten?.placement && KUNTEN_PLACEMENTS.includes(kunten.placement) ? kunten.placement : d.placement!,
  };
}

function resolveWarichu(warichu: CjkWarichuConfig | undefined, region: CjkRegion): ResolvedCjkWarichuConfig {
  const d = DEFAULT_CJK_CONFIG.warichu;
  const brackets = defaultCjkWarichuBrackets(region);
  return {
    fontSize: isLength(warichu?.fontSize) && warichu.fontSize.value > 0 ? { value: warichu.fontSize.value, unit: warichu.fontSize.unit } : { ...d.fontSize! },
    ...(isColor(warichu?.color) ? { color: warichu.color } : {}),
    open: typeof warichu?.open === 'string' ? warichu.open : brackets.open,
    close: typeof warichu?.close === 'string' ? warichu.close : brackets.close,
  };
}

const REGIONS: readonly CjkRegion[] = ['mainland', 'taiwan', 'hongkong', 'japan'];
const LINE_BREAKS: readonly CjkLineBreak[] = ['none', 'basic', 'gb', 'strict', 'ja-very-strict', 'ja-strict', 'ja-loose'];
const PUNCTUATION_WIDTHS: readonly CjkPunctuationWidth[] = ['fullwidth', 'kaiming', 'lineEndHalf', 'halfwidth'];
const HANGING: readonly CjkHangingPunctuation[] = ['none', 'allow', 'force'];
const PARAGRAPH_START_BRACKETS: readonly CjkParagraphStartBracket[] = ['indent', 'half', 'flush'];
const WORD_BREAKS: readonly CjkWordBreak[] = ['normal', 'keep-all'];
const LENGTH_UNITS = new Set(['cm', 'mm', 'in', 'pt', 'px', 'em', 'rem']);

/** The line-break level a region's text is set with by default: GB/T
 *  15834's for the mainland, clreq's basic set for Taiwan and Hong Kong,
 *  JIS X 4051's for Japan (`ja-very-strict`: small kana, ー, the iteration
 *  marks and the hyphens stay off the line start; JLReq Appendix C.3). */
export function defaultCjkLineBreak(region: CjkRegion): CjkLineBreak {
  if (region === 'japan') return 'ja-very-strict';
  return region === 'mainland' ? 'gb' : 'basic';
}

/** The punctuation width style a region's text is set with by default:
 *  Kaiming (开明式) on the mainland, where most books use it; full width
 *  in Taiwan and Hong Kong, whose marks sit in the middle of their box,
 *  and in Japan, where 、。 keep their whole em inside the line (JLReq
 *  §3.1.2: half a glyph and half an em of blank). */
export function defaultCjkPunctuationWidth(region: CjkRegion): CjkPunctuationWidth {
  // Japan's full width follows JLReq's pair compression, line-end and
  // reduction rules (`cjkPunctuation.ts`, `isJlreqSpacing`).
  return region === 'mainland' ? 'kaiming' : 'fullwidth';
}

/** Whether marks hang by default: in Japan, where many books hang 、。
 *  past the line end when they would otherwise open the next line
 *  (ぶら下げ, JLReq §2.5.1, bunko in particular; `'allow'`, which sets the
 *  mark inside the line when the line can take it in); never in the
 *  Chinese regions. */
export function defaultCjkHangingPunctuation(region: CjkRegion): CjkHangingPunctuation {
  return region === 'japan' ? 'allow' : 'none';
}

/** Whether ？！ take a full-width space after them by default: in Japan
 *  (JLReq §3.1.6), not in the Chinese regions. */
export function defaultCjkSpaceAfterQuestion(region: CjkRegion): boolean {
  return region === 'japan';
}

/** How an opening bracket that starts a paragraph is set by default:
 *  pattern ③ (`'half'`) in Japan, the convention of literary books
 *  (Kodansha, Shinchōsha, Bungei Shunjū, Chikuma: JLReq §3.1.5);
 *  undefined in the Chinese regions, which set it as at any line start
 *  (`trimLineStart`). */
export function defaultCjkParagraphStartBracket(region: CjkRegion): CjkParagraphStartBracket | undefined {
  return region === 'japan' ? 'half' : undefined;
}

/** Whether a region compresses adjacent marks and trims brackets at line
 *  edges by default: the mainland, Hong Kong and Japan do (JLReq §3.1.4,
 *  §3.1.5: 天付き), many Taiwan books set every mark a full em (clreq
 *  §6.3.2). */
export function defaultCjkCompression(region: CjkRegion): boolean {
  return region !== 'taiwan';
}

/** A positive whole number, or `undefined`. */
function count(n: unknown): number | undefined {
  const v = typeof n === 'string' ? Number(n) : n;
  return typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : undefined;
}

function resolveGrid(grid: CjkGridConfig | undefined): ResolvedCjkGridConfig {
  const enabled = grid?.enabled === true;
  return {
    enabled,
    charsPerLine: enabled ? count(grid?.charsPerLine) ?? 0 : 0,
    linesPerPage: enabled ? count(grid?.linesPerPage) ?? 0 : 0,
    show: enabled && grid?.show === true,
  };
}

function isLength(d: unknown): d is Dimension {
  return !!d && typeof d === 'object' && typeof (d as Dimension).value === 'number'
    && Number.isFinite((d as Dimension).value) && LENGTH_UNITS.has((d as Dimension).unit);
}

/** `cjk` resolved: `'auto'` (or a value the engine does not know) follows
 *  `locale`, the document language, read by `cjkRegionOf`. The grid's
 *  numbers are the ones written (0 when unset); the build's pre-pass
 *  (`applyCjkGrid`) replaces them with the ones in use. */
export function resolveCjkConfig(partial: CjkConfig | undefined, locale: string | undefined): ResolvedCjkConfig {
  const region = partial?.region && REGIONS.includes(partial.region as CjkRegion)
    ? (partial.region as CjkRegion)
    : cjkRegionOf(locale) ?? 'mainland';
  const lineBreak = partial?.lineBreak && LINE_BREAKS.includes(partial.lineBreak as CjkLineBreak)
    ? (partial.lineBreak as CjkLineBreak)
    : defaultCjkLineBreak(region);
  const punctuationWidth = partial?.punctuationWidth && PUNCTUATION_WIDTHS.includes(partial.punctuationWidth as CjkPunctuationWidth)
    ? (partial.punctuationWidth as CjkPunctuationWidth)
    : defaultCjkPunctuationWidth(region);
  const compression = defaultCjkCompression(region);
  const compressAdjacent = typeof partial?.compressAdjacent === 'boolean' ? partial.compressAdjacent : compression;
  const trimLineStart = typeof partial?.trimLineStart === 'boolean' ? partial.trimLineStart : compression;
  const hangingPunctuation = partial?.hangingPunctuation && HANGING.includes(partial.hangingPunctuation as CjkHangingPunctuation)
    ? (partial.hangingPunctuation as CjkHangingPunctuation)
    : defaultCjkHangingPunctuation(region);
  const spaceAfterQuestion = typeof partial?.spaceAfterQuestion === 'boolean' ? partial.spaceAfterQuestion : defaultCjkSpaceAfterQuestion(region);
  const paragraphStartBracket = partial?.paragraphStartBracket && PARAGRAPH_START_BRACKETS.includes(partial.paragraphStartBracket as CjkParagraphStartBracket)
    ? (partial.paragraphStartBracket as CjkParagraphStartBracket)
    : defaultCjkParagraphStartBracket(region);
  const wordBreak = partial?.wordBreak && WORD_BREAKS.includes(partial.wordBreak) ? partial.wordBreak : DEFAULT_CJK_CONFIG.wordBreak;
  const latinSpacing = isLength(partial?.latinSpacing) && partial.latinSpacing.value >= 0
    ? { value: partial.latinSpacing.value, unit: partial.latinSpacing.unit }
    : { ...DEFAULT_CJK_CONFIG.latinSpacing };
  const digits = typeof partial?.uprightDigits === 'string' ? Number(partial.uprightDigits) : partial?.uprightDigits;
  const uprightDigits = digits === 0 || digits === 2 || digits === 3 || digits === 4 ? digits : DEFAULT_CJK_CONFIG.uprightDigits;
  return {
    region,
    lineBreak,
    punctuationWidth,
    compressAdjacent,
    trimLineStart,
    hangingPunctuation,
    // Present only when they change something, so a Chinese document's
    // resolved config is what it was before they existed.
    ...(spaceAfterQuestion ? { spaceAfterQuestion: true as const } : {}),
    ...(paragraphStartBracket ? { paragraphStartBracket } : {}),
    ...(wordBreak === 'keep-all' ? { wordBreak } : {}),
    latinSpacing,
    uprightDigits,
    grid: resolveGrid(partial?.grid),
    emphasis: partial?.emphasis && EMPHASES.includes(partial.emphasis as CjkEmphasis)
      ? (partial.emphasis as CjkEmphasis)
      : defaultCjkEmphasis(locale),
    emphasisMark: resolveEmphasisMark(partial?.emphasisMark, region),
    bookTitleMark: partial?.bookTitleMark && BOOK_TITLE_MARKS.includes(partial.bookTitleMark as CjkBookTitleMark)
      ? (partial.bookTitleMark as CjkBookTitleMark)
      : defaultCjkBookTitleMark(region),
    bookTitleBrackets: isBracketPairs(partial?.bookTitleBrackets)
      ? partial.bookTitleBrackets.map((p) => ({ open: p.open, close: p.close }))
      : defaultCjkBookTitleBrackets(region),
    ...(isColor(partial?.annotationColor) ? { annotationColor: partial.annotationColor } : {}),
    ruby: resolveRuby(partial?.ruby, region),
    warichu: resolveWarichu(partial?.warichu, region),
    kunten: resolveKunten(partial?.kunten),
  };
}

/** `cjk.ruby` without the fields at their default; undefined when nothing
 *  is left. */
function stripRubyDefaults(ruby: CjkRubyConfig | undefined): CjkRubyConfig | undefined {
  if (!ruby) return undefined;
  const d = DEFAULT_CJK_CONFIG.ruby;
  const result: CjkRubyConfig = {};
  if (ruby.fontFamily !== undefined && ruby.fontFamily.trim() !== '') result.fontFamily = ruby.fontFamily;
  if (ruby.fontSize !== undefined && !dimensionsEqual(ruby.fontSize, d.fontSize!)) result.fontSize = ruby.fontSize;
  if (ruby.color !== undefined) result.color = ruby.color;
  if (ruby.position !== undefined && ruby.position !== d.position) result.position = ruby.position;
  if (ruby.overhang !== undefined && ruby.overhang !== d.overhang) result.overhang = ruby.overhang;
  if (ruby.align !== undefined && ruby.align !== d.align) result.align = ruby.align;
  if (ruby.smallKana !== undefined && ruby.smallKana !== d.smallKana) result.smallKana = ruby.smallKana;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** `cjk.warichu` without the fields at their default; undefined when
 *  nothing is left. */
function stripWarichuDefaults(warichu: CjkWarichuConfig | undefined): CjkWarichuConfig | undefined {
  if (!warichu) return undefined;
  const d = DEFAULT_CJK_CONFIG.warichu;
  const result: CjkWarichuConfig = {};
  if (warichu.fontSize !== undefined && !dimensionsEqual(warichu.fontSize, d.fontSize!)) result.fontSize = warichu.fontSize;
  if (warichu.color !== undefined) result.color = warichu.color;
  // An empty bracket is kept: it is no default where the region sets
  // brackets (Japan's （）, `defaultCjkWarichuBrackets`).
  if (warichu.open !== undefined) result.open = warichu.open;
  if (warichu.close !== undefined) result.close = warichu.close;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** `cjk.kunten` without the fields at their default; undefined when
 *  nothing is left. */
function stripKuntenDefaults(kunten: CjkKuntenConfig | undefined): CjkKuntenConfig | undefined {
  if (!kunten) return undefined;
  const d = DEFAULT_CJK_CONFIG.kunten;
  const result: CjkKuntenConfig = {};
  if (kunten.fontSize !== undefined && !dimensionsEqual(kunten.fontSize, d.fontSize!)) result.fontSize = kunten.fontSize;
  if (kunten.color !== undefined) result.color = kunten.color;
  if (kunten.placement !== undefined && kunten.placement !== d.placement) result.placement = kunten.placement;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** `cjk.emphasisMark` without the fields at `'auto'`; undefined when
 *  nothing is left. */
function stripEmphasisMarkDefaults(mark: CjkEmphasisMarkConfig | undefined): CjkEmphasisMarkConfig | undefined {
  if (!mark) return undefined;
  const result: CjkEmphasisMarkConfig = {};
  if (mark.style !== undefined && mark.style !== 'auto') result.style = mark.style;
  if (mark.fill !== undefined && mark.fill !== 'auto') result.fill = mark.fill;
  if (mark.position !== undefined && mark.position !== 'auto') result.position = mark.position;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** `cjk.grid` without the fields at their default; undefined when nothing
 *  is left. */
function stripGridDefaults(grid: CjkGridConfig | undefined): CjkGridConfig | undefined {
  if (!grid) return undefined;
  const result: CjkGridConfig = {};
  if (grid.enabled !== undefined && grid.enabled !== false) result.enabled = grid.enabled;
  if (grid.charsPerLine !== undefined) result.charsPerLine = grid.charsPerLine;
  if (grid.linesPerPage !== undefined) result.linesPerPage = grid.linesPerPage;
  if (grid.show !== undefined && grid.show !== false) result.show = grid.show;
  return Object.keys(result).length > 0 ? result : undefined;
}

/** `cjk` without the fields at their default (`'auto'`, a quarter em,
 *  half-size readings and notes); undefined when nothing is left. */
export function stripCjkDefaults(cjk?: CjkConfig): CjkConfig | undefined {
  if (!cjk) return undefined;
  const d = DEFAULT_CJK_CONFIG;
  const result: CjkConfig = {};
  if (cjk.region !== undefined && cjk.region !== d.region) result.region = cjk.region;
  if (cjk.lineBreak !== undefined && cjk.lineBreak !== d.lineBreak) result.lineBreak = cjk.lineBreak;
  if (cjk.punctuationWidth !== undefined && cjk.punctuationWidth !== d.punctuationWidth) result.punctuationWidth = cjk.punctuationWidth;
  if (cjk.compressAdjacent !== undefined && cjk.compressAdjacent !== d.compressAdjacent) result.compressAdjacent = cjk.compressAdjacent;
  if (cjk.trimLineStart !== undefined && cjk.trimLineStart !== d.trimLineStart) result.trimLineStart = cjk.trimLineStart;
  if (cjk.hangingPunctuation !== undefined && cjk.hangingPunctuation !== d.hangingPunctuation) result.hangingPunctuation = cjk.hangingPunctuation;
  if (cjk.spaceAfterQuestion !== undefined && cjk.spaceAfterQuestion !== d.spaceAfterQuestion) result.spaceAfterQuestion = cjk.spaceAfterQuestion;
  if (cjk.paragraphStartBracket !== undefined && cjk.paragraphStartBracket !== d.paragraphStartBracket) result.paragraphStartBracket = cjk.paragraphStartBracket;
  if (cjk.wordBreak !== undefined && cjk.wordBreak !== d.wordBreak) result.wordBreak = cjk.wordBreak;
  if (cjk.latinSpacing !== undefined && !dimensionsEqual(cjk.latinSpacing, d.latinSpacing)) result.latinSpacing = cjk.latinSpacing;
  if (cjk.uprightDigits !== undefined && cjk.uprightDigits !== d.uprightDigits) result.uprightDigits = cjk.uprightDigits;
  const grid = stripGridDefaults(cjk.grid);
  if (grid) result.grid = grid;
  if (cjk.emphasis !== undefined && cjk.emphasis !== d.emphasis) result.emphasis = cjk.emphasis;
  const emphasisMark = stripEmphasisMarkDefaults(cjk.emphasisMark);
  if (emphasisMark) result.emphasisMark = emphasisMark;
  if (cjk.bookTitleMark !== undefined && cjk.bookTitleMark !== d.bookTitleMark) result.bookTitleMark = cjk.bookTitleMark;
  if (cjk.bookTitleBrackets !== undefined && cjk.bookTitleBrackets !== d.bookTitleBrackets) result.bookTitleBrackets = cjk.bookTitleBrackets;
  if (cjk.annotationColor !== undefined) result.annotationColor = cjk.annotationColor;
  const ruby = stripRubyDefaults(cjk.ruby);
  if (ruby) result.ruby = ruby;
  const warichu = stripWarichuDefaults(cjk.warichu);
  if (warichu) result.warichu = warichu;
  const kunten = stripKuntenDefaults(cjk.kunten);
  if (kunten) result.kunten = kunten;
  return Object.keys(result).length > 0 ? result : undefined;
}
