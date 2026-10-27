/**
 * Vertical text on the canvas (`VDTPage.flow`).
 *
 * `paintPage` paints a vertical page's flow through the page's frame — the
 * context turned a quarter turn clockwise (`ctx.transform(0, 1, -1, 0, W,
 * 0)`) — and switches the painter here on for as long as it does. Every
 * text painter of the backend calls {@link fillFlowText} instead of
 * `ctx.fillText`: on a horizontal page it IS `ctx.fillText`, with the same
 * arguments; inside a vertical flow it cuts the text into sideways runs
 * (Latin, numbers: painted as they are, which the frame turns sideways) and
 * cells (Han, punctuation, dashes, upright symbols), each cell its length
 * down the line (one em; half an em for the mainland interpunct), the
 * character turned back to stand upright about the cell's centre on the
 * font's central axis (`VDTFlowFrame.centralBaselines`). The runs are the
 * ones the text was measured with (`verticalRuns`), so each segment paints
 * within the width the layout gave it.
 *
 * Punctuation takes the font's vertical form (OpenType `vert`) through a
 * twin face the host registers with {@link registerVerticalAlternates} —
 * the same font file loaded under another family name with
 * `featureSettings: '"vert" 1, "fwid" 1'`, which Chrome 140+ applies to
 * canvas text. Without a twin, the fallbacks of `verticalOrientation`
 * apply: brackets and quotes turned about the em box's centre, mainland
 * pause and stop marks and Japanese small kana moved to the upper right of
 * the cell (each by its glyph's `offset`); so do they where the twin has
 * no vertical form for the character. A dash, an ellipsis or a wave dash stands in the
 * twin's vertical form when the font has one (Noto CJK's —— needs `fwid`
 * with `vert`: a rule down the middle of the cell), else it is turned
 * with its ink centred on the column's axis.
 */

export { setVerticalPaint, verticalPaintActive, verticalFlowAdvance, fillFlowText, drawUprightInBox } from './verticalText/painter.js';
export type { VerticalPaintState, TextPaintMode } from './verticalText/painter.js';
export { registerVerticalAlternates, unregisterVerticalAlternates, verticalAlternatesOf, verticalTwinName, VERTICAL_ALTERNATE_SAMPLE, loadVerticalAlternates } from './verticalText/alternates.js';
export type { VerticalAlternatesFace } from './verticalText/alternates.js';
