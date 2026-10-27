// The spans of a block as they are measured, and the stanzas of a poem a
// stanza block sets (#1278: split out of measureContentBlock.ts).
import type { ContentBlock } from '../../../parse/index.js';
import type { BlockStyle } from '../../styles.js';
import { enrichMathSpans } from '../buildHelpers.js';
import { uppercasePreservingLength } from '../buildBlockKind.js';
import { measuringVertically } from '../../../measure/vertical.js';
import { resolveRefSpans, resolveSwatchSpans } from '../../resources/resourceLayout.js';
import { resolveChipSpans, chipContextOf } from '../../text/chips.js';
import { hasAnnotations, resolveAnnotationSpans } from '../../text/annotations.js';
import { dimensionToPx } from '../../../units.js';
import type { BlockMeasureContext } from './types.js';

/** The spans of a block as they are measured: inline maths rendered,
 *  `:ref` labels, footnote markers, swatches and chips resolved, small
 *  capitals and Chinese and Japanese annotations applied. */
export function resolveInlineSpans(block: ContentBlock, style: BlockStyle, ctx: BlockMeasureContext): ContentBlock {
  const { resolved, bodyStyle } = ctx;
  let contentBlock = block;
  // Resolve inline math on spans (no-op when the block has no math).
  contentBlock = enrichMathSpans(contentBlock, style, resolved);

  // Resolve inline `:ref{…}` spans to their computed label so references
  // print their number in the running text. Each label becomes one atomic,
  // non-breaking token tagged with its `refResourceId` (handled by the
  // rich-text measurer), so we always take the rich path for ref blocks.
  if (contentBlock.spans.some((s) => s.ref)) {
    const spans = resolveRefSpans(contentBlock.spans, ctx.resourceNumbering, ctx.resourceTypes, ctx.resources, {
      bold: bodyStyle.referenceBold ?? true,
      italic: bodyStyle.referenceItalic ?? false,
      labelNumberGap: resolved.captionStyle.labelNumberGap,
      ...(ctx.anchorRefs ? { anchors: ctx.anchorRefs } : {}),
      breakLabels: resolved.crossRefs.breakLabels,
    });
    contentBlock = {
      ...contentBlock,
      // A paragraph style in capitals sets the labels so too (EF-173).
      spans: style.uppercase
        ? spans.map((s) => (s.ref ? { ...s, text: uppercasePreservingLength(s.text) } : s))
        : spans,
    };
  }

  // Footnote markers print their note's number as a superscript, or on
  // the baseline at `footnotes.markerSize` (`markerPosition: 'inline'`):
  // one atomic token tagged with the note id (`VDTLineSegment.footnoteId`).
  // A Japanese marker (JLReq §4.2.3) stands in the line gap beside the text
  // (`'side'`) or, down a vertical line, flush with its right side
  // (`'right'`; a superscript in horizontal text).
  if (contentBlock.spans.some((s) => s.footnote)) {
    const f = resolved.footnotes;
    const position = f.markerPosition === 'right' && !measuringVertically() ? 'superscript' : f.markerPosition;
    const inline = position !== 'superscript';
    const place = position === 'side' || position === 'right' ? position : undefined;
    const size = f.markerSize;
    const scale = !inline ? undefined
      : size.unit === 'em' || size.unit === 'rem' ? size.value
        : dimensionToPx(size, resolved.page.dpi, style.fontSizePx) / style.fontSizePx;
    contentBlock = {
      ...contentBlock,
      spans: contentBlock.spans.map((s) => (s.footnote
        ? inline
          ? {
              ...s,
              text: ctx.footnoteNumbers?.get(s.footnote.id) ?? '?',
              bold: false,
              italic: false,
              footnote: { id: s.footnote.id, ...(scale !== undefined && Math.abs(scale - 1) > 1e-6 ? { scale } : {}), ...(place ? { place } : {}) },
            }
          : { ...s, text: ctx.footnoteNumbers?.get(s.footnote.id) ?? '?', script: 'sup' as const, bold: false, italic: false }
        : s)),
    };
  }

  // Inline colour swatches: a palette id resolves to its hex here, and an
  // inline symbol's resource to its picture.
  if (contentBlock.spans.some((s) => s.swatch)) {
    contentBlock = { ...contentBlock, spans: resolveSwatchSpans(contentBlock.spans, resolved.colorPalette, ctx.resources, { dpi: resolved.page.dpi, fontSizePx: style.fontSizePx }) };
  }

  // Inline chips: the style resolves to a box sized against this text.
  if (contentBlock.spans.some((s) => s.chip)) {
    contentBlock = { ...contentBlock, spans: resolveChipSpans(contentBlock.spans, chipContextOf(resolved), style.fontSizePx) };
  }

  // A small-caps style (paragraph style, callout body) sets every span so.
  if (style.smallCaps && contentBlock.spans.some((s) => !s.smallCaps)) {
    contentBlock = { ...contentBlock, spans: contentBlock.spans.map((s) => (s.smallCaps ? s : { ...s, smallCaps: true })) };
  }

  // Chinese and Japanese annotations (#193–#195, #421): emphasis dots for
  // `*…*` and the region's mark, book-title brackets, the fonts of
  // readings and notes.
  if (hasAnnotations(contentBlock.spans, resolved.cjk)) {
    contentBlock = {
      ...contentBlock,
      spans: resolveAnnotationSpans(contentBlock.spans, { cjk: resolved.cjk, dpi: resolved.page.dpi, fontString: style.fontString, fontSizePx: style.fontSizePx }),
    };
  }
  return contentBlock;
}

/** The stanzas of the poem `raw` (a stanza of the line layout, #620) sets,
 *  in order, as content indices: the run of blocks around it that carry
 *  the same poem. */
export function poemStanzaIndices(contentBlocks: readonly ContentBlock[], raw: ContentBlock, blockIdx: number): number[] {
  const stanza = raw.verse?.stanza;
  const at = contentBlocks[blockIdx] === raw ? blockIdx : contentBlocks.indexOf(raw);
  if (!stanza || at < 0) return [];
  const of = (i: number) => contentBlocks[i]?.verse?.stanza;
  let from = at;
  while (from > 0 && of(from - 1)?.poem === stanza.poem && of(from - 1)!.index === of(from)!.index - 1) from--;
  let to = at;
  while (to + 1 < contentBlocks.length && of(to + 1)?.poem === stanza.poem && of(to + 1)!.index === of(to)!.index + 1) to++;
  return Array.from({ length: to - from + 1 }, (_, k) => from + k);
}
