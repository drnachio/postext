// The line-edge rules for text set outside the running text's measure
// options (#1463, #1519, #1542): captions, notes and table cells, wrapped
// lines of verse, contents and index entries.
import type { TextAlign } from '../../types.js';
import type { ResolvedConfig } from '../../vdt.js';
import type { MeasureBlockOptions } from '../../measure/index.js';
import { stackBreaking } from './stacks.js';
import { spaceBreaking } from './spaceBreaks.js';

/**
 * How a text set in `align` is broken while a composition rule of the line
 * breaker is avoided: stacks (`bodyText.stacks: 'avoid'`), a citation or a
 * lone operator at a line edge (`citationBreaks`, `operatorBreaks:
 * 'avoid'`). The line-by-line breaker cannot look back to avoid one, so the
 * text is broken whole on Knuth–Plass, justified within the word-spacing
 * limits, ragged with the right-hand glue ragged running text gets
 * (`optimalRagged`, whether or not the body text asks for it). Without
 * `optimalLineBreaking`, the rules alone, which the line-by-line breaker
 * keeps where it can (`measure/rich/greedyRules.ts`). Empty under any other
 * level of the rules, so the measurements keep their cache keys.
 */
export function lineEdgeBreaking(align: TextAlign, resolved: ResolvedConfig): MeasureBlockOptions {
  const body = resolved.bodyText;
  const stacks = stackBreaking(body);
  const spaceBreaks = spaceBreaking(body);
  if (!stacks && !spaceBreaks) return {};
  const rules = { ...(stacks ? { stacks } : {}), ...(spaceBreaks ? { spaceBreaks } : {}) };
  if (!body.optimalLineBreaking) return rules;
  if (align === 'justify') return { optimal: true, maxStretchRatio: body.maxWordSpacing, minShrinkRatio: body.minWordSpacing, ...rules };
  return { optimal: true, optimalRagged: true, ...rules };
}
