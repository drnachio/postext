/**
 * Float planning (issue #49 §7 — Placement, revised model).
 *
 * In the revised model a resource is *incorporated by reference*: the first
 * time it is mentioned (an inline `:ref` or a `::resource` directive, whichever
 * comes first in reading order) the engine floats it to a band at the top or
 * bottom of the page near that reference. The author never places it twice and
 * the running text flows past the reference uninterrupted.
 *
 * This module is the pure planning half: it resolves each resource's placement
 * and produces the ordered list of floats with the content-block index of their
 * first reference. The geometry (reserving page bands, positioning the float
 * blocks, deferring overflow to the next page) lives in the build pipeline,
 * which owns the VDT and measurement context.
 */

import type { ContentBlock } from '../parse';
import type {
  Resource,
  ResourceType,
  ResourceFloatPosition,
  ResourceFloatSpan,
} from '../types';

/** Resolved placement for a resource: never `undefined` fields. */
export interface ResolvedPlacement {
  position: ResourceFloatPosition;
  span: ResourceFloatSpan;
}

/** A planned float: the resource, its resolved placement, and the index of the
 *  content block where it is first referenced (its anchor). */
export interface PlannedFloat {
  resourceId: string;
  firstBlockIdx: number;
  position: 'top' | 'bottom';
  span: ResourceFloatSpan;
}

/** Resolve a resource's placement: own `placement` → its type's
 *  `defaultPlacement` → the built-in default (`top` / `column`). */
export function resolveResourcePlacement(
  resource: Resource,
  type: ResourceType | undefined,
): ResolvedPlacement {
  const position =
    resource.placement?.position ?? type?.defaultPlacement?.position ?? 'top';
  const span = resource.placement?.span ?? type?.defaultPlacement?.span ?? 'column';
  return { position, span };
}

/**
 * Walk the parsed blocks in reading order and produce the floats to place, in
 * first-reference order. A resource is floated when its resolved position is
 * `'top'` or `'bottom'`; `'here'` resources are left for inline `::resource`
 * placement and are not returned here. Resources with an unknown id or type are
 * skipped (the warnings phase surfaces those).
 */
export function computeFloatPlan(
  blocks: ContentBlock[],
  resources: Resource[],
  resourceTypes: ResourceType[],
): PlannedFloat[] {
  const resourceById = new Map<string, Resource>();
  for (const r of resources) resourceById.set(r.id, r);
  const typeById = new Map<string, ResourceType>();
  for (const t of resourceTypes) typeById.set(t.id, t);

  const plan: PlannedFloat[] = [];
  const seen = new Set<string>();

  const record = (resourceId: string, blockIdx: number) => {
    if (seen.has(resourceId)) return;
    seen.add(resourceId);
    const resource = resourceById.get(resourceId);
    if (!resource) return;
    const type = typeById.get(resource.typeId);
    const { position, span } = resolveResourcePlacement(resource, type);
    if (position === 'here') return;
    plan.push({ resourceId, firstBlockIdx: blockIdx, position, span });
  };

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (b.type === 'resourceBlock' && b.resourceId) record(b.resourceId, i);
    for (const span of b.spans) {
      if (span.ref?.resourceId) record(span.ref.resourceId, i);
    }
  }

  return plan;
}

/** The set of resource ids that float (so the build loop can skip their inline
 *  `::resource` placement). Derived from a {@link computeFloatPlan} result. */
export function floatedResourceIds(plan: PlannedFloat[]): Set<string> {
  return new Set(plan.map((f) => f.resourceId));
}
