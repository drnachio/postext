// Citation and operator breaks in the line breaker (#1519): what
// `bodyText.citationBreaks` and `operatorBreaks: 'avoid'` hand it. Under
// `'allow'` and `'warn'` nothing, so the breaker does no extra work and the
// measurement cache keys stay as they were; nor under `'avoid'` with a
// penalty of 0, where such a break costs nothing.
import type { ResolvedBodyTextConfig } from '../../types.js';
import type { SpaceBreakCosts } from '../../knuthPlass/spaceBreaks.js';

type Rules = Pick<ResolvedBodyTextConfig, 'citationBreaks' | 'citationBreakPenalty' | 'operatorBreaks' | 'operatorBreakPenalty'>;

/** What the breaker charges for a break at those spaces, or undefined. */
export function spaceBreaking(body: Rules): SpaceBreakCosts | undefined {
  const citations = body.citationBreaks === 'avoid' ? body.citationBreakPenalty : 0;
  const operators = body.operatorBreaks === 'avoid' ? body.operatorBreakPenalty : 0;
  return citations > 0 || operators > 0 ? { citations, operators } : undefined;
}
