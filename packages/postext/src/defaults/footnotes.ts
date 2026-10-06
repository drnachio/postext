import type { Dimension, FootnoteNumberFormat, FootnoteNumbering, FootnotePlacement, FootnotesConfig, ResolvedFootnotesConfig } from '../types';
import { isJapaneseLanguage } from '../locale';
import { parseNumberFormat } from '../numbering';
import { dimensionsEqual, colorsEqual, startEndAsLeftRight } from './shared';

export const DEFAULT_FOOTNOTES_CONFIG: ResolvedFootnotesConfig = {
  placement: 'column',
  numbering: 'chapter',
  numberFormat: 'decimal',
  markerPosition: 'superscript',
  markerSize: { value: 1, unit: 'em' },
  chapterEndAlign: 'foot',
  fontSize: { value: 0.8, unit: 'em' },
  lineHeight: { value: 1.25, unit: 'em' },
  hangingIndent: { value: 0, unit: 'em' },
  spaceBetween: { value: 0, unit: 'em' },
  spaceAbove: { value: 0.5, unit: 'em' },
  spaceBelowRule: { value: 0.4, unit: 'em' },
  separator: {
    enabled: true,
    width: 0.3,
    lineWidth: { value: 0.5, unit: 'pt' },
  },
};

const NUMBERINGS: ReadonlySet<string> = new Set(['chapter', 'document', 'page', 'column', 'spread']);
const PLACEMENTS: ReadonlySet<string> = new Set(['column', 'chapterEnd', 'spread']);

/** Default size of a side marker (合印 in the line gap, JLReq §4.2.3:
 *  about 6 pt at a 9 pt body) and of a right one (one or two sizes under
 *  the text), in em of the text. */
const SIDE_MARKER_SIZE: Dimension = { value: 0.6, unit: 'em' };
const RIGHT_MARKER_SIZE: Dimension = { value: 0.7, unit: 'em' };

/** The default `markerSize` of a marker set at `position`. */
function markerSizeFor(position: FootnotesConfig['markerPosition']): Dimension {
  return position === 'side' ? SIDE_MARKER_SIZE : position === 'right' ? RIGHT_MARKER_SIZE : DEFAULT_FOOTNOTES_CONFIG.markerSize;
}

/** The reference-symbol sequence (#538), as `pipeline/footnotes` writes it. */
const DEFAULT_SYMBOLS: readonly string[] = ['*', '†', '‡', '§', '‖', '¶'];

/** A footnote `numberFormat` in any spelling: `'symbols'` (or `'*'`) for
 *  the reference symbols, else any spelling of a numeral style (see
 *  `parseNumberFormat`). `undefined` for anything else. */
export function parseFootnoteNumberFormat(value: unknown, locale?: string): FootnoteNumberFormat | undefined {
  if (typeof value === 'string' && (value.trim() === '*' || value.trim().toLowerCase() === 'symbols')) return 'symbols';
  return parseNumberFormat(value, locale);
}

/** `footnotes.symbols` with its empty entries dropped, `undefined` when
 *  that leaves the default sequence (or nothing). */
function symbolsOf(symbols: unknown): string[] | undefined {
  if (!Array.isArray(symbols)) return undefined;
  const seq = symbols.filter((v): v is string => typeof v === 'string' && v.length > 0);
  if (seq.length === 0 || (seq.length === DEFAULT_SYMBOLS.length && seq.every((v, i) => v === DEFAULT_SYMBOLS[i]))) return undefined;
  return seq;
}

/** The numbering an unset `numbering` takes: the document's (Japanese,
 *  spread), else per page for reference symbols at the column foot (they
 *  start again on every page), else by chapter. */
function defaultNumbering(
  doc: { numbering?: FootnoteNumbering },
  numberFormat: FootnoteNumberFormat | undefined,
  placement: FootnotePlacement,
): FootnoteNumbering {
  if (doc.numbering) return doc.numbering;
  return numberFormat === 'symbols' && placement === 'column' ? 'page' : DEFAULT_FOOTNOTES_CONFIG.numbering;
}

/** The marker template of a Japanese vertical book: the number between
 *  full-width parentheses, its digits upright (`cjk.uprightDigits`). */
const JAPANESE_VERTICAL_TEMPLATE = '（{n}）';
/** Turnover lines of a Japanese endnote hang 2 note-ems (JLReq §4.2.4:
 *  1–2). */
const JAPANESE_ENDNOTE_HANG: Dimension = { value: 2, unit: 'em' };

/**
 * The values a document's unset footnote fields take when they are not
 * {@link DEFAULT_FOOTNOTES_CONFIG}'s: a Japanese document's (JLReq §4.2),
 * by writing mode, and the per-spread numbering of `placement: 'spread'`.
 * `placement` is the author's, when set: the endnote setting (a full em
 * after the number, turnover lines hung 2 note-ems) goes with endnotes.
 * Empty for every other document, which resolves exactly as before.
 */
export function footnoteDocumentDefaults(
  locale: string | undefined,
  writingMode: 'horizontal-tb' | 'vertical-rl' | undefined,
  placement?: FootnotePlacement,
): {
  placement?: FootnotePlacement;
  numbering?: FootnoteNumbering;
  markerPosition?: 'right';
  markerTemplate?: string;
  numberGap?: 'em';
  hangingIndent?: Dimension;
  separatorWidth?: number;
} {
  const vertical = writingMode === 'vertical-rl';
  const spread = placement === 'spread';
  if (!isJapaneseLanguage(locale)) return spread ? { numbering: vertical ? 'spread' : 'page' } : {};
  // 後注 in a vertical book, 脚注 numbered per page in a horizontal one.
  const where = placement ?? (vertical ? 'chapterEnd' : 'column');
  return {
    placement: vertical ? 'chapterEnd' : 'column',
    numbering: where === 'spread' ? (vertical ? 'spread' : 'page') : vertical ? 'chapter' : 'page',
    ...(vertical ? { markerPosition: 'right' as const, markerTemplate: JAPANESE_VERTICAL_TEMPLATE } : {}),
    ...(where === 'chapterEnd' ? { numberGap: 'em' as const, hangingIndent: JAPANESE_ENDNOTE_HANG } : {}),
    separatorWidth: 1 / 3,
  };
}

/** `locale`: the document language, which `一` / `壹` formats follow and
 *  whose defaults (Japanese, see {@link footnoteDocumentDefaults}) the
 *  unset fields take, with `writingMode` (`layout.writingMode`). */
export function resolveFootnotesConfig(
  partial?: FootnotesConfig,
  locale?: string,
  writingMode?: 'horizontal-tb' | 'vertical-rl',
): ResolvedFootnotesConfig {
  const d = DEFAULT_FOOTNOTES_CONFIG;
  const asked = partial?.placement !== undefined && PLACEMENTS.has(partial.placement) ? partial.placement : undefined;
  const doc = footnoteDocumentDefaults(locale, writingMode, asked);
  if (!partial && Object.keys(doc).length === 0) return { ...d, separator: { ...d.separator } };
  const p: FootnotesConfig = partial ?? {};
  const sep = p.separator;
  const width = sep?.width;
  const numberFormat = parseFootnoteNumberFormat(p.numberFormat, locale) ?? d.numberFormat;
  const symbols = numberFormat === 'symbols' ? symbolsOf(p.symbols) : undefined;
  const position = p.markerPosition;
  const markerPosition: ResolvedFootnotesConfig['markerPosition'] = position === 'superscript' || position === 'inline' || position === 'side' || position === 'right'
    ? position
    : doc.markerPosition ?? (numberFormat === 'circled-decimal' ? 'inline' : 'superscript');
  const markerSize = p.markerSize;
  const template = p.markerTemplate ?? doc.markerTemplate;
  // Sidenotes on the spread are a vertical book's: a horizontal document
  // sets them at the column foot (`configWarnings` says so).
  const placement = asked === 'spread' && writingMode !== 'vertical-rl' ? 'column' : asked ?? doc.placement ?? d.placement;
  const numberGap = p.numberGap === 'em' || p.numberGap === 'en' ? p.numberGap : doc.numberGap;
  return {
    placement,
    numbering: typeof p.numbering === 'string' && NUMBERINGS.has(p.numbering) ? p.numbering : defaultNumbering(doc, numberFormat, placement),
    numberFormat,
    ...(symbols ? { symbols } : {}),
    markerPosition,
    markerSize: markerSize && Number.isFinite(markerSize.value) && markerSize.value > 0 ? markerSize : markerSizeFor(markerPosition),
    ...(typeof template === 'string' && template !== '{n}' && template.includes('{n}')
      ? { markerTemplate: template }
      : {}),
    ...(p.noteNumberPosition === 'superscript' || p.noteNumberPosition === 'inline'
      ? { noteNumberPosition: p.noteNumberPosition }
      : {}),
    chapterEndAlign: p.chapterEndAlign === 'text' ? 'text' : 'foot',
    fontSize: p.fontSize ?? d.fontSize,
    lineHeight: p.lineHeight ?? d.lineHeight,
    ...(p.color ? { color: p.color } : {}),
    ...(p.textAlign ? { textAlign: startEndAsLeftRight(p.textAlign) } : {}),
    hangingIndent: p.hangingIndent ?? doc.hangingIndent ?? d.hangingIndent,
    ...(numberGap === 'em' ? { numberGap } : {}),
    spaceBetween: p.spaceBetween ?? d.spaceBetween,
    spaceAbove: p.spaceAbove ?? d.spaceAbove,
    spaceBelowRule: p.spaceBelowRule ?? d.spaceBelowRule,
    separator: {
      enabled: sep?.enabled ?? d.separator.enabled,
      width: typeof width === 'number' && Number.isFinite(width) ? Math.min(1, Math.max(0, width)) : doc.separatorWidth ?? d.separator.width,
      lineWidth: sep?.lineWidth ?? d.separator.lineWidth,
      ...(sep?.color ? { color: sep.color } : {}),
    },
  };
}

/** `footnotes` without the fields at their default. `locale` and
 *  `writingMode` are the document's: a Japanese document keeps a value its
 *  own defaults would not give (`markerTemplate: '{n}'`, `placement:
 *  'column'` in a vertical book), so the config reads back as written. */
export function stripFootnotesDefaults(
  footnotes?: FootnotesConfig,
  locale?: string,
  writingMode?: 'horizontal-tb' | 'vertical-rl',
): FootnotesConfig | undefined {
  if (!footnotes) return undefined;
  const d = DEFAULT_FOOTNOTES_CONFIG;
  const doc = footnoteDocumentDefaults(locale, writingMode, footnotes.placement);
  const result: FootnotesConfig = {};
  if (footnotes.placement !== undefined && footnotes.placement !== (doc.placement ?? d.placement)) result.placement = footnotes.placement;
  const numberFormat = parseFootnoteNumberFormat(footnotes.numberFormat);
  const placement = footnotes.placement ?? doc.placement ?? d.placement;
  if (footnotes.numbering !== undefined && footnotes.numbering !== defaultNumbering(doc, numberFormat, placement)) result.numbering = footnotes.numbering;
  if (footnotes.numberFormat !== undefined && numberFormat !== d.numberFormat) result.numberFormat = footnotes.numberFormat;
  if (footnotes.symbols !== undefined && symbolsOf(footnotes.symbols)) result.symbols = footnotes.symbols;
  if (footnotes.markerPosition !== undefined && footnotes.markerPosition !== 'auto' && footnotes.markerPosition !== doc.markerPosition) result.markerPosition = footnotes.markerPosition;
  if (footnotes.markerSize && !dimensionsEqual(footnotes.markerSize, markerSizeFor(footnotes.markerPosition ?? doc.markerPosition))) result.markerSize = footnotes.markerSize;
  if (footnotes.markerTemplate !== undefined && footnotes.markerTemplate !== (doc.markerTemplate ?? '{n}')) result.markerTemplate = footnotes.markerTemplate;
  if (footnotes.noteNumberPosition !== undefined && footnotes.noteNumberPosition !== 'auto') result.noteNumberPosition = footnotes.noteNumberPosition;
  if (footnotes.chapterEndAlign !== undefined && footnotes.chapterEndAlign !== d.chapterEndAlign) result.chapterEndAlign = footnotes.chapterEndAlign;
  if (footnotes.fontSize && !dimensionsEqual(footnotes.fontSize, d.fontSize)) result.fontSize = footnotes.fontSize;
  if (footnotes.lineHeight && !dimensionsEqual(footnotes.lineHeight, d.lineHeight)) result.lineHeight = footnotes.lineHeight;
  if (footnotes.color) result.color = footnotes.color;
  if (footnotes.textAlign) result.textAlign = footnotes.textAlign;
  if (footnotes.hangingIndent && !dimensionsEqual(footnotes.hangingIndent, doc.hangingIndent ?? d.hangingIndent)) result.hangingIndent = footnotes.hangingIndent;
  if (footnotes.numberGap !== undefined && footnotes.numberGap !== (doc.numberGap ?? 'en')) result.numberGap = footnotes.numberGap;
  if (footnotes.spaceBetween && !dimensionsEqual(footnotes.spaceBetween, d.spaceBetween)) result.spaceBetween = footnotes.spaceBetween;
  if (footnotes.spaceAbove && !dimensionsEqual(footnotes.spaceAbove, d.spaceAbove)) result.spaceAbove = footnotes.spaceAbove;
  if (footnotes.spaceBelowRule && !dimensionsEqual(footnotes.spaceBelowRule, d.spaceBelowRule)) result.spaceBelowRule = footnotes.spaceBelowRule;
  const sep = footnotes.separator;
  if (sep) {
    const s: NonNullable<FootnotesConfig['separator']> = {};
    if (sep.enabled !== undefined && sep.enabled !== d.separator.enabled) s.enabled = sep.enabled;
    if (sep.width !== undefined && sep.width !== (doc.separatorWidth ?? d.separator.width)) s.width = sep.width;
    if (sep.lineWidth && !dimensionsEqual(sep.lineWidth, d.separator.lineWidth)) s.lineWidth = sep.lineWidth;
    if (sep.color && !(d.separator.color && colorsEqual(sep.color, d.separator.color))) s.color = sep.color;
    if (Object.keys(s).length > 0) result.separator = s;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
