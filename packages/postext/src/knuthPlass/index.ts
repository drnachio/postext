/**
 * Knuth-Plass optimal paragraph line-breaking algorithm.
 *
 * Replaces the greedy first-fit line breaker with a dynamic-programming
 * approach that minimizes total demerits across all lines of a paragraph,
 * producing more even word-spacing and fewer "loose" lines.
 */

export type {
  KPBox,
  KPGlue,
  KPPenalty,
  KPItem,
  KPOptions,
  RichTokenMeta,
} from './types';

export { computeBreakpoints } from './breakpoints';
export { pretextSegmentsToItems, reconstructPretextLines } from './pretextAdapter';
export { richTokensToItems, reconstructRichLines } from './richAdapter';
