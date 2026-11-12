// The line-edge rules in the line-by-line breaker (#1542): what
// `bodyText.stacks`, `citationBreaks` and `operatorBreaks: 'avoid'` ask of
// a paragraph set word by word, when Knuth–Plass found no setting without a
// line past the measure (a word wider than it) or is not used at all. That
// breaker cannot look back to weigh a fault against the lines before it, so
// it does the one thing it can: where the line it would end breaks at a
// space before a numbered citation, inside one, beside a lone operator, or
// ends on the word (or the characters) the line above ends on, it ends the
// line at an earlier word space that keeps none of these, when one leaves
// the line full enough (see {@link ruleBackoff}).
import type { RichToken } from './tokens.js';
import type { MeasureBlockOptions } from '../types.js';
import { measuringVertically } from '../vertical.js';
import { spaceBreakDemerits } from '../../knuthPlass/spaceBreaks.js';
import { type Edge, OPAQUE, edgesStack, textEdges } from '../../knuthPlass/breakpoints/edges.js';

/** The rules a paragraph is broken under, read once. */
export interface GreedyRules {
  /** The word spaces a break costs at, by token index. */
  ruled: Map<number, number> | undefined;
  /** Characters two line ends must share to stack, when stacks are avoided. */
  stackChars: number | undefined;
  /** The end edge of the line set last. */
  prevEnd?: Edge;
}

/** A word space a line may end at (a tab is none, nor a code space). */
const breakSpace = (t: RichToken | undefined): boolean => t !== undefined && t.kind === 'space' && !t.tab;

/** The rules of `options` for `tokens`, or undefined when none is avoided
 *  (the common case: the breaker runs as before). */
export function greedyRules(tokens: readonly RichToken[], options: MeasureBlockOptions | undefined): GreedyRules | undefined {
  const costs = options?.spaceBreaks && !measuringVertically() ? options.spaceBreaks : undefined;
  const ruled = costs ? spaceBreakDemerits(tokens.map((t) => t.text), (i) => tokens[i]!.kind === 'space' && !tokens[i]!.fixedGlue, costs) : undefined;
  const stackChars = options?.stacks && options.stacks.demerits > 0 ? options.stacks.minChars : undefined;
  return ruled || stackChars !== undefined ? { ruled, stackChars } : undefined;
}

/** A line's text as stacks compare it: a formula, a swatch or a chip as a
 *  box with no letters, a footnote marker as nothing. */
function edgeText(tokens: readonly RichToken[]): string {
  return tokens.map((t) => (t.mathRender !== undefined || t.swatch !== undefined || t.chip !== undefined ? OPAQUE
    : t.footnoteId !== undefined ? '' : t.kind === 'space' ? ' ' : t.text)).join('').trimEnd();
}

/**
 * How many of `line`'s tokens to keep when the line would end at a word
 * space, so that it ends at an earlier one instead (undefined: keep the
 * break). `line[k]` is `tokens[start + k]` and `next` the index of the
 * token that did not fit. A break is a fault when one of the spaces it
 * consumes is ruled, or when the line ends as the one above does; the
 * latest earlier space with no fault is taken, if `full` accepts the line
 * it leaves (its width and word spaces).
 */
export function ruleBackoff(rules: GreedyRules, tokens: readonly RichToken[], start: number, line: readonly RichToken[], next: number, full: (width: number, spaces: number, spaceWidth: number) => boolean): number | undefined {
  // The spaces the break consumes: those closing the line, and the one
  // that did not fit.
  let end = line.length;
  while (end > 0 && breakSpace(line[end - 1])) end--;
  if (end === 0 || (end === line.length && !breakSpace(tokens[next]))) return undefined;
  const faulty = (keep: number, to: number): boolean => {
    for (let i = start + keep; i < to; i++) if (rules.ruled?.has(i)) return true;
    if (rules.stackChars === undefined || !rules.prevEnd) return false;
    return edgesStack(rules.prevEnd, textEdges(edgeText(line.slice(0, keep)), rules.stackChars, true));
  };
  let to = start + end;
  while (to < tokens.length && breakSpace(tokens[to])) to++;
  if (!faulty(end, to)) return undefined;
  for (let k = end - 1; k > 0; k--) {
    if (!breakSpace(line[k]) || breakSpace(line[k - 1])) continue;
    let after = k;
    while (after < line.length && breakSpace(line[after])) after++;
    if (faulty(k, start + after)) continue;
    let width = 0;
    let spaces = 0;
    let spaceWidth = 0;
    for (let i = 0; i < k; i++) {
      width += line[i]!.width;
      if (line[i]!.kind === 'space') {
        spaces++;
        spaceWidth += line[i]!.width;
      }
    }
    return full(width, spaces, spaceWidth) ? k : undefined;
  }
  return undefined;
}

/** Records the end edge of a line just set, for the next one. */
export function noteLineEnd(rules: GreedyRules, line: readonly RichToken[]): void {
  if (rules.stackChars !== undefined) rules.prevEnd = textEdges(edgeText(line), rules.stackChars, true);
}
