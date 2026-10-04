import type { FootnotesConfig, ResolvedFootnotesConfig } from '../types';
import { parseNumberFormat } from '../numbering';
import { dimensionsEqual, colorsEqual } from './shared';

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

const NUMBERINGS: ReadonlySet<string> = new Set(['chapter', 'document', 'page', 'column']);

/** `locale`: the document language, which `一` / `壹` formats follow. */
export function resolveFootnotesConfig(partial?: FootnotesConfig, locale?: string): ResolvedFootnotesConfig {
  const d = DEFAULT_FOOTNOTES_CONFIG;
  if (!partial) return { ...d, separator: { ...d.separator } };
  const sep = partial.separator;
  const width = sep?.width;
  const numberFormat = parseNumberFormat(partial.numberFormat, locale) ?? d.numberFormat;
  const position = partial.markerPosition;
  const markerSize = partial.markerSize;
  return {
    placement: partial.placement === 'chapterEnd' ? 'chapterEnd' : 'column',
    numbering: typeof partial.numbering === 'string' && NUMBERINGS.has(partial.numbering) ? partial.numbering : d.numbering,
    numberFormat,
    markerPosition: position === 'superscript' || position === 'inline'
      ? position
      : numberFormat === 'circled-decimal' ? 'inline' : 'superscript',
    markerSize: markerSize && Number.isFinite(markerSize.value) && markerSize.value > 0 ? markerSize : d.markerSize,
    ...(typeof partial.markerTemplate === 'string' && partial.markerTemplate !== '{n}' && partial.markerTemplate.includes('{n}')
      ? { markerTemplate: partial.markerTemplate }
      : {}),
    ...(partial.noteNumberPosition === 'superscript' || partial.noteNumberPosition === 'inline'
      ? { noteNumberPosition: partial.noteNumberPosition }
      : {}),
    chapterEndAlign: partial.chapterEndAlign === 'text' ? 'text' : 'foot',
    fontSize: partial.fontSize ?? d.fontSize,
    lineHeight: partial.lineHeight ?? d.lineHeight,
    ...(partial.color ? { color: partial.color } : {}),
    ...(partial.textAlign ? { textAlign: partial.textAlign } : {}),
    hangingIndent: partial.hangingIndent ?? d.hangingIndent,
    spaceBetween: partial.spaceBetween ?? d.spaceBetween,
    spaceAbove: partial.spaceAbove ?? d.spaceAbove,
    spaceBelowRule: partial.spaceBelowRule ?? d.spaceBelowRule,
    separator: {
      enabled: sep?.enabled ?? d.separator.enabled,
      width: typeof width === 'number' && Number.isFinite(width) ? Math.min(1, Math.max(0, width)) : d.separator.width,
      lineWidth: sep?.lineWidth ?? d.separator.lineWidth,
      ...(sep?.color ? { color: sep.color } : {}),
    },
  };
}

export function stripFootnotesDefaults(footnotes?: FootnotesConfig): FootnotesConfig | undefined {
  if (!footnotes) return undefined;
  const d = DEFAULT_FOOTNOTES_CONFIG;
  const result: FootnotesConfig = {};
  if (footnotes.placement !== undefined && footnotes.placement !== d.placement) result.placement = footnotes.placement;
  if (footnotes.numbering !== undefined && footnotes.numbering !== d.numbering) result.numbering = footnotes.numbering;
  if (footnotes.numberFormat !== undefined && parseNumberFormat(footnotes.numberFormat) !== d.numberFormat) result.numberFormat = footnotes.numberFormat;
  if (footnotes.markerPosition !== undefined && footnotes.markerPosition !== 'auto') result.markerPosition = footnotes.markerPosition;
  if (footnotes.markerSize && !dimensionsEqual(footnotes.markerSize, d.markerSize)) result.markerSize = footnotes.markerSize;
  if (footnotes.markerTemplate !== undefined && footnotes.markerTemplate !== '{n}') result.markerTemplate = footnotes.markerTemplate;
  if (footnotes.noteNumberPosition !== undefined && footnotes.noteNumberPosition !== 'auto') result.noteNumberPosition = footnotes.noteNumberPosition;
  if (footnotes.chapterEndAlign !== undefined && footnotes.chapterEndAlign !== d.chapterEndAlign) result.chapterEndAlign = footnotes.chapterEndAlign;
  if (footnotes.fontSize && !dimensionsEqual(footnotes.fontSize, d.fontSize)) result.fontSize = footnotes.fontSize;
  if (footnotes.lineHeight && !dimensionsEqual(footnotes.lineHeight, d.lineHeight)) result.lineHeight = footnotes.lineHeight;
  if (footnotes.color) result.color = footnotes.color;
  if (footnotes.textAlign) result.textAlign = footnotes.textAlign;
  if (footnotes.hangingIndent && !dimensionsEqual(footnotes.hangingIndent, d.hangingIndent)) result.hangingIndent = footnotes.hangingIndent;
  if (footnotes.spaceBetween && !dimensionsEqual(footnotes.spaceBetween, d.spaceBetween)) result.spaceBetween = footnotes.spaceBetween;
  if (footnotes.spaceAbove && !dimensionsEqual(footnotes.spaceAbove, d.spaceAbove)) result.spaceAbove = footnotes.spaceAbove;
  if (footnotes.spaceBelowRule && !dimensionsEqual(footnotes.spaceBelowRule, d.spaceBelowRule)) result.spaceBelowRule = footnotes.spaceBelowRule;
  const sep = footnotes.separator;
  if (sep) {
    const s: NonNullable<FootnotesConfig['separator']> = {};
    if (sep.enabled !== undefined && sep.enabled !== d.separator.enabled) s.enabled = sep.enabled;
    if (sep.width !== undefined && sep.width !== d.separator.width) s.width = sep.width;
    if (sep.lineWidth && !dimensionsEqual(sep.lineWidth, d.separator.lineWidth)) s.lineWidth = sep.lineWidth;
    if (sep.color && !(d.separator.color && colorsEqual(sep.color, d.separator.color))) s.color = sep.color;
    if (Object.keys(s).length > 0) result.separator = s;
  }
  return Object.keys(result).length > 0 ? result : undefined;
}
