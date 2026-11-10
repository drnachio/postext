// Paragraphs the engine sets flush, without the first-line indent (#1444):
// the first after a heading or a `:::space` line when
// `bodyText.indentAfterHeading` is off, and one after a display formula
// when `math.indentAfterDisplay` is off. The engine looks past directives
// and markers to the block before; so does this, among the paragraph's
// siblings. (A paragraph written right under a formula's closing `$$`
// continues the interrupted one and is flush in any case:
// `ContentBlock.continuesParagraph`.)

import type { ContentBlock } from '../../../parse/types.js';
import type { WriterContext } from '../context.js';

type Sibling = { block: ContentBlock } | { container: ContentBlock };

/** Whether the paragraph at `i` of `nodes` is set flush. `lead` says
 *  whether the first of `nodes` would be: they open a `:::paragraphs`
 *  group that itself stands where a flush paragraph would (#1444), which
 *  the engine looks through as it does through directives. */
export function startsFlush(ctx: WriterContext, nodes: readonly Sibling[], i: number, lead = false): boolean {
  const afterHeading = !ctx.resolved.bodyText.indentAfterHeading;
  const afterDisplay = !ctx.resolved.math.indentAfterDisplay;
  if (!afterHeading && !afterDisplay) return false;
  for (let k = i - 1; k >= 0; k--) {
    const n = nodes[k]!;
    if (!('block' in n)) return false;
    const b = n.block;
    if (b.type === 'heading') return afterHeading;
    if (b.type === 'mathDisplay') return afterDisplay && k === i - 1;
    if (b.type !== 'directive') return false;
    if (b.directiveName === 'space') return afterHeading;
  }
  return lead;
}
