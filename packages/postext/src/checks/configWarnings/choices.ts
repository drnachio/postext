// Settings whose value is one of a few words (drop caps, tab stops, line
// numbers, wrap, code style, print, Canvas gaps, contrast, comics, checks,
// numerals) (#1276: split out of configWarnings.ts).
import type { PostextConfig, ParagraphDropCap, LineNumbersConfig, ResolvedLineNumbersConfig, CodeStyleConfig, ComicsConfig } from '../../types.js';
import type { ConfigWarning } from '../../vdt.js';
import { parseTocGroupHead } from '../../defaults/structure/toc.js';
import { resolveDirection, resolvedLocale, resolveAllConfig } from '../../pipeline/config.js';
import { isDigitSystem } from '../../hyphenation/locale.js';
import { isEmphasisStyle, defaultEmphasisFor, isTashkilMode } from '../../defaults/text/bodyText.js';
import { isFigureStyle } from '../../fonts/figureStyle.js';
import { resolveComicsConfig, isComicChoice, COMIC_CHOICES } from '../../defaults/comics.js';
import { resolvePrintConfig } from '../../defaults/output/print.js';
import { resolveCanvasViewerConfig, CANVAS_VIEWER_MAX_GAP } from '../../defaults/output/canvasViewer.js';
import { CONTRAST_LEVELS, DEFAULT_CONTRAST_CONFIG, CONTRAST_MODES } from '../../defaults/output/contrast.js';
import { isTabStopAlign, parseTabStopPosition } from '../../defaults/text/tabStops.js';
import { resolveContentInConfigCheck } from '../../defaults/output/checks.js';
import { isDropCap, readDropCap, DROP_CAP_PUNCTUATION, DROP_CAP_SHORT_PARAGRAPH } from '../../defaults/text/dropCap.js';
import { outputProfileInfo } from '../../color/catalogue.js';
import { CODE_OVERFLOWS } from '../../defaults/text/codeStyle.js';
import { closestKey } from '../../util/closestKey.js';
import { isResourceCounterReset } from '../../defaults/resources/resourceTypes.js';
import { LINE_NUMBERS_COUNTS, LINE_NUMBERS_RESTARTS, LINE_NUMBERS_POSITIONS, LINE_NUMBERS_MULTI_COLUMN, LINE_NUMBERS_ALIGNS } from '../../defaults/text/lineNumbers.js';

/** Settings whose value is one of a few words: one written otherwise is
 *  read as the default, and `used` names what that default came to. */
export function collectChoiceWarnings(config: PostextConfig): ConfigWarning[] {
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
  // The level of a composition rule (#749): read as `'allow'`, the rule off.
  const rule = (path: string, value: unknown) => {
    if (value !== undefined && value !== 'allow' && value !== 'warn' && value !== 'avoid') {
      out.push({ kind: 'unknownConfigValue', path, value: String(value), used: 'allow' });
    }
  };
  rule('bodyText.shortListSplit', config.bodyText?.shortListSplit);
  rule('layout.openerFloats', config.layout?.openerFloats);
  // The figures of a style (#1237): read as unset, the family's own.
  const figures = (path: string, value: unknown) => {
    if (value !== undefined && !isFigureStyle(value)) out.push({ kind: 'unknownConfigValue', path, value: String(value), used: 'default' });
  };
  figures('bodyText.figureStyle', config.bodyText?.figureStyle);
  figures('headings.figureStyle', config.headings?.figureStyle);
  config.headings?.levels?.forEach((l, i) => figures(`headings.levels[${i}].figureStyle`, l?.figureStyle));
  config.headingStyles?.forEach((h, i) => figures(`headingStyles[${i}].figureStyle`, h?.figureStyle));
  config.paragraphStyles?.forEach((p, i) => figures(`paragraphStyles[${i}].figureStyle`, p?.figureStyle));
  figures('tableStyle.figureStyle', config.tableStyle?.figureStyle);
  config.tableStyles?.forEach((t, i) => figures(`tableStyles[${i}].figureStyle`, t?.figureStyle));
  figures('captionStyle.figureStyle', config.captionStyle?.figureStyle);
  // What heads a block of the contents (#850): read as `'part'`.
  const tocHead = config.toc?.groups?.head as unknown;
  if (tocHead !== undefined && parseTocGroupHead(tocHead) === undefined) {
    out.push({ kind: 'unknownConfigValue', path: 'toc.groups.head', value: String(tocHead), used: 'part' });
  }
  // Where a heading's number stands (#401).
  const position = (path: string, value: unknown) => {
    if (value !== undefined && value !== 'before' && value !== 'replace') {
      out.push({ kind: 'unknownConfigValue', path, value: String(value), used: 'before' });
    }
  };
  (config.headings?.levels ?? []).forEach((l, i) => position(`headings.levels[${i}].numberPosition`, (l as { numberPosition?: unknown }).numberPosition));
  (config.headingStyles ?? []).forEach((st, i) => position(`headingStyles[${i}].numberPosition`, (st as { numberPosition?: unknown }).numberPosition));
  // Sidenotes on the spread (傍注, JLReq §4.2.6) are a vertical book's: a
  // horizontal document sets them at the column foot.
  if (config.footnotes?.placement === 'spread' && resolveAllConfig(config).layout.writingMode !== 'vertical-rl') {
    out.push({ kind: 'unknownConfigValue', path: 'footnotes.placement', value: 'spread', used: 'column' });
  }
  out.push(...collectComicChoiceWarnings(config));
  out.push(...collectPrintChoiceWarnings(config));
  out.push(...collectContrastChoiceWarnings(config));
  out.push(...collectCanvasViewerWarnings(config));
  out.push(...collectChecksValueWarnings(config));
  out.push(...collectLineNumbersWarnings(config));
  out.push(...collectWrapWarnings(config));
  out.push(...collectCodeStyleWarnings(config));
  out.push(...collectTabStopWarnings(config));
  out.push(...collectDropCapWarnings(config));
  return out;
}

/** The drop cap settings of a config (#623): each paragraph style's, each
 *  heading level's and each heading style's (and those of the HTML
 *  viewer's overrides), with their paths. */
export function dropCapSettings(config: PostextConfig): { cap: ParagraphDropCap; path: string }[] {
  const out: { cap: ParagraphDropCap; path: string }[] = [];
  const add = (cap: unknown, path: string) => {
    if (isDropCap(cap)) out.push({ cap, path });
  };
  const from = (c: Pick<PostextConfig, 'headings' | 'headingStyles' | 'paragraphStyles'> | undefined, prefix: string) => {
    if (!c) return;
    (c.paragraphStyles ?? []).forEach((s, i) => add((s as { dropCap?: unknown } | undefined)?.dropCap, `${prefix}paragraphStyles[${i}].dropCap`));
    const levels = (c.headings as { levels?: unknown } | undefined)?.levels;
    if (Array.isArray(levels)) levels.forEach((l, i) => add((l as { dropCap?: unknown } | undefined)?.dropCap, `${prefix}headings.levels[${i}].dropCap`));
    (c.headingStyles ?? []).forEach((s, i) => add((s as { dropCap?: unknown } | undefined)?.dropCap, `${prefix}headingStyles[${i}].dropCap`));
  };
  from(config, '');
  from(config.htmlViewer?.overrides, 'htmlViewer.overrides.');
  return out;
}

/** A drop cap whose `punctuation` or `shortParagraph` is not one of its
 *  words, or whose `lines`, `sink` or `characters` is no whole number from
 *  1 (#623): the default is used. */
function collectDropCapWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  for (const { cap, path } of dropCapSettings(config)) {
    const read = readDropCap(cap);
    if (cap.punctuation !== undefined && !(DROP_CAP_PUNCTUATION as readonly unknown[]).includes(cap.punctuation)) {
      const suggestion = closestKey(String(cap.punctuation), DROP_CAP_PUNCTUATION);
      out.push({ kind: 'unknownConfigValue', path: `${path}.punctuation`, value: String(cap.punctuation), used: read.punctuation, ...(suggestion ? { suggestion } : {}) });
    }
    if (cap.shortParagraph !== undefined && !(DROP_CAP_SHORT_PARAGRAPH as readonly unknown[]).includes(cap.shortParagraph)) {
      const suggestion = closestKey(String(cap.shortParagraph), DROP_CAP_SHORT_PARAGRAPH);
      out.push({ kind: 'unknownConfigValue', path: `${path}.shortParagraph`, value: String(cap.shortParagraph), used: read.shortParagraph, ...(suggestion ? { suggestion } : {}) });
    }
    for (const key of ['lines', 'sink', 'characters'] as const) {
      const v: unknown = cap[key];
      if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v >= 1)) {
        out.push({ kind: 'unknownConfigValue', path: `${path}.${key}`, value: String(v), used: String(read[key]) });
      }
    }
  }
  return out;
}

/** The tab stop lists of a config (#622): the body's, each paragraph
 *  style's and each callout body's, with their paths. */
export function tabStopLists(config: PostextConfig): { stops: unknown[]; path: string }[] {
  const out: { stops: unknown[]; path: string }[] = [];
  const add = (stops: unknown, path: string) => {
    if (Array.isArray(stops)) out.push({ stops, path });
  };
  add(config.bodyText?.tabStops, 'bodyText.tabStops');
  (config.paragraphStyles ?? []).forEach((s, i) => add((s as { tabStops?: unknown } | undefined)?.tabStops, `paragraphStyles[${i}].tabStops`));
  (config.calloutStyles ?? []).forEach((s, i) => add((s as { body?: { tabStops?: unknown } } | undefined)?.body?.tabStops, `calloutStyles[${i}].body.tabStops`));
  return out;
}

/** A tab stop whose `align` is not one of its words (read as `'start'`),
 *  or whose `position` is no length, `'end'` or percentage (the stop is
 *  left out: `used` `'none'`). */
function collectTabStopWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  for (const { stops, path } of tabStopLists(config)) {
    stops.forEach((raw, i) => {
      if (!raw || typeof raw !== 'object') return;
      const stop = raw as { position?: unknown; align?: unknown };
      if (stop.align !== undefined && !isTabStopAlign(stop.align)) {
        out.push({ kind: 'unknownConfigValue', path: `${path}[${i}].align`, value: String(stop.align), used: 'start' });
      }
      if (parseTabStopPosition(stop.position) === undefined) {
        out.push({ kind: 'unknownConfigValue', path: `${path}[${i}].position`, value: typeof stop.position === 'object' ? JSON.stringify(stop.position) : String(stop.position), used: 'none' });
      }
    });
  }
  return out;
}

/** The line number settings that take one of a few words (#621), and line
 *  numbers asked of a vertical document, which gets none
 *  (`lineNumbersUnsupported`). */
function collectLineNumbersWarnings(config: PostextConfig): ConfigWarning[] {
  const ln = config.lineNumbers as unknown;
  if (!ln || typeof ln !== 'object' || Array.isArray(ln)) return [];
  const c = ln as LineNumbersConfig;
  const out: ConfigWarning[] = [];
  let resolved: ResolvedLineNumbersConfig | undefined;
  const res = () => (resolved ??= resolveAllConfig(config).lineNumbers!);
  const check = (value: unknown, choices: readonly string[], key: keyof LineNumbersConfig): void => {
    if (value === undefined || (typeof value === 'string' && choices.includes(value))) return;
    const written = String(value);
    const suggestion = closestKey(written, choices);
    out.push({ kind: 'unknownConfigValue', path: `lineNumbers.${key}`, value: written, used: String(res()[key as keyof ResolvedLineNumbersConfig]), ...(suggestion ? { suggestion } : {}) });
  };
  check(c.count, LINE_NUMBERS_COUNTS, 'count');
  check(c.restart, LINE_NUMBERS_RESTARTS, 'restart');
  check(c.position, LINE_NUMBERS_POSITIONS, 'position');
  check(c.multiColumn, LINE_NUMBERS_MULTI_COLUMN, 'multiColumn');
  check(c.align, LINE_NUMBERS_ALIGNS, 'align');
  if (c.enabled === true && resolveAllConfig(config).layout.writingMode === 'vertical-rl') {
    out.push({ kind: 'lineNumbersUnsupported', path: 'lineNumbers.enabled', value: 'true', used: 'false' });
  }
  return out;
}

const WRAP_SIDES = ['none', 'left', 'right', 'start', 'end'] as const;
const RESET_CHOICES = ['never', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6'] as const;

/** A resource type's `resetOn` that names no level (`unknownConfigValue`,
 *  #916). Text wrap (#627): a resource type's `defaultPlacement.wrap` that is no
 *  side (`unknownConfigValue`), and one asked of a vertical document,
 *  which sets no text beside a figure (`wrapUnsupported`). */
function collectWrapWarnings(config: PostextConfig): ConfigWarning[] {
  const types = config.resourceTypes;
  if (!Array.isArray(types)) return [];
  const out: ConfigWarning[] = [];
  let vertical: boolean | undefined;
  types.forEach((t, i) => {
    // A `resetOn` that names no level counts as `h1` (#916, see
    // `completeResourceType`).
    const resetOn = (t as { resetOn?: unknown } | undefined)?.resetOn;
    if (resetOn !== undefined && !isResourceCounterReset(resetOn)) {
      const suggestion = closestKey(String(resetOn), RESET_CHOICES);
      out.push({ kind: 'unknownConfigValue', path: `resourceTypes[${i}].resetOn`, value: String(resetOn), used: 'h1', ...(suggestion ? { suggestion } : {}) });
    }
    const wrap = (t as { defaultPlacement?: { wrap?: unknown } } | undefined)?.defaultPlacement?.wrap;
    if (wrap === undefined || wrap === 'none') return;
    const path = `resourceTypes[${i}].defaultPlacement.wrap`;
    if (typeof wrap !== 'string' || !(WRAP_SIDES as readonly string[]).includes(wrap)) {
      const suggestion = closestKey(String(wrap), WRAP_SIDES);
      out.push({ kind: 'unknownConfigValue', path, value: String(wrap), used: 'none', ...(suggestion ? { suggestion } : {}) });
      return;
    }
    vertical ??= resolveAllConfig(config).layout.writingMode === 'vertical-rl';
    if (vertical) out.push({ kind: 'wrapUnsupported', path, value: wrap, used: 'none' });
  });
  return out;
}

/** The code style settings that take one of a few words (#624). */
function collectCodeStyleWarnings(config: PostextConfig): ConfigWarning[] {
  const cs = config.codeStyle as unknown;
  if (!cs || typeof cs !== 'object' || Array.isArray(cs)) return [];
  const c = cs as CodeStyleConfig;
  const out: ConfigWarning[] = [];
  const check = (value: unknown, choices: readonly string[], key: string, used: string): void => {
    if (value === undefined || (typeof value === 'string' && choices.includes(value))) return;
    const written = String(value);
    const suggestion = closestKey(written, choices);
    out.push({ kind: 'unknownConfigValue', path: `codeStyle.${key}`, value: written, used, ...(suggestion ? { suggestion } : {}) });
  };
  check(c.overflow, CODE_OVERFLOWS, 'overflow', 'wrap');
  check(c.highlight, ['builtin', 'none'], 'highlight', 'builtin');
  check(c.span, ['column', 'page'], 'span', 'column');
  return out;
}

/** The print settings that take one of a few words (#602): the PDF/X
 *  standard, the output profile (a catalogue id, or `custom` with an
 *  uploaded profile) and the rendering intent. */
function collectPrintChoiceWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const p = config.print;
  if (!p) return out;
  const standard = p.standard as unknown;
  if (standard !== undefined && standard !== 'none' && standard !== 'pdfx1a' && standard !== 'pdfx4') {
    out.push({ kind: 'unknownConfigValue', path: 'print.standard', value: String(standard), used: 'none' });
  }
  const profile = p.outputProfile as unknown;
  if (profile !== undefined) {
    const known = profile === 'custom' ? !!p.customProfile : typeof profile === 'string' && !!outputProfileInfo(profile);
    if (!known) out.push({ kind: 'unknownConfigValue', path: 'print.outputProfile', value: String(profile), used: resolvePrintConfig(p).outputProfile });
  }
  const intent = p.renderingIntent as unknown;
  if (intent !== undefined && intent !== 'relative' && intent !== 'perceptual') {
    out.push({ kind: 'unknownConfigValue', path: 'print.renderingIntent', value: String(intent), used: 'relative' });
  }
  return out;
}

/** The Canvas's gaps (#1002): a whole number of pixels from 0 to 200. One
 *  written otherwise reads as the nearest such number (or the default, when
 *  it is no number), and `used` says which. */
function collectCanvasViewerWarnings(config: PostextConfig): ConfigWarning[] {
  const c = config.canvasViewer as unknown;
  if (!c || typeof c !== 'object' || Array.isArray(c)) return [];
  const raw = c as Record<string, unknown>;
  const read = resolveCanvasViewerConfig(c as PostextConfig['canvasViewer']);
  const out: ConfigWarning[] = [];
  for (const key of ['pageGap', 'rowGap'] as const) {
    const value = raw[key];
    if (value === undefined) continue;
    const ok = typeof value === 'number' && Number.isInteger(value) && value >= 0 && value <= CANVAS_VIEWER_MAX_GAP;
    if (!ok) out.push({ kind: 'unknownConfigValue', path: `canvasViewer.${key}`, value: String(value), used: String(read[key]) });
  }
  return out;
}

/** The contrast check's level and mode (#748): one written otherwise
 *  reads as the default. */
function collectContrastChoiceWarnings(config: PostextConfig): ConfigWarning[] {
  const out: ConfigWarning[] = [];
  const c = config.contrast;
  if (!c) return out;
  const level = c.level as unknown;
  if (level !== undefined && !(CONTRAST_LEVELS as readonly unknown[]).includes(level)) {
    out.push({ kind: 'unknownConfigValue', path: 'contrast.level', value: String(level), used: DEFAULT_CONTRAST_CONFIG.level });
  }
  const mode = c.mode as unknown;
  if (mode !== undefined && !(CONTRAST_MODES as readonly unknown[]).includes(mode)) {
    out.push({ kind: 'unknownConfigValue', path: 'contrast.mode', value: String(mode), used: DEFAULT_CONTRAST_CONFIG.mode });
  }
  return out;
}

/** The comics settings that take one of a few words (#590): the reading
 *  and art directions, a panel style's border style and fit, the
 *  lettering's writing mode, case, final stop and joins, a balloon style's
 *  shape, tail, target, position, alignment and case. `used` is what the
 *  setting resolved to (the default, or the value of the style it is laid
 *  over), `suggestion` the word it is closest to, when one is close. */
function collectComicChoiceWarnings(config: PostextConfig): ConfigWarning[] {
  const comics = config.comics as unknown;
  if (!comics || typeof comics !== 'object' || Array.isArray(comics)) return [];
  const c = comics as ComicsConfig;
  const out: ConfigWarning[] = [];
  let resolved: ReturnType<typeof resolveComicsConfig> | undefined;
  const res = () => (resolved ??= resolveComicsConfig(c, resolvedLocale(resolveAllConfig(config))));
  const check = (value: unknown, choices: readonly string[], path: string, used: () => unknown): void => {
    if (value === undefined || isComicChoice(choices, value)) return;
    const written = String(value);
    const suggestion = closestKey(written, choices);
    out.push({ kind: 'unknownConfigValue', path, value: written, used: String(used()), ...(suggestion ? { suggestion } : {}) });
  };
  const obj = (v: unknown): Record<string, unknown> | undefined =>
    v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : undefined;
  check(c.readingDirection, COMIC_CHOICES.readingDirection, 'comics.readingDirection', () => res().readingDirection);
  check(c.artDirection, COMIC_CHOICES.artDirection, 'comics.artDirection', () => res().artDirection);
  const panel = obj(c.panel);
  if (panel) {
    check(panel.borderStyle, COMIC_CHOICES.borderStyle, 'comics.panel.borderStyle', () => res().panel.borderStyle);
    check(panel.fit, COMIC_CHOICES.fit, 'comics.panel.fit', () => res().panel.fit);
  }
  if (Array.isArray(c.panelStyles)) {
    c.panelStyles.forEach((raw, i) => {
      const s = obj(raw);
      if (!s) return;
      const style = () => res().panelStyles.find((p) => p.id === s.id) ?? res().panel;
      check(s.borderStyle, COMIC_CHOICES.borderStyle, `comics.panelStyles[${i}].borderStyle`, () => style().borderStyle);
      check(s.fit, COMIC_CHOICES.fit, `comics.panelStyles[${i}].fit`, () => style().fit);
    });
  }
  const lettering = obj(c.lettering);
  if (lettering) {
    for (const key of ['writingMode', 'textTransform', 'dropFinalStop', 'joinSameSpeaker'] as const) {
      check(lettering[key], COMIC_CHOICES[key], `comics.lettering.${key}`, () => res().lettering[key]);
    }
  }
  if (Array.isArray(c.balloonStyles)) {
    c.balloonStyles.forEach((raw, i) => {
      const s = obj(raw);
      if (!s) return;
      const style = () => res().balloonStyles.find((b) => b.id === s.id);
      for (const key of ['shape', 'tail', 'target', 'position', 'align'] as const) {
        check(s[key], COMIC_CHOICES[key], `comics.balloonStyles[${i}].${key}`, () => style()?.[key] ?? '');
      }
      // Unset on a resolved style: the lettering's case.
      check(s.textTransform, COMIC_CHOICES.textTransform, `comics.balloonStyles[${i}].textTransform`,
        () => style()?.textTransform ?? res().lettering.textTransform);
    });
  }
  return out;
}

/** A `numerals` value that names no digit system (`'arabic'`, `'hindi'`,
 *  a typo): the digits follow the document language, as with `'auto'`
 *  (`unknownNumerals`, `used` the digit system that gives). */
export function collectNumeralsWarnings(config: PostextConfig): ConfigWarning[] {
  const value: unknown = config.numerals;
  if (value === undefined || value === 'auto' || isDigitSystem(value)) return [];
  const used = resolveAllConfig(config).numerals ?? 'latn';
  return [{ kind: 'unknownNumerals', path: 'numerals', value: String(value), used }];
}

/** A limit of the content check that is no whole number from 0 (#849):
 *  the default is used. */
function collectChecksValueWarnings(config: PostextConfig): ConfigWarning[] {
  const c = config.checks?.contentInConfig;
  if (!c || typeof c !== 'object') return [];
  const out: ConfigWarning[] = [];
  const used = resolveContentInConfigCheck(c);
  for (const key of ['maxWords', 'maxChars'] as const) {
    const v: unknown = c[key];
    if (v !== undefined && !(typeof v === 'number' && Number.isInteger(v) && v >= 0)) {
      out.push({ kind: 'unknownConfigValue', path: `checks.contentInConfig.${key}`, value: String(v), used: String(used[key]) });
    }
  }
  return out;
}
