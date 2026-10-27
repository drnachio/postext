// A resource's caption, note and continued marker measured at the body's
// width, with the heights they add (#1278: split out of resourceBlock.ts).
import { layoutCaptionText } from '../captions.js';
import { type VDTLine, createBoundingBox, type VDTTableSlice } from '../../../../vdt.js';
import { dimensionToPx } from '../../../../units.js';
import { buildFontString, measureRichBlock } from '../../../../measure/index.js';
import { annotatedSpans, resolveSwatchSpans, resolveRefSpans } from '../refSpans.js';
import { resolveChipSpans, chipContextOf } from '../../../text/chips.js';
import { snippetMathSpans, measureSnippetLines } from '../snippets.js';
import { resolveCitationSpans } from '../../../references/citations.js';
import { withSnippetInlineCode } from '../../../code/codeInline.js';
import { parseInlineSnippetSpans } from '../../../../parse/inlineSnippet.js';
import type { InlineSpan } from '../../../../parse/index.js';
import type { ResourceLayoutInput } from '../input.js';
import type { Resource } from '../../../../types/resources/resources.js';
import type { ResourceType } from '../../../../types/resources/resourceTypes.js';
import type { ResolvedConfig } from '../../../../vdt/document.js';
import type { ResourceNumberingMap } from '../../resourceNumbering.js';
import type { ColorPaletteEntry } from '../../../../types/page.js';
import type { ResolvedTableStyleConfig } from '../../../../types/resources/tableStyles.js';
import type { ResourceBlockState } from './state.js';

/** What createCaptionNotes takes from the pass. */
export interface CaptionNotesDeps {
  input: ResourceLayoutInput;
  resource: Resource;
  resourceType: ResourceType | undefined;
  number: string;
  resolved: ResolvedConfig;
  resourceNumbering: ResourceNumberingMap;
  resourceTypes: ResourceType[];
  resources: Resource[];
  columnWidth: number;
  palette: ColorPaletteEntry[] | undefined;
  slice: VDTTableSlice | undefined;
  tableStyle: ResolvedTableStyleConfig;
  dpi: number;
  normalWeight: string;
  boldWeight: string;
  lineHeightRatio: number;
  refStyle: { bold: boolean; italic: boolean; labelNumberGap: string; breakLabels: boolean; };
  inside: { bodyMax: number; captionWidth: number; captionX: number; right: boolean; } | undefined;
  state: ResourceBlockState;
}

export function createCaptionNotes(deps: CaptionNotesDeps) {
  const {
    input, resource, resourceType, number, resolved, resourceNumbering, resourceTypes, resources,
    columnWidth, palette, slice, tableStyle, dpi, normalWeight, boldWeight, lineHeightRatio,
    refStyle, inside, state
  } = deps;
  // --- Caption -----------------------------------------------------------
  // A continued table slice: "Table 6-4. Title (cont.)" — the suffix is
  // set in italics after the description, glued to it by a plain space,
  // or solid when it opens with a wide character (表1-1　标题（续）).
  const suffix = slice?.continued ? tableStyle.continuedSuffix.trim() : '';
  const caption = layoutCaptionText({
    text: resource.caption ?? '',
    resourceType,
    number,
    resolved,
    width: input.captionAside?.width ?? inside?.captionWidth ?? input.captionWidth ?? columnWidth,
    resourceNumbering,
    resourceTypes,
    resources,
    ...(input.captionCitations?.get(resource.id)?.caption ? { citations: input.captionCitations.get(resource.id)!.caption } : {}),
    ...(suffix.length > 0 ? { suffix } : {}),
  });
  const cs = caption.style;
  const captionGapPx = caption.gapPx;
  const captionPaddingPx = caption.paddingPx;
  const { fontString: captionFontString, boldFontString: captionBoldFontString, italicFontString: captionItalicFontString, boldItalicFontString: captionBoldItalicFontString } = caption.fonts;
  const captionPrefix = resourceType?.captionPrefix ?? '';
  const linkColor = caption.linkColor;
  const measuredCaption: VDTLine[] = caption.lines;
  const captionBandHeight = caption.bandHeight;
  const captionHeight = captionBandHeight > 0 ? captionBandHeight + captionGapPx : 0;

  // --- Note --------------------------------------------------------------
  const noteFontPx = dimensionToPx(cs.note.fontSize, dpi);
  const noteLineHeightPx = noteFontPx * lineHeightRatio;
  const noteGapPx = dimensionToPx(cs.note.gap, dpi, noteFontPx);
  const noteFontString = buildFontString(cs.fontFamily, noteFontPx, normalWeight);
  const noteBoldFontString = buildFontString(cs.fontFamily, noteFontPx, boldWeight);
  const noteItalicFontString = buildFontString(cs.fontFamily, noteFontPx, normalWeight, 'italic');
  const noteBoldItalicFontString = buildFontString(cs.fontFamily, noteFontPx, boldWeight, 'italic');
  state.measuredNote = [];
  const noteText = resource.note ?? '';
  // The note closes the table: a slice that continues holds it back for
  // the last slice.
  if (noteText.trim().length > 0 && !slice?.continues) {
    const noteSpans = annotatedSpans(resolveChipSpans(resolveSwatchSpans(resolveRefSpans(
      snippetMathSpans(
        resolveCitationSpans(
          withSnippetInlineCode(parseInlineSnippetSpans(noteText, { citations: true }), noteText, resolved.codeStyle?.inline, dpi, noteFontPx),
          input.captionCitations?.get(resource.id)?.note,
        ),
        noteFontPx,
        noteLineHeightPx,
        resolved.math,
      ),
      resourceNumbering,
      resourceTypes,
      resources,
      refStyle,
    ), palette, resources, { dpi, fontSizePx: noteFontPx }), chipContextOf(resolved), noteFontPx), { cjk: resolved.cjk, dpi }, noteFontString);
    const slanted: InlineSpan[] = cs.note.italic
      ? noteSpans.map((s) => ({ ...s, italic: s.italic || true }))
      : noteSpans;
    state.measuredNote = measureSnippetLines(
      slanted,
      [noteFontString, noteBoldFontString, noteItalicFontString, noteBoldItalicFontString],
      Math.max(1, input.captionAside?.width ?? inside?.captionWidth ?? input.captionWidth ?? columnWidth),
      noteLineHeightPx,
      { textAlign: cs.note.align },
    );
  }
  const noteHeight = state.measuredNote.length > 0
    ? state.measuredNote.length * noteLineHeightPx + noteGapPx
    : 0;

  // --- Continues marker --------------------------------------------------
  // "Continued" under a slice that goes on: the note's typeface and size,
  // italic, flush right — where the note would sit.
  state.measuredContinues = [];
  const ts = tableStyle;
  const markerText = slice?.continues && ts.continuesMarkerEnabled ? ts.continuesMarker.trim() : '';
  if (markerText.length > 0) {
    const measured = measureRichBlock(
      [{ text: markerText, bold: false, italic: true }],
      noteFontString,
      noteBoldFontString,
      noteItalicFontString,
      noteBoldItalicFontString,
      Math.max(1, columnWidth),
      noteLineHeightPx,
      { textAlign: 'left' },
    );
    // Flush right: the measurer has no right alignment, so each line is
    // pushed to the block's right edge by its own width.
    state.measuredContinues = measured.lines.map((line) => ({
      ...line,
      bbox: createBoundingBox(columnWidth - line.bbox.width, line.bbox.y, line.bbox.width, line.bbox.height),
    }));
  }
  const continuesHeight = state.measuredContinues.length > 0
    ? state.measuredContinues.length * noteLineHeightPx + noteGapPx
    : 0;
  return {
    cs, captionGapPx, captionPaddingPx, captionFontString, captionBoldFontString,
    captionItalicFontString, captionBoldItalicFontString, captionPrefix, linkColor, measuredCaption,
    captionBandHeight, captionHeight, noteGapPx, noteFontString, noteBoldFontString,
    noteItalicFontString, noteBoldItalicFontString, noteHeight, continuesHeight
  };
}
