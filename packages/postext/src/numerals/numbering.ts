export { EAST_ASIAN_NUMERAL_STYLES, ARABIC_NUMERAL_STYLES } from './numbering/styles.js';
export type { EastAsianNumeralStyle, ArabicNumeralStyle, NumeralStyle, SpelledNumeralStyle, CounterStyle, NumberFormatStyle } from './numbering/styles.js';
export { chineseInformalStyle, hanInformalStyle, parseNumberFormat, toOrderedListNumberFormat } from './numbering/formats.js';
export { counterStyleOf, isCounterStyle, formatCounter, parseTemplate, documentNumeralStyle, formatNumeral, renderCounterTemplate } from './numbering/counters.js';
export type { RenderPiece } from './numbering/counters.js';
export { headingCounterStart, nextHeadingCounter, computeHeadingNumbering, computeHeadingNumbers } from './numbering/headings.js';
export type { HeadingTemplates, HeadingCounterStart, HeadingNumberingOptions, HeadingNumbering } from './numbering/headings.js';
export { buildPageLabels, collectPageLabelRuns } from './numbering/pageLabels.js';
export type { PageNumberSegment, PageLabelInfo, PageLabelRun } from './numbering/pageLabels.js';
