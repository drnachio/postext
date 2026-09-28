import type { FootnotesConfig, ResolvedFootnotesConfig } from '../types';
import { dimensionsEqual, colorsEqual } from './shared';

export const DEFAULT_FOOTNOTES_CONFIG: ResolvedFootnotesConfig = {
  placement: 'column',
  numbering: 'chapter',
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

export function resolveFootnotesConfig(partial?: FootnotesConfig): ResolvedFootnotesConfig {
  const d = DEFAULT_FOOTNOTES_CONFIG;
  if (!partial) return { ...d, separator: { ...d.separator } };
  const sep = partial.separator;
  const width = sep?.width;
  return {
    placement: partial.placement === 'chapterEnd' ? 'chapterEnd' : 'column',
    numbering: partial.numbering === 'document' ? 'document' : 'chapter',
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
