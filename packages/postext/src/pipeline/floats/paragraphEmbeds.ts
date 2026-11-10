/**
 * Resources placed after the paragraph that cites them
 * (`placement.position: 'paragraph'`): set inline, in the text column,
 * right after the block of their first reference — as if a `::resource`
 * directive followed it. No directive is needed: this pass, run before the
 * layout, inserts one (a `resourceBlock` with a zero-width source range at
 * the end of the citing block), so every index the layout keys by is
 * computed on the blocks it sets.
 *
 * Where the citing block is the first of a run that reads as one, the
 * resource waits for the run's end: the rest of a list (a figure never
 * splits a list), the paragraph a display formula continues, and the box
 * or `:::paragraphs` group the citation sits in (the figure goes after
 * it, in the main flow). A resource whose first reference is its own
 * `::resource` directive is set there, as `here` would; a later directive
 * for a resource this pass placed is only a reference, and is dropped.
 */

import type { ContentBlock } from '../../parse/index.js';
import type { Resource, ResourceType } from '../../types.js';
import { resourceRefId } from '../references/crossRefs.js';
import { resolveResourcePlacement } from './floatPlacement.js';

/** Containers a resource placed after its paragraph steps out of. */
const STEP_OUT = new Set(['callout', 'paragraphs', 'columns']);

/** The block after which a resource first cited in `blocks[i]` is set. */
function anchorAfter(blocks: readonly ContentBlock[], i: number): number {
  let j = i;
  for (let guard = 0; guard < blocks.length; guard++) {
    const here = blocks[j]!;
    const next = blocks[j + 1];
    if (!next) break;
    // The rest of the list.
    if (here.type === 'listItem' && next.type === 'listItem') { j++; continue; }
    // A display formula the paragraph goes on after.
    if (next.type === 'mathDisplay' && blocks[j + 2]?.continuesParagraph) { j += 2; continue; }
    // Out of the box or group the citation sits in.
    if (next.type === 'containerEnd' && next.containerName && STEP_OUT.has(next.containerName)) { j++; continue; }
    break;
  }
  return j;
}

/** `blocks` with a `resourceBlock` after the citing block of every
 *  resource placed `paragraph` (see the module comment). `incorporated`:
 *  resources the preceding content already took in, only referred to
 *  here. The same array comes back when no resource is placed so. */
export function insertParagraphEmbeds(
  blocks: readonly ContentBlock[],
  resources: readonly Resource[],
  resourceTypes: readonly ResourceType[],
  incorporated: ReadonlySet<string> = new Set(),
): ContentBlock[] {
  const resourceById = new Map(resources.map((r) => [r.id, r]));
  const typeById = new Map(resourceTypes.map((t) => [t.id, t]));
  const afterParagraph = (id: string): boolean => {
    const r = resourceById.get(id);
    return !!r && resolveResourcePlacement(r, typeById.get(r.typeId)).position === 'paragraph';
  };
  if (!resources.some((r) => afterParagraph(r.id))) return blocks as ContentBlock[];

  const seen = new Set(incorporated);
  /** Block index → the resources set after it, in citation order. */
  const inserts = new Map<number, string[]>();
  /** Resources this pass sets: their `::resource` directives are dropped. */
  const placed = new Set<string>();
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'resourceBlock' && b.resourceId) {
      seen.add(b.resourceId);
      continue;
    }
    for (const span of b.spans) {
      const ref = span.ref?.resourceId;
      if (!ref) continue;
      const id = resourceRefId(ref, (x) => resourceById.has(x));
      if (seen.has(id)) continue;
      seen.add(id);
      if (!afterParagraph(id)) continue;
      const at = anchorAfter(blocks, i);
      inserts.set(at, [...(inserts.get(at) ?? []), id]);
      placed.add(id);
    }
  }
  if (placed.size === 0) return blocks as ContentBlock[];

  const out: ContentBlock[] = [];
  blocks.forEach((b, i) => {
    if (!(b.type === 'resourceBlock' && b.resourceId && placed.has(b.resourceId))) out.push(b);
    for (const id of inserts.get(i) ?? []) {
      out.push({ type: 'resourceBlock', text: '', spans: [], resourceId: id, sourceStart: b.sourceEnd, sourceEnd: b.sourceEnd, sourceMap: [] });
    }
  });
  return out;
}
