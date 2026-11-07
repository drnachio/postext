// The space around and between list items, as the engine sets it (#1444):
// the list's `marginTop` above its first item, its `marginBottom` under the
// last, and between two items the item spacing of the shallower list (the
// item after a nested list takes its own list's spacing). A list in a box
// takes the box style's `lists`. The items' paragraphs carry it directly:
// Word's contextual spacing would drop it between items of one style.

import type { ContentBlock } from '../../../parse/types.js';
import type { ResolvedConfig } from '../../../vdt.js';
import type { ResolvedCalloutStyleConfig } from '../../../types.js';
import { deriveCalloutResolvedConfig } from '../../../pipeline/callouts/calloutLayout/plan.js';
import { listItemGapPx } from '../../../pipeline/text/lists.js';
import type { WriterContext } from '../context.js';
import { px, type ParaProps } from '../wml.js';

/** The `before` and `after` of each item of a run of list items. */
export function listItemSpacing(ctx: WriterContext, items: readonly ContentBlock[], box: ResolvedCalloutStyleConfig | undefined): Pick<ParaProps, 'before' | 'after' | 'contextualSpacing'>[] {
  const r: ResolvedConfig = box ? deriveCalloutResolvedConfig(ctx.resolved, box) : ctx.resolved;
  const u = ctx.units;
  const tw = (pxValue: number): number => Math.max(0, Math.round((pxValue * 1440) / u.dpi));
  const listOf = (b: ContentBlock) => (b.listKind === 'ordered' ? r.orderedLists : r.unorderedLists);
  const spacing = (b: ContentBlock): number => px(u, listOf(b).itemSpacing, ctx.styles.bodyPx);
  return items.map((b, i) => {
    const next = items[i + 1];
    const after = next
      ? listItemGapPx({ spacingPx: spacing(b), depth: b.depth ?? 1 }, { spacingPx: spacing(next), depth: next.depth ?? 1 })
      : px(u, listOf(items[0]!).marginBottom, ctx.styles.bodyPx);
    return {
      ...(i === 0 ? { before: tw(px(u, listOf(b).marginTop, ctx.styles.bodyPx)) } : {}),
      after: tw(after),
      contextualSpacing: false,
    };
  });
}
