/**
 * Configuration values the engine cannot use as written. The engine never
 * fails on them — it numbers in decimal, sets a font stack in its first
 * family, cuts the columns of a one-and-a-half layout at the nearest width
 * both can take, ignores a heading setting it does not know — but a silent
 * substitution is hard to spot, so every one is reported: on
 * `VDTDocument.configWarnings`, and to any host that asks with
 * {@link collectConfigWarnings}.
 */

import type {
  ColumnBalancingConfig,
  HeadingLevelConfig,
  HeadingsConfig,
  HeadingStyleConfig,
  ParagraphStyleConfig,
  PostextConfig,
  ResolvedLayoutConfig,
} from './types';
import type { ConfigWarning, ResolvedConfig } from './vdt';
import { parseNumberFormat } from './numbering';
import { isFontStack, primaryFontFamily } from './measure/font';
import { dimensionToPx } from './units';
import { resolveAllConfig, resolveDirection, resolvedLocale, sideColumnPercentUsed } from './pipeline/config';
import { computePageMetrics } from './pipeline/buildHelpers';
import { deriveSectionGeometryConfig } from './pipeline/headingStyles';
import { cjkGridGeometry } from './pipeline/cjkGrid';
import { isDigitSystem } from './locale';
import { defaultEmphasisFor, isEmphasisStyle, isTashkilMode } from './defaults/bodyText';

/** The format fields and the decimal spelling each falls back to. A
 *  `format` is a format field only under `pageNumbering`. */
function numberFormatFallback(key: string, parentKey: string | undefined): string | undefined {
  if (key === 'numberFormat') return 'arabic';
  if (key === 'counterFormat') return 'decimal';
  if (key === 'format' && parentKey === 'pageNumbering') return 'decimal';
  return undefined;
}

function isFontFamilyKey(key: string): boolean {
  return key === 'fontFamily' || key.endsWith('FontFamily');
}

/** A percentage as a warning prints it: at most two decimals. */
function percentText(n: number): string {
  return String(Math.round(n * 100) / 100);
}

/**
 * Walk a config for values the engine replaces: an unknown numbering
 * format (lists, page labels, resource counters — any of their spellings
 * is fine, see `parseNumberFormat`), a CSS font stack in a font-family
 * field, and the `sideColumnPercent` of a one-and-a-half layout — the
 * document's, and every heading style's own `layout` — that would leave
 * one of the columns with no width (see `sideColumnPercentUsed`). Every
 * nested partial config is covered (heading styles, part list overrides,
 * `htmlViewer.overrides`, design elements). Also a key the heading
 * settings or a paragraph style do not have (`unknownConfigKey`:
 * `headings`, its `balancing` and `levels`, `headingStyles`,
 * `paragraphStyles`). And a setting with a value outside its choices
 * (`unknownConfigValue`: `direction`), and a `numerals` value that names
 * no digit system (`unknownNumerals`). Pure.
 */
export function collectConfigWarnings(config: PostextConfig | undefined): ConfigWarning[] {
  if (!config) return [];
  return [
    ...collectValueWarnings(config), ...collectSideColumnWarnings(config), ...collectUnknownKeyWarnings(config),
    ...collectCjkGridWarnings(config), ...collectChoiceWarnings(config), ...collectNumeralsWarnings(config),
  ];
}

/** Settings whose value is one of a few words: one written otherwise is
 *  read as the default, and `used` names what that default came to. */
function collectChoiceWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const direction = config.direction as unknown;
  if (direction !== undefined && direction !== 'auto' && direction !== 'ltr' && direction !== 'rtl') {
    const used = resolveDirection(undefined, resolvedLocale(resolveAllConfig(config)));
    out.push({ kind: 'unknownConfigValue', path: 'direction', value: String(direction), used });
  }
  // `*…*` and the Arabic vowel marks (#376).
  const emphasis = config.bodyText?.emphasis as unknown;
  if (emphasis !== undefined && emphasis !== 'auto' && !isEmphasisStyle(emphasis)) {
    out.push({ kind: 'unknownConfigValue', path: 'bodyText.emphasis', value: String(emphasis), used: defaultEmphasisFor(config.locale) });
  }
  const tashkil = config.bodyText?.tashkil as unknown;
  if (tashkil !== undefined && !isTashkilMode(tashkil)) {
    out.push({ kind: 'unknownConfigValue', path: 'bodyText.tashkil', value: String(tashkil), used: 'keep' });
  }
  const kashida = config.bodyText?.kashida as unknown;
  if (kashida !== undefined && kashida !== 'auto' && kashida !== 'none') {
    const used = resolveAllConfig(config).bodyText.kashida ?? 'none';
    out.push({ kind: 'unknownConfigValue', path: 'bodyText.kashida', value: String(kashida), used });
  }
  const patterns = config.bodyText?.kashidaPatterns as unknown;
  if (patterns !== undefined && patterns !== 'auto' && patterns !== 'naskh' && patterns !== 'simple' && patterns !== 'nastaliq') {
    out.push({ kind: 'unknownConfigValue', path: 'bodyText.kashidaPatterns', value: String(patterns), used: 'auto' });
  }
  return out;
}

/** A `numerals` value that names no digit system (`'arabic'`, `'hindi'`,
 *  a typo): the digits follow the document language, as with `'auto'`
 *  (`unknownNumerals`, `used` the digit system that gives). */
function collectNumeralsWarnings(config: PostextConfig): ConfigWarning[] {
  const value: unknown = config.numerals;
  if (value === undefined || value === 'auto' || isDigitSystem(value)) return [];
  const used = resolveAllConfig(config).numerals ?? 'latn';
  return [{ kind: 'unknownNumerals', path: 'numerals', value: String(value), used }];
}

// The keys of the heading settings, checked against their types: a key
// added to (or removed from) a type fails to compile until it is listed
// here, so the check never flags a setting the engine reads.
const HEADINGS_KEYS = {
  fontFamily: true, lineHeight: true, color: true, textAlign: true, fontWeight: true,
  marginTop: true, marginBottom: true, keepWithNext: true, keepWithNextSplit: true, snapToGrid: true, inlineMarks: true, balancing: true, levels: true,
} satisfies Record<keyof HeadingsConfig, true>;
const BALANCING_KEYS = {
  enabled: true, maxLinesPerHeading: true, stretchAfterLists: true, maxLinesAfterList: true,
  stretchAfterFloats: true, maxLinesAfterFloat: true, looseParagraphs: true, maxLooseParagraphs: true,
  trackParagraphs: true, maxTracking: true, trailing: true, beforeSpan: true, closingBox: true,
} satisfies Record<keyof ColumnBalancingConfig, true>;
const HEADING_LEVEL_KEYS = {
  level: true, fontSize: true, lineHeight: true, fontFamily: true, color: true, fontWeight: true,
  marginTop: true, marginBottom: true, numberingTemplate: true, numberSeparator: true, italic: true, letterSpacing: true,
  breakBefore: true, span: true, advancedDesign: true, textTransform: true, hidden: true, snapToGrid: true,
} satisfies Record<keyof HeadingLevelConfig, true>;
const HEADING_STYLE_KEYS = {
  id: true, name: true, numberingTemplate: true, numbered: true, toc: true, runningChapter: true, header: true, footer: true,
  margins: true, layout: true, bodyStyle: true, palette: true,
  fontSize: true, lineHeight: true, fontFamily: true, color: true, fontWeight: true, marginTop: true,
  marginBottom: true, numberSeparator: true, italic: true, letterSpacing: true, breakBefore: true, span: true,
  advancedDesign: true, textTransform: true, hidden: true, snapToGrid: true,
} satisfies Record<keyof HeadingStyleConfig, true>;
const PARAGRAPH_STYLE_KEYS = {
  id: true, name: true, fontFamily: true, fontSize: true, lineHeight: true, color: true, textAlign: true,
  boldColor: true, italicColor: true, fontWeight: true, boldFontWeight: true, italic: true, smallCaps: true,
  hyphenation: true, indent: true, firstLineIndent: true, hangingIndent: true, spaceBetween: true,
  marginTop: true, marginBottom: true, snapToGrid: true, textTransform: true,
} satisfies Record<keyof ParagraphStyleConfig, true>;

/** Edit distance with transpositions (optimal string alignment), capped:
 *  anything above `max` returns `max + 1`. */
function editDistance(a: string, b: string, max: number): number {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d: number[][] = Array.from({ length: a.length + 1 }, (_, i) => [i, ...new Array<number>(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      let v = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, d[i - 2]![j - 2]! + 1);
      d[i]![j] = v;
    }
  }
  return d[a.length]![b.length]!;
}

/** The known key `key` is a slip of: the same letters in another case, or
 *  one or two letters apart (a longer key allows two). */
function closestKey(key: string, known: readonly string[]): string | undefined {
  const lower = key.toLowerCase();
  const sameCase = known.find((k) => k.toLowerCase() === lower);
  if (sameCase) return sameCase;
  const max = key.length >= 8 ? 2 : 1;
  let best: string | undefined;
  let bestD = max + 1;
  for (const k of known) {
    const dist = editDistance(lower, k.toLowerCase(), max);
    if (dist < bestD) { best = k; bestD = dist; }
  }
  return best;
}

/**
 * Keys the heading settings do not have (EF-83), or a paragraph style
 * (EF-173): the engine reads the settings it knows and drops the rest, so
 * a misspelt or invented one (`letterSpacng`, `tracking`, a paragraph
 * style's `fontStyle`) used to change nothing without a word. The
 * `headings` section, its `balancing` and `levels`, every heading style
 * and every paragraph style are checked, in the document config and in
 * `htmlViewer.overrides`.
 */
function collectUnknownKeyWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const check = (node: unknown, known: Record<string, true>, path: string): void => {
    if (!node || typeof node !== 'object' || Array.isArray(node)) return;
    const names = Object.keys(known);
    for (const [key, value] of Object.entries(node)) {
      // A key set to `undefined` sets nothing either way.
      if (value === undefined || Object.prototype.hasOwnProperty.call(known, key)) continue;
      const suggestion = closestKey(key, names);
      out.push({ kind: 'unknownConfigKey', path: `${path}.${key}`, value: key, used: '', ...(suggestion ? { suggestion } : {}) });
    }
  };
  const checkConfig = (c: Pick<PostextConfig, 'headings' | 'headingStyles' | 'paragraphStyles'> | undefined, prefix: string): void => {
    if (!c) return;
    const headings = c.headings as unknown;
    if (headings && typeof headings === 'object' && !Array.isArray(headings)) {
      const h = headings as HeadingsConfig;
      check(h, HEADINGS_KEYS, `${prefix}headings`);
      check(h.balancing, BALANCING_KEYS, `${prefix}headings.balancing`);
      if (Array.isArray(h.levels)) h.levels.forEach((l, i) => check(l, HEADING_LEVEL_KEYS, `${prefix}headings.levels[${i}]`));
    }
    if (Array.isArray(c.headingStyles)) c.headingStyles.forEach((s, i) => check(s, HEADING_STYLE_KEYS, `${prefix}headingStyles[${i}]`));
    if (Array.isArray(c.paragraphStyles)) c.paragraphStyles.forEach((s, i) => check(s, PARAGRAPH_STYLE_KEYS, `${prefix}paragraphStyles[${i}]`));
  };
  checkConfig(config, '');
  checkConfig(config.htmlViewer?.overrides, 'htmlViewer.overrides.');
  return out;
}

/** The format and font-family values of `config`, walked field by field. */
function collectValueWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  // The objects on the current path: a shared object is walked at every
  // path it sits at, a cycle only once.
  const ancestors = new Set<object>();
  const walk = (node: unknown, path: string, parentKey: string | undefined): void => {
    if (!node || typeof node !== 'object' || ancestors.has(node)) return;
    // Font binaries (`customFonts`) and other buffers hold no settings.
    if (node instanceof ArrayBuffer || ArrayBuffer.isView(node)) return;
    ancestors.add(node);
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`, parentKey));
      ancestors.delete(node);
      return;
    }
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      const at = path ? `${path}.${key}` : key;
      if (typeof value === 'string') {
        const fallback = numberFormatFallback(key, parentKey);
        if (fallback !== undefined && parseNumberFormat(value) === undefined) {
          out.push({ kind: 'unknownNumberFormat', path: at, value, used: fallback });
        } else if (isFontFamilyKey(key) && isFontStack(value)) {
          out.push({ kind: 'fontFamilyStack', path: at, value, used: primaryFontFamily(value) });
        }
        continue;
      }
      walk(value, at, key);
    }
    ancestors.delete(node);
  };
  walk(config, '', undefined);
  return out;
}

/** The side columns of the one-and-a-half layouts, measured on the page the
 *  layout is cut on (a heading style's margins included). A layout of
 *  another type never reads the value and is not reported. */
function collectSideColumnWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const resolved = resolveAllConfig(config);
  const check = (geometry: ResolvedConfig, layout: ResolvedLayoutConfig, path: string): void => {
    if (layout.layoutType !== 'oneAndHalf') return;
    const contentWidth = computePageMetrics(geometry).contentArea.width;
    const gutter = dimensionToPx(layout.gutterWidth, geometry.page.dpi);
    const used = sideColumnPercentUsed(layout.sideColumnPercent, contentWidth, gutter);
    if (used === Number(layout.sideColumnPercent)) return;
    out.push({ kind: 'sideColumnPercentClamped', path, value: String(layout.sideColumnPercent), used: percentText(used) });
  };
  check(resolved, resolved.layout, 'layout.sideColumnPercent');
  resolved.headingStyles.forEach((style, i) => {
    if (style.layout) check(deriveSectionGeometryConfig(resolved, style), style.layout, `headingStyles[${i}].layout.sideColumnPercent`);
  });
  return out;
}

/** A character grid (`cjk.grid`) with more characters per line or lines
 *  per page than the page's margins leave room for: the grid is reduced to
 *  what fits (`cjkGridClamped`, `used` the number set). */
function collectCjkGridWarnings(config: PostextConfig): ConfigWarning[] {
  const g = cjkGridGeometry(config);
  if (!g) return [];
  const out: ConfigWarning[] = [];
  if (g.clamped.charsPerLine !== undefined) out.push({ kind: 'cjkGridClamped', path: 'cjk.grid.charsPerLine', value: String(g.clamped.charsPerLine), used: String(g.charsPerLine) });
  if (g.clamped.linesPerPage !== undefined) out.push({ kind: 'cjkGridClamped', path: 'cjk.grid.linesPerPage', value: String(g.clamped.linesPerPage), used: String(g.linesPerPage) });
  return out;
}
