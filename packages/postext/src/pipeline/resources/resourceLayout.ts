/**
 * Resource block layout (issue #49 §7 — Measurement).
 *
 * Turns a `Resource` + its computed number into a measured, placement-ready
 * {@link ResolvedResourceBlock}. The result is fully self-contained so the
 * canvas / PDF renderers can draw it synchronously without touching the parser
 * or numbering pipeline again.
 *
 * Layout rules for v1 (kept intentionally simple — see the issue plan):
 *  - bitmap / svg: scale to the column width, preserving aspect ratio. The
 *    height follows from the intrinsic dimensions; svgs without intrinsic
 *    dimensions fall back to a 4:3 box at column width.
 *  - table: columns split by `TableModel.columnWidths` weights (equal split
 *    when unset); each cell measured via the shared rich-text measurer; row
 *    height = max cell height (rowspans distribute across rows).
 *  - caption: measured via the rich-text measurer with the caption font, with
 *    the type's caption prefix + number prepended. Inline `:ref` spans resolve
 *    to their computed label and are tagged so renderers can colour / link them.
 *    Sits below the body by default or above it (`captionStyle.position`),
 *    optionally on a background bar spanning the block width. A resource type
 *    may override the caption style partially (`ResourceType.captionStyle`).
 *  - note: an optional smaller run (`Resource.note`) placed under the body when
 *    the caption is above, otherwise under the caption.
 *
 * Resource + caption + note are measured as one group; `totalHeight` is what
 * goes to placement. Figures paginate atomically; a table taller than the
 * page can be laid out as a *slice* of its rows (`ResourceLayoutInput.slice`)
 * — a continuation repeats the header rows and suffixes the caption, and a
 * slice that goes on sets a marker under it and holds the note back for the
 * last one. {@link planTableSlice} picks the rows a slice can carry from the
 * row metrics the full-table layout reports.
 */



export type { ResourceLayoutInput, TableSliceSpec, TableRowMetrics } from './resourceLayout/input.js';
export { resolveSwatchSpans, resolveSwatchBox, resolveRefLabel, resolveRefSpans } from './resourceLayout/refSpans.js';
export type { SwatchMetrics, AnchorRefContext } from './resourceLayout/refSpans.js';
export { snippetMathSpans, justifySnippetLine } from './resourceLayout/snippets.js';
export { computeColumnEdges, tableHeaderRowCount, tableSliceRows, planTableSlice, MIN_TAIL_ROWS, chooseTableSlice } from './resourceLayout/tableSlices.js';
export { layoutCaptionText, layoutLabelLines } from './resourceLayout/captions.js';
export type { CaptionTextInput, CaptionTextLayout, LabelLinesInput } from './resourceLayout/captions.js';
export { layoutResourceBlock, shiftResourceBlockX } from './resourceLayout/resourceBlock.js';
export type { ResourceBlockLayout } from './resourceLayout/resourceBlock.js';
