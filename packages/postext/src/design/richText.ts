// Design text with inline marks (`inlineMarks: true`): the resolved text is
// read as inline Markdown — bold, italic, superscript, subscript, and in
// vertical text the orientation marks `:tcy`, `:upright`, `:sideways` — and
// laid out as runs, each in its own font. The plain path in `layout.ts`
// measures whole strings; here every width is the sum of per-run widths,
// exactly as the renderers paint the runs one after another.



export { richFontSet, parseRichDesignText, plainDesignText, richDesignSpans } from './richText/parse.js';
export type { DesignTextRun, DesignChipContext, RichDesignText, RichFontSpec } from './richText/parse.js';
export { RichMeasurer } from './richText/measure.js';
export type { RichLine } from './richText/measure.js';
export { wrapRich } from './richText/wrap.js';
export { ellipsisEndCut, ellipsisStartCut, ellipsisMiddleCut, singleRichLine } from './richText/ellipsis.js';
