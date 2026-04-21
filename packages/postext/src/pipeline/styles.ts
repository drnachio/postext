import type { ResolvedHeadingLevelConfig, TextAlign } from '../types';
import { dimensionToPx } from '../units';
import type { ResolvedConfig } from '../vdt';
import { buildFontString } from '../measure';
import { computeBaselineGrid } from './config';

export interface BlockStyle {
  fontString: string;
  boldFontString?: string;
  italicFontString?: string;
  boldItalicFontString?: string;
  fontSizePx: number;
  lineHeightPx: number;
  color: string;
  boldColor?: string;
  italicColor?: string;
  textAlign: TextAlign;
  hyphenate: boolean;
  marginTopPx: number;
  marginBottomPx: number;
  firstLineIndentPx: number;
  hangingIndent: boolean;
}

export function resolveBodyStyle(resolved: ResolvedConfig): BlockStyle {
  const dpi = resolved.page.dpi;
  const fontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const lineHeightPx = computeBaselineGrid(resolved);
  const weight = resolved.bodyText.fontWeight.toString();
  const fontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, weight);
  const boldWeight = resolved.bodyText.boldFontWeight.toString();
  const boldFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, boldWeight);
  const italicFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, weight, 'italic');
  const boldItalicFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, boldWeight, 'italic');
  const textAlign = resolved.bodyText.textAlign;
  const hyphenate = resolved.bodyText.hyphenation.enabled && textAlign === 'justify';
  const firstLineIndentPx = dimensionToPx(resolved.bodyText.firstLineIndent, dpi, fontSizePx);
  const hangingIndent = resolved.bodyText.hangingIndent;
  const marginBottomPx = resolved.bodyText.paragraphSpacing ? lineHeightPx : 0;
  return { fontString, boldFontString, italicFontString, boldItalicFontString, fontSizePx, lineHeightPx, color: resolved.bodyText.color.hex, boldColor: resolved.bodyText.boldColor?.hex, italicColor: resolved.bodyText.italicColor?.hex, textAlign, hyphenate, marginTopPx: 0, marginBottomPx, firstLineIndentPx, hangingIndent };
}

export function resolveHeadingStyle(
  level: number,
  resolved: ResolvedConfig,
): BlockStyle {
  const dpi = resolved.page.dpi;
  const headingConfig: ResolvedHeadingLevelConfig =
    resolved.headings.levels.find((l) => l.level === level) ?? resolved.headings.levels[0]!;

  const fontSizePx = dimensionToPx(headingConfig.fontSize, dpi);
  const lineHeightDim = headingConfig.lineHeight;
  let lineHeightPx: number;
  if (lineHeightDim.unit === 'em' || lineHeightDim.unit === 'rem') {
    lineHeightPx = fontSizePx * lineHeightDim.value;
  } else {
    lineHeightPx = dimensionToPx(lineHeightDim, dpi, fontSizePx);
  }

  const weight = headingConfig.fontWeight.toString();
  const baseItalic = headingConfig.italic ? 'italic' : 'normal';
  const flipItalic = headingConfig.italic ? 'normal' : 'italic';
  const fontString = buildFontString(headingConfig.fontFamily, fontSizePx, weight, baseItalic);
  const boldFontString = fontString;
  const italicFontString = buildFontString(headingConfig.fontFamily, fontSizePx, weight, flipItalic);
  const boldItalicFontString = italicFontString;
  const textAlign = resolved.headings.textAlign;
  const marginTopPx = dimensionToPx(headingConfig.marginTop, dpi, fontSizePx);
  const marginBottomPx = dimensionToPx(headingConfig.marginBottom, dpi, fontSizePx);
  return { fontString, boldFontString, italicFontString, boldItalicFontString, fontSizePx, lineHeightPx, color: headingConfig.color.hex, textAlign, hyphenate: false, marginTopPx, marginBottomPx, firstLineIndentPx: 0, hangingIndent: false };
}

export function resolveMathDisplayStyle(resolved: ResolvedConfig): BlockStyle {
  const dpi = resolved.page.dpi;
  const fontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi) * resolved.math.fontSizeScale;
  const lineHeightPx = computeBaselineGrid(resolved);
  const weight = resolved.bodyText.fontWeight.toString();
  const fontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, weight);
  const marginTopPx = dimensionToPx(resolved.math.marginTop, dpi, fontSizePx);
  const marginBottomPx = dimensionToPx(resolved.math.marginBottom, dpi, fontSizePx);
  const color = resolved.math.color?.hex ?? resolved.bodyText.color.hex;
  return {
    fontString,
    fontSizePx,
    lineHeightPx,
    color,
    textAlign: 'center',
    hyphenate: false,
    marginTopPx,
    marginBottomPx,
    firstLineIndentPx: 0,
    hangingIndent: false,
  };
}

export function resolveBlockquoteStyle(resolved: ResolvedConfig): BlockStyle {
  const dpi = resolved.page.dpi;
  const fontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const lineHeightPx = computeBaselineGrid(resolved);
  const weight = resolved.bodyText.fontWeight.toString();
  const fontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, weight, 'italic');
  const boldWeight = resolved.bodyText.boldFontWeight.toString();
  const boldFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, boldWeight, 'italic');
  // Inside a blockquote (already italic), `*text*` flips back to upright.
  const italicFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, weight, 'normal');
  const boldItalicFontString = buildFontString(resolved.bodyText.fontFamily, fontSizePx, boldWeight, 'normal');
  const textAlign = resolved.bodyText.textAlign;
  const hyphenate = resolved.bodyText.hyphenation.enabled && textAlign === 'justify';
  const firstLineIndentPx = dimensionToPx(resolved.bodyText.firstLineIndent, dpi, fontSizePx);
  const hangingIndent = resolved.bodyText.hangingIndent;
  return { fontString, boldFontString, italicFontString, boldItalicFontString, fontSizePx, lineHeightPx, color: '#666666', textAlign, hyphenate, marginTopPx: 0, marginBottomPx: 0, firstLineIndentPx, hangingIndent };
}
