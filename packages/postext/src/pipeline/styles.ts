import type { ResolvedHeadingLevelConfig, ResolvedParagraphStyleConfig, TextAlign } from '../types';
import { dimensionToPx } from '../units';
import type { ResolvedConfig } from '../vdt';
import { buildFontString } from '../measure';
import { computeBaselineGrid } from './config';
import { DEFAULT_BLOCKQUOTE_CONFIG } from '../defaults/bodyText';

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
  /** Hyphenation zone (px) of a ragged block that hyphenates
   *  (`bodyText.hyphenation.ragged`); unset for justified text and for
   *  blocks that do not hyphenate. */
  hyphenationZonePx?: number;
  marginTopPx: number;
  marginBottomPx: number;
  firstLineIndentPx: number;
  hangingIndent: boolean;
  /** Indent of every line (px) from the left edge of the column or box —
   *  a paragraph style's `indent`; the first-line and hanging indents are
   *  measured from it. Unset: none. */
  indentPx?: number;
  /** Set the text in small capitals (a paragraph style's or a callout
   *  body's `smallCaps`): every span is measured and painted so. */
  smallCaps?: boolean;
  /** Set the text in capitals (a paragraph style's `textTransform:
   *  'uppercase'`): the block's text is upper-cased, length for length,
   *  before it is measured. */
  uppercase?: boolean;
  /** Tracking the style itself sets (px after every glyph; negative
   *  tightens) — a heading level's `letterSpacing`. Measured on the rich
   *  path and stamped on the block (`VDTBlock.letterSpacing`). Unset: none. */
  letterSpacingPx?: number;
}

/** The four faces of a text style: `italic` sets the regular text in
 *  italics and flips `*…*` runs back to upright (the blockquote rule). */
function textFaces(
  family: string,
  sizePx: number,
  weight: number,
  boldWeight: number,
  italic: boolean,
): Pick<BlockStyle, 'fontString' | 'boldFontString' | 'italicFontString' | 'boldItalicFontString'> {
  const base = italic ? 'italic' : 'normal';
  const flip = italic ? 'normal' : 'italic';
  return {
    fontString: buildFontString(family, sizePx, weight.toString(), base),
    boldFontString: buildFontString(family, sizePx, boldWeight.toString(), base),
    italicFontString: buildFontString(family, sizePx, weight.toString(), flip),
    boldItalicFontString: buildFontString(family, sizePx, boldWeight.toString(), flip),
  };
}

/** Whether a block with this alignment hyphenates, and its hyphenation zone
 *  when it is ragged: justified text hyphenates when `enabled`; ragged text
 *  only when `bodyText.hyphenation.ragged` is on too, within the zone. */
function hyphenationFor(
  enabled: boolean,
  textAlign: TextAlign,
  resolved: ResolvedConfig,
  fontSizePx: number,
): Pick<BlockStyle, 'hyphenate' | 'hyphenationZonePx'> {
  if (!enabled) return { hyphenate: false };
  if (textAlign === 'justify') return { hyphenate: true };
  const h = resolved.bodyText.hyphenation;
  if (!h.ragged) return { hyphenate: false };
  return { hyphenate: true, hyphenationZonePx: Math.max(0, dimensionToPx(h.zone, resolved.page.dpi, fontSizePx)) };
}

export function resolveBodyStyle(resolved: ResolvedConfig): BlockStyle {
  const dpi = resolved.page.dpi;
  const fontSizePx = dimensionToPx(resolved.bodyText.fontSize, dpi);
  const lineHeightPx = computeBaselineGrid(resolved);
  const body = resolved.bodyText;
  // `italic` / `smallCaps` are set only in a callout's derived config.
  const faces = textFaces(body.fontFamily, fontSizePx, body.fontWeight, body.boldFontWeight, !!body.italic);
  const textAlign = body.textAlign;
  const hyphenation = hyphenationFor(body.hyphenation.enabled, textAlign, resolved, fontSizePx);
  const firstLineIndentPx = dimensionToPx(body.firstLineIndent, dpi, fontSizePx);
  const hangingIndent = body.hangingIndent;
  const marginBottomPx = body.paragraphSpacing ? lineHeightPx : 0;
  return { ...faces, fontSizePx, lineHeightPx, color: body.color.hex, boldColor: body.boldColor?.hex, italicColor: body.italicColor?.hex, referenceColor: body.referenceColor.hex, referenceBold: body.referenceBold, referenceItalic: body.referenceItalic, textAlign, ...hyphenation, marginTopPx: 0, marginBottomPx, firstLineIndentPx, hangingIndent, ...(body.smallCaps ? { smallCaps: true } : {}) };
}

export function resolveHeadingStyle(
  level: number,
  resolved: ResolvedConfig,
  /** The level config to use — a heading style's merged level (see
   *  `headingLevelFor`) — instead of the plain level lookup. */
  levelConfig?: ResolvedHeadingLevelConfig,
  /** Whether the heading carries a bold run (`**…**`, EF-122): its bold
   *  faces then take the body's bold weight, or the level's own when it is
   *  heavier. Without one they stay the level's face, so a heading with no
   *  bold run keeps the font strings it always had. */
  hasBold = false,
): BlockStyle {
  const dpi = resolved.page.dpi;
  const headingConfig: ResolvedHeadingLevelConfig = levelConfig
    ?? resolved.headings.levels.find((l) => l.level === level) ?? resolved.headings.levels[0]!;

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
  const italicFontString = buildFontString(headingConfig.fontFamily, fontSizePx, weight, flipItalic);
  const boldWeight = hasBold ? Math.max(headingConfig.fontWeight, resolved.bodyText.boldFontWeight) : headingConfig.fontWeight;
  const boldFontString = boldWeight === headingConfig.fontWeight
    ? fontString
    : buildFontString(headingConfig.fontFamily, fontSizePx, boldWeight.toString(), baseItalic);
  const boldItalicFontString = boldWeight === headingConfig.fontWeight
    ? italicFontString
    : buildFontString(headingConfig.fontFamily, fontSizePx, boldWeight.toString(), flipItalic);
  const textAlign = resolved.headings.textAlign;
  const marginTopPx = dimensionToPx(headingConfig.marginTop, dpi, fontSizePx);
  const marginBottomPx = dimensionToPx(headingConfig.marginBottom, dpi, fontSizePx);
  // Tracking (EF-83): left unset at zero so untracked headings measure (and
  // cache) exactly as before.
  const trackingPx = headingConfig.letterSpacing ? dimensionToPx(headingConfig.letterSpacing, dpi, fontSizePx) : 0;
  const letterSpacingPx = Number.isFinite(trackingPx) && trackingPx !== 0 ? trackingPx : undefined;
  return { fontString, boldFontString, italicFontString, boldItalicFontString, fontSizePx, lineHeightPx, color: headingConfig.color.hex, textAlign, hyphenate: false, marginTopPx, marginBottomPx, firstLineIndentPx: 0, hangingIndent: false, ...(letterSpacingPx !== undefined ? { letterSpacingPx } : {}) };
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

/** Block style for Markdown blockquotes (`> …`), from
 *  `bodyText.blockquote` over the body's face, size, leading, alignment and
 *  hyphenation: its colour (1.4's grey by default), italics (a `*…*` run
 *  inside flips back to upright), the side indent every line takes
 *  (`indentPx`) and the first-line indent measured from it (the body's
 *  unless the blockquote names one). The body's bold, italic and
 *  reference colours do not apply, as in postext 1.4. */
export function resolveBlockquoteStyle(resolved: ResolvedConfig): BlockStyle {
  const dpi = resolved.page.dpi;
  const body = resolved.bodyText;
  // A resolved configuration built by hand may lack it.
  const quote = body.blockquote ?? DEFAULT_BLOCKQUOTE_CONFIG;
  const fontSizePx = dimensionToPx(body.fontSize, dpi);
  const lineHeightPx = computeBaselineGrid(resolved);
  const faces = textFaces(body.fontFamily, fontSizePx, body.fontWeight, body.boldFontWeight, quote.italic);
  const textAlign = body.textAlign;
  const hyphenation = hyphenationFor(body.hyphenation.enabled, textAlign, resolved, fontSizePx);
  const firstLineIndentPx = dimensionToPx(quote.firstLineIndent ?? body.firstLineIndent, dpi, fontSizePx);
  const hangingIndent = body.hangingIndent;
  const indentPx = dimensionToPx(quote.indent, dpi, fontSizePx);
  return {
    ...faces,
    fontSizePx,
    lineHeightPx,
    color: quote.color.hex,
    textAlign,
    ...hyphenation,
    marginTopPx: 0,
    marginBottomPx: 0,
    firstLineIndentPx,
    hangingIndent,
    ...(Number.isFinite(indentPx) && indentPx > 0 ? { indentPx } : {}),
    ...(body.smallCaps ? { smallCaps: true } : {}),
  };
}

/** Block style for paragraphs inside a `:::paragraphs{style="…"}` container.
 *  Mirrors {@link resolveBodyStyle} (reference colours come from the body
 *  text; the bold and italic colours too, unless the style sets its own)
 *  with the style's own face, weights, slant, size, leading, alignment,
 *  indents and small caps. A non-zero `hangingIndent`
 *  turns into the measurer's hanging mode (lines 2+ indented), and `indent`
 *  shifts every line (`indentPx`); `spaceBetween` lands in
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
  const faces = textFaces(style.fontFamily, fontSizePx, style.fontWeight, style.boldFontWeight, style.italic);
  const textAlign = style.textAlign;
  const hyphenation = hyphenationFor(style.hyphenation, textAlign, resolved, fontSizePx);
  const hangingIndentPx = dimensionToPx(style.hangingIndent, dpi, fontSizePx);
  const hangingIndent = hangingIndentPx > 0;
  const firstLineIndentPx = hangingIndent
    ? hangingIndentPx
    : dimensionToPx(style.firstLineIndent, dpi, fontSizePx);
  const marginBottomPx = dimensionToPx(style.spaceBetween, dpi, fontSizePx);
  const indentPx = style.indent ? dimensionToPx(style.indent, dpi, fontSizePx) : 0;
  return {
    ...faces,
    fontSizePx,
    lineHeightPx,
    color: style.color.hex,
    boldColor: style.boldColor?.hex ?? body.boldColor?.hex,
    italicColor: style.italicColor?.hex ?? body.italicColor?.hex,
    referenceColor: body.referenceColor.hex,
    referenceBold: body.referenceBold,
    referenceItalic: body.referenceItalic,
    textAlign,
    ...hyphenation,
    marginTopPx: 0,
    marginBottomPx,
    firstLineIndentPx,
    hangingIndent,
    ...(Number.isFinite(indentPx) && indentPx > 0 ? { indentPx } : {}),
    ...(style.smallCaps ? { smallCaps: true } : {}),
    ...(style.textTransform === 'uppercase' ? { uppercase: true } : {}),
  };
}
