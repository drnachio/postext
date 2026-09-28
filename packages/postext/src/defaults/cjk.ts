import type {
  CjkConfig,
  CjkGridConfig,
  CjkHangingPunctuation,
  CjkLineBreak,
  CjkPunctuationWidth,
  CjkRegion,
  Dimension,
  ResolvedCjkConfig,
  ResolvedCjkGridConfig,
} from '../types';
import { cjkRegionOf } from '../locale';
import { dimensionsEqual } from './shared';

/** `cjk` as written when nothing is set: everything follows the locale,
 *  nothing hangs, a quarter em between Han and Latin, no grid. */
export const DEFAULT_CJK_CONFIG: Required<CjkConfig> = {
  region: 'auto',
  lineBreak: 'auto',
  punctuationWidth: 'auto',
  compressAdjacent: 'auto',
  trimLineStart: 'auto',
  hangingPunctuation: 'none',
  latinSpacing: { value: 0.25, unit: 'em' },
  grid: { enabled: false, show: false },
};

const REGIONS: readonly CjkRegion[] = ['mainland', 'taiwan', 'hongkong'];
const LINE_BREAKS: readonly CjkLineBreak[] = ['none', 'basic', 'gb', 'strict'];
const PUNCTUATION_WIDTHS: readonly CjkPunctuationWidth[] = ['fullwidth', 'kaiming', 'lineEndHalf', 'halfwidth'];
const HANGING: readonly CjkHangingPunctuation[] = ['none', 'allow', 'force'];
const LENGTH_UNITS = new Set(['cm', 'mm', 'in', 'pt', 'px', 'em', 'rem']);

/** The line-break level a region's text is set with by default: GB/T
 *  15834's for the mainland, clreq's basic set for Taiwan and Hong Kong. */
export function defaultCjkLineBreak(region: CjkRegion): CjkLineBreak {
  return region === 'mainland' ? 'gb' : 'basic';
}

/** The punctuation width style a region's text is set with by default:
 *  Kaiming (开明式) on the mainland, where most books use it; full width
 *  in Taiwan and Hong Kong, whose marks sit in the middle of their box. */
export function defaultCjkPunctuationWidth(region: CjkRegion): CjkPunctuationWidth {
  return region === 'mainland' ? 'kaiming' : 'fullwidth';
}

/** Whether a region compresses adjacent marks and trims brackets at line
 *  edges by default: the mainland and Hong Kong do, many Taiwan books set
 *  every mark a full em (clreq §6.3.2). */
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
  return {
    region,
    lineBreak,
    punctuationWidth,
    compressAdjacent,
    trimLineStart,
    hangingPunctuation,
    latinSpacing,
    grid: resolveGrid(partial?.grid),
  };
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
 *  quarter em); undefined when nothing is left. */
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
  const grid = stripGridDefaults(cjk.grid);
  if (grid) result.grid = grid;
  return Object.keys(result).length > 0 ? result : undefined;
}
