/**
 * `:::columns` in the running text (#634). A group outside a box sets its
 * blocks in N sub-columns of the text column (`span="column"`, the
 * default) or across the page (`span="page"`, a band of a multi-column
 * page, cut as a page-span box cuts it). The build wraps each such group
 * in a frameless box (a synthetic `:::callout` with one of the
 * {@link FLOW_COLUMNS_STYLE_ID} styles), so the callout machinery places
 * it, cuts it between its sub-columns when it does not fit (the group's
 * `flow`, see `columnsGroup.ts`) and, across the page, cuts the band. The
 * box has no frame, padding, title or icon; it never stays whole, and its
 * children are set in the text's own typography (`isFlowColumnsStyle`:
 * the box lends them no body or list style).
 */

import type { ContentBlock } from '../parse';
import type { CalloutStyleConfig, Dimension } from '../types';

/** Style ids of the frameless boxes of main-flow groups, in the text
 *  column and across the page. Not user styles: no configuration can
 *  name them. */
export const FLOW_COLUMNS_STYLE_ID = '__postext-flow-columns';
export const FLOW_COLUMNS_PAGE_STYLE_ID = '__postext-flow-columns-page';

/** Whether a callout style is a main-flow group's box. */
export function isFlowColumnsStyle(id: string): boolean {
  return id === FLOW_COLUMNS_STYLE_ID || id === FLOW_COLUMNS_PAGE_STYLE_ID;
}

/** Container ids of the synthetic boxes: past any id the parser hands out,
 *  between the listings' boxes and the page-span embeds'. */
const FLOW_COLUMNS_CONTAINER_BASE = 1_750_000_000;

const ZERO = { value: 0, unit: 'pt' as const };

/** The two boxes: in the column, the sub-columns `columnGapPx` apart (a
 *  body line by default); across the page, `pageGapPx` (the gutter). The
 *  space below is the body's paragraph spacing; a cut between children
 *  keeps `splitMinLines` lines of text on each side (the body's orphan and
 *  widow minimums). */
export function flowColumnsStyles(columnGapPx: number, pageGapPx: number, marginBottom: Dimension, splitMinLines: number): CalloutStyleConfig[] {
  const base = (id: string, span: 'column' | 'page', gapPx: number): CalloutStyleConfig => ({
    id,
    title: '',
    span,
    placement: 'here',
    backgroundEnabled: false,
    border: { enabled: false },
    borderRadius: ZERO,
    padding: { top: ZERO, right: ZERO, bottom: ZERO, left: ZERO },
    stripe: { enabled: false },
    icon: { kind: 'none' },
    marker: { kind: 'none' },
    marginTop: ZERO,
    marginBottom,
    keepTogether: false,
    splitMinLines: Math.max(1, Math.round(splitMinLines)),
    columnGap: { value: gapPx, unit: 'px' },
  });
  return [base(FLOW_COLUMNS_STYLE_ID, 'column', columnGapPx), base(FLOW_COLUMNS_PAGE_STYLE_ID, 'page', pageGapPx)];
}

/**
 * `blocks` with every `:::columns` group outside a box wrapped in a
 * synthetic frameless box (see the module comment): a group with
 * `span="page"` in the page-wide one, any other in the column one. A
 * group inside a box keeps to it. `wrapped` tells whether any was: the
 * build then adds the boxes' styles to the callout styles. The same
 * blocks come back when none is wrapped.
 */
export function wrapFlowColumns(blocks: readonly ContentBlock[]): { blocks: ContentBlock[]; wrapped: boolean } {
  if (!blocks.some((b) => b.type === 'containerStart' && b.containerName === 'columns')) {
    return { blocks: blocks as ContentBlock[], wrapped: false };
  }
  const out: ContentBlock[] = [];
  let openBoxes = 0;
  let wrapped = 0;
  /** The container id of the group being wrapped, and its box's. */
  let open: { group: number; box: number } | undefined;
  for (const b of blocks) {
    if (b.containerName === 'callout') {
      if (b.type === 'containerStart') openBoxes++;
      else if (b.type === 'containerEnd') openBoxes = Math.max(0, openBoxes - 1);
    }
    if (!open && openBoxes === 0 && b.type === 'containerStart' && b.containerName === 'columns' && b.containerId !== undefined) {
      const box = FLOW_COLUMNS_CONTAINER_BASE + wrapped++;
      open = { group: b.containerId, box };
      const span = b.containerAttrs?.span === 'page' ? 'page' : 'column';
      out.push({
        type: 'containerStart',
        text: '',
        spans: [],
        containerName: 'callout',
        containerAttrs: { type: span === 'page' ? FLOW_COLUMNS_PAGE_STYLE_ID : FLOW_COLUMNS_STYLE_ID, span, placement: 'here' },
        containerId: box,
        sourceStart: b.sourceStart,
        sourceEnd: b.sourceStart,
        sourceMap: [],
        ...(b.direction ? { direction: b.direction } : {}),
      }, b);
      continue;
    }
    out.push(b);
    if (open && b.type === 'containerEnd' && b.containerName === 'columns' && b.containerId === open.group) {
      out.push({
        type: 'containerEnd',
        text: '',
        spans: [],
        containerName: 'callout',
        containerId: open.box,
        sourceStart: b.sourceEnd,
        sourceEnd: b.sourceEnd,
        sourceMap: [],
      });
      open = undefined;
    }
  }
  // An unclosed group (the parser closes every container, so only a
  // malformed list) is closed at the end.
  if (open) out.push({ type: 'containerEnd', text: '', spans: [], containerName: 'callout', containerId: open.box, sourceStart: 0, sourceEnd: 0, sourceMap: [] });
  return wrapped > 0 ? { blocks: out, wrapped: true } : { blocks: blocks as ContentBlock[], wrapped: false };
}
