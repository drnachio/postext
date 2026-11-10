// Stacks in the line breaker (#1463): what `bodyText.stacks: 'avoid'`
// hands it. Under `'allow'` and `'warn'` nothing, so the breaker does no
// extra work and the measurement cache keys stay as they were; nor under
// `'avoid'` with `stackPenalty: 0`, where a stack costs nothing.
import type { ResolvedBodyTextConfig } from '../../types.js';

/** The stacks the breaker weighs for this body text, or undefined. */
export function stackBreaking(body: Pick<ResolvedBodyTextConfig, 'stacks' | 'stackMinCharacters' | 'stackPenalty'>): { minChars: number; demerits: number } | undefined {
  return body.stacks === 'avoid' && body.stackPenalty > 0 ? { minChars: body.stackMinCharacters, demerits: body.stackPenalty } : undefined;
}
