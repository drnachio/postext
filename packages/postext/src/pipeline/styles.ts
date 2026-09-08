import type { ResolvedHeadingLevelConfig, ResolvedParagraphStyleConfig, TextAlign } from '../types';
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
  /** Colour for inline `:ref` reference labels. */
  referenceColor?: string;
  /** Whether reference labels render in the bold font. */
  referenceBold?: boolean;
  /** Whether reference labels render italic. */
  referenceItalic?: boolean;
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
  return { fontString, boldFontString, italicFontString, boldItalicFontString, fontSizePx, lineHeightPx, color: resolved.bodyText.color.hex, boldColor: resolved.bodyText.boldColor?.hex, italicColor: resolved.bodyText.italicColor?.hex, referenceColor: resolved.bodyText.referenceColor.hex, referenceBold: resolved.bodyText.referenceBold, referenceItalic: resolved.bodyText.referenceItalic, textAlign, hyphenate, marginTopPx: 0, marginBottomPx, firstLineIndentPx, hangingIndent };
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

/** Block style for paragraphs inside a `:::paragraphs{style="…"}` container.
 *  Mirrors {@link resolveBodyStyle} (weights, emphasis and reference colours
 *  come from the body text) with the style's own face, size, leading,
 *  alignment and indents. A non-zero `hangingIndent` turns into the
 *  measurer's hanging mode (lines 2+ indented); `spaceBetween` lands in
 *  `marginBottomPx`, the same slot body `paragraphSpacing` uses, so the gap
 *  flows through pending spacing and the grid snap like any other margin. */
export function resolveParagraphStyle(
  style: ResolvedParagraphStyleConfig,
  resolved: ResolvedConfig,
): BlockStyle {
  const dpi = resolved.page.dpi;
  const body = resolved.bodyText;
  const fontSizePx = dimensionToPx(style.fontSize, dpi);
  const lh = style.lineHeight;
  const lineHeightPx = lh.unit === 'em' || lh.unit === 'rem'
    ? fontSizePx * lh.value
    : dimensionToPx(lh, dpi, fontSizePx);
  const weight = body.fontWeight.toString();
  const boldWeight = body.boldFontWeight.toString();
  const fontString = buildFontString(style.fontFamily, fontSizePx, weight);
  const boldFontString = buildFontString(style.fontFamily, fontSizePx, boldWeight);
  const italicFontString = buildFontString(style.fontFamily, fontSizePx, weight, 'italic');
  const boldItalicFontString = buildFontString(style.fontFamily, fontSizePx, boldWeight, 'italic');
  const textAlign = style.textAlign;
  const hyphenate = style.hyphenation && textAlign === 'justify';
  const hangingIndentPx = dimensionToPx(style.hangingIndent, dpi, fontSizePx);
  const hangingIndent = hangingIndentPx > 0;
  const firstLineIndentPx = hangingIndent
    ? hangingIndentPx
    : dimensionToPx(style.firstLineIndent, dpi, fontSizePx);
  const marginBottomPx = dimensionToPx(style.spaceBetween, dpi, fontSizePx);
  return {
    fontString,
    boldFontString,
    italicFontString,
    boldItalicFontString,
    fontSizePx,
    lineHeightPx,
    color: style.color.hex,
    boldColor: body.boldColor?.hex,
    italicColor: body.italicColor?.hex,
    referenceColor: body.referenceColor.hex,
    referenceBold: body.referenceBold,
    referenceItalic: body.referenceItalic,
    textAlign,
    hyphenate,
    marginTopPx: 0,
    marginBottomPx,
    firstLineIndentPx,
    hangingIndent,
  };
}
