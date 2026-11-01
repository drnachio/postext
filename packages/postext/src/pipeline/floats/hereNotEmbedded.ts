/**
 * Resources placed `here` that the text only cites (#1365). A resource whose
 * placement is `position: 'here'` is set where a `::resource` line stands
 * and never floats (`computeFloatPlan`): one the document refers to with a
 * `:ref` and never embeds is on no page. It is not floated to the citation
 * instead: `here` asks for the place the author writes, and in a book a
 * later chapter may embed it, which would print it twice. The build warns.
 */

import type { ContentBlock } from '../../parse/index.js';
import type { Resource, ResourceType } from '../../types.js';
import { resolveResourcePlacement } from './floatPlacement.js';
import { resourceRefId } from '../references/crossRefs.js';

/** A `here` resource cited and never embedded: its first `:ref`, as the
 *  content block holding it and the source range of the reference (body
 *  offsets, front matter excluded). */
export interface HereNotEmbedded {
  resourceId: string;
  blockIdx: number;
  sourceStart: number;
  sourceEnd: number;
}

/**
 * The resources of `resources` placed `here` that a `:ref` of `blocks`
 * cites while no `::resource` of `blocks` embeds them, in the order of their
 * first reference. `incorporated` holds the resources the preceding content
 * already placed (`continuation.resourceNumbers`): a chapter citing a
 * figure an earlier chapter set is right.
 */
export function hereResourcesNotEmbedded(
  blocks: readonly ContentBlock[],
  resources: readonly Resource[],
  resourceTypes: readonly ResourceType[],
  incorporated?: ReadonlySet<string>,
): HereNotEmbedded[] {
  if (resources.length === 0) return [];
  const byId = new Map(resources.map((r) => [r.id, r]));
  const embedded = new Set<string>();
  for (const b of blocks) if (b.type === 'resourceBlock' && b.resourceId) embedded.add(b.resourceId);
  const typeById = new Map(resourceTypes.map((t) => [t.id, t]));
  const out: HereNotEmbedded[] = [];
  const seen = new Set<string>();
  blocks.forEach((b, blockIdx) => {
    let plain = 0;
    for (const span of b.spans) {
      const at = plain;
      plain += span.text.length;
      if (!span.ref?.resourceId) continue;
      const id = resourceRefId(span.ref.resourceId, (x) => byId.has(x));
      const resource = byId.get(id);
      if (!resource || seen.has(id)) continue;
      seen.add(id);
      if (embedded.has(id) || incorporated?.has(id)) continue;
      if (resolveResourcePlacement(resource, typeById.get(resource.typeId)).position !== 'here') continue;
      const start = b.sourceMap[at] ?? b.sourceStart;
      // The reference ends where the text after it starts (its own text,
      // the number it prints, maps to its opening).
      const next = b.sourceMap[plain];
      out.push({ resourceId: id, blockIdx, sourceStart: start, sourceEnd: next !== undefined && next > start ? next : b.sourceEnd });
    }
  });
  return out;
}
