import type {
  CjkBookTitleMark,
  CjkConfig,
  CjkEmphasis,
  CjkGridConfig,
  CjkHangingPunctuation,
  CjkLineBreak,
  CjkPunctuationWidth,
  CjkRegion,
  CjkRubyConfig,
  CjkRubyPosition,
  CjkWarichuConfig,
  ColorValue,
  Dimension,
  ResolvedCjkConfig,
  ResolvedCjkGridConfig,
  ResolvedCjkRubyConfig,
  ResolvedCjkWarichuConfig,
} from '../types';
import { cjkRegionOf, isJapaneseLanguage, languageOf } from '../locale';
import { dimensionsEqual } from './shared';

/** `cjk` as written when nothing is set: everything follows the locale,
 *  nothing hangs, a quarter em between Han and Latin, no grid; readings
 *  and warichu notes at half the text size, warichu brackets by region
 *  (none but in Japan, `defaultCjkWarichuBrackets`), marks in the text
 *  colour (`annotationColor` unset). */
export const DEFAULT_CJK_CONFIG: Required<Omit<CjkConfig, 'annotationColor'>> & Pick<CjkConfig, 'annotationColor'> = {
  region: 'auto',
  lineBreak: 'auto',
  punctuationWidth: 'auto',
  compressAdjacent: 'auto',
  trimLineStart: 'auto',
  hangingPunctuation: 'none',
  latinSpacing: { value: 0.25, unit: 'em' },
  uprightDigits: 2,
  grid: { enabled: false, show: false },
  emphasis: 'auto',
  bookTitleMark: 'auto',
  ruby: { fontSize: { value: 0.5, unit: 'em' }, position: 'auto' },
  warichu: { fontSize: { value: 0.5, unit: 'em' }, open: '', close: '' },
};

const EMPHASES: readonly CjkEmphasis[] = ['italic', 'dots'];
const BOOK_TITLE_MARKS: readonly CjkBookTitleMark[] = ['brackets', 'wavy', 'none'];
const RUBY_POSITIONS: readonly CjkRubyPosition[] = ['over', 'under', 'right'];

/** What `*…*` does to Chinese characters by default: emphasis dots when the
 *  document language is Chinese or Japanese, italics otherwise. Japanese
 *  has no italics: emphasis is 傍点 (JLReq §3.3.9). The mark's shape and
 *  side are still the Chinese dot under the text in horizontal lines;
 *  the Japanese sesame over it comes with `cjk.emphasisMark` (J6, #421). */
export function defaultCjkEmphasis(locale: string | undefined): CjkEmphasis {
  return languageOf(locale) === 'zh' || isJapaneseLanguage(locale) ? 'dots' : 'italic';
}

/** What `:book[…]` prints by default: 《》 on the mainland, the wavy line
 *  in Taiwan and Hong Kong, the bare title in Japan. Japanese titles take
 *  『』 (「」 inside them), which the author types until the brackets are
 *  configurable (`cjk.bookTitleBrackets`, J6 #421); 《》 would be wrong
 *  there and the wavy line is Chinese. */
export function defaultCjkBookTitleMark(region: CjkRegion): CjkBookTitleMark {
  if (region === 'japan') return 'none';
  return region === 'mainland' ? 'brackets' : 'wavy';
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

function resolveRuby(ruby: CjkRubyConfig | undefined): ResolvedCjkRubyConfig {
  const d = DEFAULT_CJK_CONFIG.ruby;
  const family = typeof ruby?.fontFamily === 'string' && ruby.fontFamily.trim() !== '' ? ruby.fontFamily.trim() : undefined;
  return {
    ...(family ? { fontFamily: family } : {}),
    fontSize: isLength(ruby?.fontSize) && ruby.fontSize.value > 0 ? { value: ruby.fontSize.value, unit: ruby.fontSize.unit } : { ...d.fontSize! },
    ...(isColor(ruby?.color) ? { color: ruby.color } : {}),
    position: ruby?.position && RUBY_POSITIONS.includes(ruby.position as CjkRubyPosition) ? ruby.position : 'auto',
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
const LINE_BREAKS: readonly CjkLineBreak[] = ['none', 'basic', 'gb', 'strict'];
const PUNCTUATION_WIDTHS: readonly CjkPunctuationWidth[] = ['fullwidth', 'kaiming', 'lineEndHalf', 'halfwidth'];
const HANGING: readonly CjkHangingPunctuation[] = ['none', 'allow', 'force'];
const LENGTH_UNITS = new Set(['cm', 'mm', 'in', 'pt', 'px', 'em', 'rem']);

/** The line-break level a region's text is set with by default: GB/T
 *  15834's for the mainland, clreq's basic set for Taiwan and Hong Kong,
 *  the strict set for Japan (iteration marks and ー stay off the line
 *  start, as JIS X 4051 asks; no solidus rule, which is GB/T's). */
export function defaultCjkLineBreak(region: CjkRegion): CjkLineBreak {
  // J2 (#417): Japan moves to the JLReq levels (ja-very-strict, with the
  // small kana and hyphen classes) once they exist.
  if (region === 'japan') return 'strict';
  return region === 'mainland' ? 'gb' : 'basic';
}

/** The punctuation width style a region's text is set with by default:
 *  Kaiming (开明式) on the mainland, where most books use it; full width
 *  in Taiwan and Hong Kong, whose marks sit in the middle of their box,
 *  and in Japan, where 、。 keep their whole em inside the line (JLReq
 *  §3.1.2: half a glyph and half an em of blank). */
export function defaultCjkPunctuationWidth(region: CjkRegion): CjkPunctuationWidth {
  // J3 (#418): Japan's pair compression and line-end rules (JLReq §3.1.4,
  // §3.1.9) refine how this full width gives up its blank.
  return region === 'mainland' ? 'kaiming' : 'fullwidth';
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
  const hangingPunctuation = partial?.hangingPunctuation && HANGING.includes(partial.hangingPunctuation)
    ? partial.hangingPunctuation
    : 'none';
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
    latinSpacing,
    uprightDigits,
    grid: resolveGrid(partial?.grid),
    emphasis: partial?.emphasis && EMPHASES.includes(partial.emphasis as CjkEmphasis)
      ? (partial.emphasis as CjkEmphasis)
      : defaultCjkEmphasis(locale),
    bookTitleMark: partial?.bookTitleMark && BOOK_TITLE_MARKS.includes(partial.bookTitleMark as CjkBookTitleMark)
      ? (partial.bookTitleMark as CjkBookTitleMark)
      : defaultCjkBookTitleMark(region),
    ...(isColor(partial?.annotationColor) ? { annotationColor: partial.annotationColor } : {}),
    ruby: resolveRuby(partial?.ruby),
    warichu: resolveWarichu(partial?.warichu, region),
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

/** `cjk` without the fields at their default (`'auto'`, `'none'`, a
 *  quarter em, half-size readings and notes); undefined when nothing is
 *  left. */
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
  if (cjk.latinSpacing !== undefined && !dimensionsEqual(cjk.latinSpacing, d.latinSpacing)) result.latinSpacing = cjk.latinSpacing;
  if (cjk.uprightDigits !== undefined && cjk.uprightDigits !== d.uprightDigits) result.uprightDigits = cjk.uprightDigits;
  const grid = stripGridDefaults(cjk.grid);
  if (grid) result.grid = grid;
  if (cjk.emphasis !== undefined && cjk.emphasis !== d.emphasis) result.emphasis = cjk.emphasis;
  if (cjk.bookTitleMark !== undefined && cjk.bookTitleMark !== d.bookTitleMark) result.bookTitleMark = cjk.bookTitleMark;
  if (cjk.annotationColor !== undefined) result.annotationColor = cjk.annotationColor;
  const ruby = stripRubyDefaults(cjk.ruby);
  if (ruby) result.ruby = ruby;
  const warichu = stripWarichuDefaults(cjk.warichu);
  if (warichu) result.warichu = warichu;
  return Object.keys(result).length > 0 ? result : undefined;
}
