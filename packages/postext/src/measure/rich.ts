export { isSwatchFill, swatchSidePx, pickSpanFont, SCRIPT_SIZE_RATIO, SUPERSCRIPT_SHIFT_RATIO, SUBSCRIPT_SHIFT_RATIO, STACKED_SUBSCRIPT_SHIFT_RATIO, scaledFont, scriptMetrics, stackedScriptPairs, SMALL_CAPS_SIZE_RATIO, smallCapsFont, smallCapsRuns, smallCapsWidth, textWidth, expandSmallCaps } from './rich/tokens.js';
export type { RichBreakPoint, RichToken, PendingSegment } from './rich/tokens.js';
export { CHIP_ASCENT_RATIO, CHIP_DESCENT_RATIO, chipToken } from './rich/chips.js';
export { URL_LIKE_RE, urlBreakIndices, emergencySplit } from './rich/wordBreaks.js';
export { spanScriptFields, setsObject, sidewaysNumberSpans, atomicSpanToken, refLabelTokens, tokenSegment, setLabelTabs } from './rich/spanTokens.js';
export { measureRichBlock, measureRichSnippet } from './rich/measure.js';
export { tabsAsSpaces } from './rich/tabsAndBidi.js';
