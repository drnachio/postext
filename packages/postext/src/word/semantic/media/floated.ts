// Resources the text only cites (#1444). In the book a `:ref` floats the
// resource it names into the first free slot after the reference (see
// `computeFloatPlan`); the semantic .docx has no pages to float into, so
// such a resource is written once, as a figure, right after the top-level
// block that holds its first reference (after the whole list or box when
// the reference stands inside one). The figure has no source of its own:
// its label is generated text and its caption, note and table cells map to
// the resource's fields, so re-importing an unchanged export changes
// nothing.

import type { ContentBlock } from '../../../parse/types.js';
import { resolveResourcePlacement } from '../../../pipeline/floats/floatPlacement.js';
import { resourceRefId } from '../../../pipeline/references/crossRefs.js';
import type { Resource, ResourceType } from '../../../types.js';
import type { Node } from '../blocks.js';
import type { WriterContext } from '../context.js';
import { renderFloatedResource } from './figures.js';

/**
 * The resources a `:ref` floats in the book: cited by one, shown by no
 * `::resource` / `:::figure` block of any chapter, and not placed `here`
 * (the engine sets a `here` resource only where a block stands: one that is
 * only cited is on no page).
 */
export function floatedResources(chapters: readonly { blocks: readonly ContentBlock[] }[], resources: ReadonlyMap<string, Resource>, types: readonly ResourceType[]): Set<string> {
  const shown = new Set<string>();
  const cited = new Set<string>();
  const isResource = (id: string): boolean => resources.has(id);
  for (const ch of chapters) {
    for (const b of ch.blocks) {
      if (b.type === 'resourceBlock' && b.resourceId) shown.add(b.resourceId);
      for (const id of refIds(b, isResource)) cited.add(id);
    }
  }
  const typeById = new Map(types.map((t) => [t.id, t]));
  const out = new Set<string>();
  for (const id of cited) {
    const res = resources.get(id);
    if (!res || shown.has(id)) continue;
    if (resolveResourcePlacement(res, typeById.get(res.typeId)).position === 'here') continue;
    out.add(id);
  }
  return out;
}

/** The resource ids a block's `:ref`s name, in reading order. */
function refIds(b: ContentBlock, isResource: (id: string) => boolean): string[] {
  const out: string[] = [];
  for (const s of b.spans) if (s.ref && !s.ref.anchor && s.ref.resourceId) out.push(resourceRefId(s.ref.resourceId, isResource));
  return out;
}

function collect(nodes: readonly Node[], into: ContentBlock[]): void {
  for (const n of nodes) {
    if ('block' in n) into.push(n.block);
    else collect(n.children, into);
  }
}

/** The figures of the floated resources first cited inside `nodes` (a
 *  top-level block, list or box), each written once in the book. */
export function floatedAfter(ctx: WriterContext, nodes: readonly Node[]): string[] {
  if (!ctx.floated.size) return [];
  const blocks: ContentBlock[] = [];
  collect(nodes, blocks);
  const out: string[] = [];
  const isResource = (id: string): boolean => ctx.resources.has(id);
  for (const b of blocks) {
    for (const id of refIds(b, isResource)) {
      if (!ctx.floated.has(id) || ctx.floatedPlaced.has(id)) continue;
      ctx.floatedPlaced.add(id);
      out.push(renderFloatedResource(ctx, id, ctx.textTwips));
    }
  }
  return out;
}
