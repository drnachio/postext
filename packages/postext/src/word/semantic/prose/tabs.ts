// The body text's tab stops as Word tab stops (#1444): a `:tab` in a
// paragraph or list item reaches the stop the engine sets it to (marks set
// flush with the column's end on an exam paper). Positions are measured
// from the column's start, as Word measures them from the margin; a
// percentage is of the column. Decimal stops are set as end stops.

import type { ContentBlock } from '../../../parse/types.js';
import type { WriterContext } from '../context.js';
import { px, type ParaProps } from '../wml.js';

const ALIGN = { start: 'left', end: 'right', center: 'center', decimal: 'right' } as const;

/** The tab stops of a block that holds a tab, in a column `widthTwips`
 *  wide; undefined when it holds none or the body sets no stops. */
export function bodyTabs(ctx: WriterContext, b: ContentBlock, widthTwips: number): ParaProps['tabs'] {
  const stops = ctx.resolved.bodyText.tabStops;
  if (!stops?.length || !b.spans.some((s) => s.tab)) return undefined;
  const tabs: NonNullable<ParaProps['tabs']> = [];
  for (const stop of stops) {
    const p = stop.position;
    const pos =
      p === 'end' ? widthTwips
      : typeof p === 'string' ? (widthTwips * parseFloat(p)) / 100
      : (px(ctx.units, p, ctx.styles.bodyPx) * 1440) / ctx.units.dpi;
    if (Number.isFinite(pos) && pos > 0) tabs.push({ val: ALIGN[stop.align ?? 'start'], pos: Math.min(widthTwips, pos) });
  }
  return tabs.length ? tabs : undefined;
}
