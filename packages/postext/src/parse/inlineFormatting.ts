export { REF_PLACEHOLDER, extractInlineRefs, injectRefSpans } from './inlineFormatting/crossRefs.js';
export type { RefMeta } from './inlineFormatting/crossRefs.js';
export { SWATCH_PLACEHOLDER, CHIP_PLACEHOLDER, withoutChips, FOOTNOTE_PLACEHOLDER, extractInlineFootnotes, injectFootnoteSpans, swatchShapeFromAttrs, extractInlineSwatches, TAB_PLACEHOLDER, extractInlineTabs, injectTabSpans, extractInlineChips, injectChipSpans, injectSwatchSpans } from './inlineFormatting/inlineDirectives.js';
export type { FootnoteMarkerMeta, SwatchMeta, TabMeta, ChipMeta } from './inlineFormatting/inlineDirectives.js';
export { BREAK_PLACEHOLDER, TITLE_BREAK_RE, SNIPPET_BREAK_RE, replaceTitleBreaks, directiveAttrRanges, titleBreakIndices, isCjkWideChar, charBefore, charFrom, suffixJoiner, joinsWide, flattenTitleBreaks, plainTitleBreak, plainTitleBreaks, flattenTitleBreakSpans, applyTitleBreaks, replaceSnippetBreaks, replaceBodyBreaks, BODY_BREAK_MARK, bodyBreakSpans } from './inlineFormatting/breaks.js';
export { protectEscapes, restoreEscapes, protectCodeSpans, INLINE_SMALLCAPS_RE, SMALLCAPS_OPENER, MARK_OPENER, readMarkAt, trimSpans, plainSpans, SUPERSCRIPT_RE, SUBSCRIPT_RE } from './inlineFormatting/markup.js';
export { stripInlineFormatting, protectDollarEscapes, parseInlineFormatting } from './inlineFormatting/parse.js';
export { linkHref } from './inlineFormatting/links.js';
