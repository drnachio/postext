// Caption and note text laid out under or beside a resource, and the label
// lines of a resource (#1276: split out of resourceLayout.ts).
import type { InlineSpan } from '../../../parse/index.js';
import { suffixJoiner } from '../../../parse/inlineFormatting.js';
import type { ResourceType, Resource, ResolvedCaptionStyleConfig } from '../../../types.js';
import type { ResolvedConfig, VDTLine } from '../../../vdt.js';
import { type MeasurementCache, buildFontString } from '../../../measure/index.js';
import { dimensionToPx } from '../../../units.js';
import { parseInlineSnippetSpans } from '../../../parse/inlineSnippet.js';
import { resolveChipSpans, chipContextOf } from '../../text/chips.js';
import { withSnippetInlineCode } from '../../code/codeInline.js';
import { mergeCaptionStyle } from '../../../defaults/resources/captionStyle.js';
import { resolveBodyStyle } from '../../styles.js';
import type { ResourceNumberingMap } from '../resourceNumbering.js';
import { type CaptionCitations, resolveCitationSpans } from '../../references/citations.js';
import { captionLabelText, annotatedSpans, resolveSwatchSpans, resolveRefSpans } from './refSpans.js';
import { withSnippetCache, snippetMathSpans, measureSnippetLines, type SnippetFonts } from './snippets.js';

/**
 * Measure a resource block (image / svg / table) plus its caption into a
 * placement-ready {@link ResolvedResourceBlock}. Returns the block and its
 * combined height (figure body + gap + caption) — the value placement uses to
 * decide whether the group fits the remaining column space.
 */
/** What {@link layoutCaptionText} sets: a caption's text and where it
 *  comes from. */
export interface CaptionTextInput {
  /** Where the caption is measured through (see `ResourceLayoutInput`). */
  cache?: MeasurementCache;
  /** The description as written (inline Markdown); may be empty. */
  text: string;
  /** The resource type whose prefix opens the caption and whose own
   *  caption style is laid over the document's. */
  resourceType: ResourceType | undefined;
  /** The rendered number (`''` for none). */
  number: string;
  resolved: ResolvedConfig;
  /** Width of the caption band (px), the bar padding included. */
  width: number;
  resourceNumbering: ResourceNumberingMap;
  resourceTypes: ResourceType[];
  resources: Resource[];
  /** The formatted citations of the caption (#529). */
  citations?: CaptionCitations['caption'];
  /** Set in italics after the description (a continued table's "(cont.)"). */
  suffix?: string;
}

/** A caption laid out at the block origin (y = 0): its lines, fonts and
 *  colours, and the height of its band (lines plus the bar padding on
 *  both sides; 0 without a caption). */
export interface CaptionTextLayout {
  style: ResolvedCaptionStyleConfig;
  lines: VDTLine[];
  fonts: { fontString: string; boldFontString: string; italicFontString: string; boldItalicFontString: string };
  fontPx: number;
  lineHeightPx: number;
  gapPx: number;
  paddingPx: number;
  bandHeight: number;
  linkColor: string;
}

/**
 * A resource caption — "Figure 1.7. Description" — in the caption style
 * (`captionStyle`, with the resource type's own laid over it): the label
 * and number in the label's weight and slant, the description in its own,
 * inline `:ref`s, citations, maths, swatches and chips resolved. Shared by
 * resource blocks and comic strips (#590). Measured in the writing mode in
 * force (a resource block sets it horizontally).
 */
export function layoutCaptionText(input: CaptionTextInput): CaptionTextLayout {
  return withSnippetCache(input.cache, () => layoutCaptionTextIn(input));
}

function layoutCaptionTextIn(input: CaptionTextInput): CaptionTextLayout {
  const { resolved, resourceType, number, resourceNumbering, resourceTypes, resources } = input;
  const dpi = resolved.page.dpi;
  const bodyStyle = resolveBodyStyle(resolved);
  const lineHeightRatio = bodyStyle.lineHeightPx / bodyStyle.fontSizePx;
  const normalWeight = resolved.bodyText.fontWeight.toString();
  const boldWeight = resolved.bodyText.boldFontWeight.toString();
  const refStyle = { bold: resolved.bodyText.referenceBold, italic: resolved.bodyText.referenceItalic, labelNumberGap: resolved.captionStyle.labelNumberGap, breakLabels: resolved.crossRefs.breakLabels };
  const cs: ResolvedCaptionStyleConfig = mergeCaptionStyle(
    resolved.captionStyle,
    resourceType?.captionStyle,
    resolved.colorPalette,
  );
  const captionFontPx = dimensionToPx(cs.fontSize, dpi);
  const captionLineHeightPx = captionFontPx * lineHeightRatio;
  const captionGapPx = dimensionToPx(cs.gap, dpi, captionFontPx);
  const captionPaddingPx = cs.backgroundEnabled ? dimensionToPx(cs.padding, dpi, captionFontPx) : 0;
  // Caption font set (label + description share one typeface/size; weight and
  // slant vary per span).
  const captionFontString = buildFontString(cs.fontFamily, captionFontPx, normalWeight);
  const captionBoldFontString = buildFontString(cs.fontFamily, captionFontPx, boldWeight);
  const captionItalicFontString = buildFontString(cs.fontFamily, captionFontPx, normalWeight, 'italic');
  const captionBoldItalicFontString = buildFontString(cs.fontFamily, captionFontPx, boldWeight, 'italic');

  const captionPrefix = resourceType?.captionPrefix ?? '';
  // Inline `:ref` labels render in the configured reference colour (defaults to
  // the emphasis/bold colour).
  const linkColor = resolved.bodyText.referenceColor.hex;
  // Caption lines measured at the block origin (y = 0); positioned below.
  let measuredCaption: VDTLine[] = [];
  const captionText = input.text;
  const hasCaption = captionText.trim().length > 0 || captionPrefix.length > 0;
  if (hasCaption) {
    // Prefix span: "<captionPrefix> <number>. " (non-breaking inside the label).
    const prefixText = captionLabelText(captionPrefix, number, cs);
    // The annotations are resolved on the spans as written, before the
    // style slants the description: a caption set in italics is no
    // emphasis.
    const resolvedSpans = annotatedSpans(resolveChipSpans(resolveSwatchSpans(resolveRefSpans(
      snippetMathSpans(
        resolveCitationSpans(
          withSnippetInlineCode(parseInlineSnippetSpans(captionText, { citations: true }), captionText, resolved.codeStyle?.inline, dpi, captionFontPx),
          input.citations,
        ),
        captionFontPx,
        captionLineHeightPx,
        resolved.math,
      ),
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
    ), resolved.colorPalette, resources, { dpi, fontSizePx: captionFontPx }), chipContextOf(resolved), captionFontPx), { cjk: resolved.cjk, dpi }, captionFontString);
    // Description spans pick up the configured slant on top of their own markup.
    const descSpans: InlineSpan[] = cs.descriptionItalic
      ? resolvedSpans.map((s) => ({ ...s, italic: s.italic || true }))
      : resolvedSpans;
    const suffix = input.suffix ?? '';
    const suffixSpans: InlineSpan[] = suffix.length > 0
      ? [{ text: `${descSpans.length > 0 ? suffixJoiner(suffix) : ''}${suffix}`, bold: false, italic: true }]
      : [];
    const allSpans: InlineSpan[] = prefixText.length > 0
      ? [{ text: prefixText, bold: cs.labelBold, italic: cs.labelItalic, captionLabel: true }, ...descSpans, ...suffixSpans]
      : [...descSpans, ...suffixSpans];
    measuredCaption = measureSnippetLines(
      allSpans,
      [captionFontString, captionBoldFontString, captionItalicFontString, captionBoldItalicFontString],
      Math.max(1, input.width - captionPaddingPx * 2),
      captionLineHeightPx,
      { textAlign: cs.align },
    );
  }
  const captionTextHeight = measuredCaption.length * captionLineHeightPx;
  // Height of the caption band: the text plus the bar padding on both sides.
  const captionBandHeight = measuredCaption.length > 0
    ? captionTextHeight + captionPaddingPx * 2
    : 0;
  return {
    style: cs,
    lines: measuredCaption,
    fonts: { fontString: captionFontString, boldFontString: captionBoldFontString, italicFontString: captionItalicFontString, boldItalicFontString: captionBoldItalicFontString },
    fontPx: captionFontPx,
    lineHeightPx: captionLineHeightPx,
    gapPx: captionGapPx,
    paddingPx: captionPaddingPx,
    bandHeight: captionBandHeight,
    linkColor,
  };
}

/** What {@link layoutLabelLines} sets a figure label with (#860). */
export interface LabelLinesInput {
  /** The label's text as the parser read it (inline Markdown). */
  spans: InlineSpan[];
  /** Normal, bold, italic and bold italic faces. */
  fonts: SnippetFonts;
  fontPx: number;
  lineHeightPx: number;
  /** The measure the text wraps at. */
  maxWidthPx: number;
  letterSpacingPx?: number;
  direction?: 'ltr' | 'rtl';
  resolved: ResolvedConfig;
  resourceNumbering?: ResourceNumberingMap;
  resourceTypes?: ResourceType[];
  resources?: Resource[];
  cache?: MeasurementCache;
}

/**
 * A figure label's text as lines (#860), set as a caption is: references,
 * formulas, swatches, chips and highlight marks resolved, forced breaks
 * (`\\`) kept, every line flush left at its natural width from y = 0.
 */
export function layoutLabelLines(input: LabelLinesInput): VDTLine[] {
  return withSnippetCache(input.cache, () => {
    const { resolved, fontPx, lineHeightPx } = input;
    const refStyle = { bold: resolved.bodyText.referenceBold, italic: resolved.bodyText.referenceItalic, labelNumberGap: resolved.captionStyle.labelNumberGap, breakLabels: resolved.crossRefs.breakLabels };
    const spans = annotatedSpans(resolveChipSpans(resolveSwatchSpans(resolveRefSpans(
      snippetMathSpans(input.spans, fontPx, lineHeightPx, resolved.math),
      input.resourceNumbering ?? {},
      input.resourceTypes ?? [],
      input.resources ?? [],
      refStyle,
    ), resolved.colorPalette, input.resources, { dpi: resolved.page.dpi, fontSizePx: fontPx }), chipContextOf(resolved), fontPx), { cjk: resolved.cjk, dpi: resolved.page.dpi }, input.fonts[0]);
    const tracking = input.letterSpacingPx ?? 0;
    // A name on a map breaks between words only.
    const lines = measureSnippetLines(spans, input.fonts, Math.max(1, input.maxWidthPx), lineHeightPx, {
      textAlign: 'left',
      hyphenate: false,
      ...(tracking !== 0 ? { letterSpacingPx: tracking } : {}),
      ...(input.direction ? { direction: input.direction } : {}),
    });
    return tracking !== 0 ? lines.map((line) => ({ ...line, letterSpacing: tracking })) : lines;
  });
}
