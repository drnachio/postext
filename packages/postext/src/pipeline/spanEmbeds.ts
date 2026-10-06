/**
 * Inline `::resource` embeds that span the page (#535): a resource placed
 * `here` with `span: 'page'` is set across the page where its directive
 * stands, the way a page-span box is: the text columns above it close level
 * and the flow goes on in the band below. The build wraps each such
 * directive in a frameless page-span box (a synthetic `:::callout` with the
 * {@link SPAN_EMBED_STYLE_ID} style), so the span-block machinery — level
 * cuts, band caps, moves to the next page — places it. On a one-column
 * page the box falls back to the flow, at the full measure the embed took
 * already.
 */

import type { ContentBlock } from '../parse';
import type { CalloutStyleConfig, Resource, ResourceType } from '../types';
import { resolveResourcePlacement } from './floatPlacement';

/** Style id of the frameless box that carries a page-span embed. Not a
 *  user style: no configuration can name it. */
export const SPAN_EMBED_STYLE_ID = '__postext-span-embed';

/** Container ids of the synthetic boxes: far past any id the parser hands
 *  out (and past the chapter-end notes' base). */
const SPAN_EMBED_CONTAINER_BASE = 2_000_000_000;

const ZERO = { value: 0, unit: 'pt' as const };

/** The box: no frame, padding, title or icon, never split or floated; the
 *  gap of an inline resource (`gapPx`, a body line) above it, and below it
 *  unless `layout.inlineResourceGap` is `'above'` (`gapBelow`). */
export function spanEmbedStyle(gapPx: number, gapBelow: boolean): CalloutStyleConfig {
  return {
    id: SPAN_EMBED_STYLE_ID,
    title: '',
    span: 'page',
    placement: 'here',
    backgroundEnabled: false,
    border: { enabled: false },
    borderRadius: ZERO,
    padding: { top: ZERO, right: ZERO, bottom: ZERO, left: ZERO },
    stripe: { enabled: false },
    icon: { kind: 'none' },
    marker: { kind: 'none' },
    marginTop: { value: gapPx, unit: 'px' },
    marginBottom: gapBelow ? { value: gapPx, unit: 'px' } : ZERO,
    keepTogether: true,
  };
}

/** Whether `block` is a `::resource` directive the build sets across the
 *  page (its resource placed `here`, `span: 'page'`). */
function spansPage(
  block: ContentBlock,
  resourceById: ReadonlyMap<string, Resource>,
  typeById: ReadonlyMap<string, ResourceType>,
): boolean {
  if (block.type !== 'resourceBlock' || !block.resourceId) return false;
  const resource = resourceById.get(block.resourceId);
  if (!resource) return false;
  const placement = resolveResourcePlacement(resource, typeById.get(resource.typeId));
  return placement.position === 'here' && placement.span === 'page';
}

/**
 * `blocks` with every page-span inline embed wrapped in a synthetic
 * page-span box. An embed inside a box keeps to it (the box's own span
 * decides). `wrapped` tells whether any was: the build then adds the
 * box's style to the callout styles. The same blocks come back when none
 * is wrapped.
 */
export function wrapPageSpanEmbeds(
  blocks: readonly ContentBlock[],
  resources: readonly Resource[],
  resourceTypes: readonly ResourceType[],
): { blocks: ContentBlock[]; wrapped: boolean } {
  if (resources.length === 0 || !blocks.some((b) => b.type === 'resourceBlock')) return { blocks: blocks as ContentBlock[], wrapped: false };
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const typeById = new Map(resourceTypes.map((t) => [t.id, t]));
  const out: ContentBlock[] = [];
  let openBoxes = 0;
  let wrapped = 0;
  for (const b of blocks) {
    if (b.containerName === 'callout') {
      if (b.type === 'containerStart') openBoxes++;
      else if (b.type === 'containerEnd') openBoxes = Math.max(0, openBoxes - 1);
    }
    if (openBoxes > 0 || !spansPage(b, resourceById, typeById)) { out.push(b); continue; }
    const containerId = SPAN_EMBED_CONTAINER_BASE + wrapped++;
    const marker = (type: 'containerStart' | 'containerEnd', at: number): ContentBlock => ({
      type,
      text: '',
      spans: [],
      containerName: 'callout',
      ...(type === 'containerStart' ? { containerAttrs: { type: SPAN_EMBED_STYLE_ID, span: 'page', placement: 'here' } } : {}),
      containerId,
      sourceStart: at,
      sourceEnd: at,
      sourceMap: [],
    });
    out.push(marker('containerStart', b.sourceStart), b, marker('containerEnd', b.sourceEnd));
  }
  return wrapped > 0 ? { blocks: out, wrapped: true } : { blocks: blocks as ContentBlock[], wrapped: false };
}
